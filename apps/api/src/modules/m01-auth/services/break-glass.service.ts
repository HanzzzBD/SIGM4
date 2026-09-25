// BreakGlassService — perintah CLI berakses shell server (`SDD-SESS-11`, `PR-02-08`):
// pemulihan darurat Administrator (`FR-01.6`, `BR-070b`) dan penerbitan kode aktivasi 2FA
// darurat (`FR-01.5 A6`, `BR-070d`). TIDAK PERNAH dipanggil dari jalur HTTP — hanya dari
// `worker/cli.ts`, lewat pintu `buatBreakGlassCli` (`routes.ts`).
//
// Tidak ada `AuthContext` di sini: pelaksananya bukan pengguna sistem, melainkan operator
// server (FR-01.6 AC "hanya dapat dijalankan dari server, tidak pernah melalui antarmuka web
// maupun API"). Repository-nya (`CliRepository`) adalah pengecualian `SDD-AUTH-02` yang
// terdokumentasi, pola yang sama dengan `AuthRepository`. Audit dicatat lewat
// `AuditLogger.writeCli` (pelaku `SYSTEM:CLI`), bukan `AuditLogger.write`.

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { createAuthContext, wajibDuaFaktor } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { publishAll } from "../../../shared/events/index.js";
import type { DomainEvent } from "../../../shared/events/index.js";
import type { Logger } from "../../../shared/observability/index.js";
import {
    bangkitkanKodeTunggal,
    generateTemporaryPassword,
    hashPassword,
    tampilkanKodeCadangan,
} from "../../../shared/security/index.js";
import { createCliRepository } from "../repositories/cli.repository.js";
import { eventSesiDicabut } from "./sesi-event.js";

const MODUL = "m01-auth";
const ROLE_ADMINISTRATOR = "R-01";
const JAM_MS = 60 * 60 * 1000;
/** FR-01.6 AC: jendela "login dalam 24 jam terakhir" bagi Administrator lain yang masih aktif. */
const JENDELA_ADMIN_AKTIF_MS = 24 * JAM_MS;
/** BR-070d: kode aktivasi berlaku 72 jam, sama dengan password sementara (`FR-01.3` A3). */
const MASA_KODE_AKTIVASI_MS = 72 * JAM_MS;
/** `refresh_tokens.revoke_reason` (FR-01.6 langkah 4). */
const ALASAN_SESI_BREAK_GLASS = "admin_break_glass_recovery";

/** Event outbox (SDD-07 §4.3): konsumennya — notifikasi ke Pimpinan Sekolah, `NT-53` — dipasang `PR-02-25`. */
export const EVENT_BREAK_GLASS_RECOVERY = "AdminBreakGlassRecovery";

/** Kesalahan CLI: pesan Bahasa Indonesia siap tampil di terminal, tanpa amplop galat HTTP (CLI bukan endpoint). */
export class GalatCli extends Error {}
export class TargetTidakDitemukan extends GalatCli {
    constructor(email: string) {
        super(`Tidak ada akun dengan email ${email}.`);
    }
}
export class BukanAdministrator extends GalatCli {
    constructor(email: string) {
        super(`Akun ${email} bukan Administrator; break-glass hanya untuk akun Administrator (BR-070b).`);
    }
}
export class AkunTidakAktif extends GalatCli {
    constructor(email: string) {
        super(`Akun ${email} berstatus NONAKTIF.`);
    }
}
export class AdaAdminLainAktif extends GalatCli {
    constructor() {
        super(
            "Ada Administrator lain yang masih aktif dan login dalam 24 jam terakhir. " +
                "Break-glass TIDAK BOLEH digunakan (FR-01.6 A1) — pulihkan lewat reset 2FA biasa, atau ulangi dengan --force.",
        );
    }
}
export class BukanRoleWajibDuaFaktor extends GalatCli {
    constructor(email: string) {
        super(`Akun ${email} bukan role yang wajib 2FA (BR-070d hanya untuk Administrator dan Pimpinan Sekolah).`);
    }
}
export class DuaFaktorSudahAktif extends GalatCli {
    constructor(email: string) {
        super(`2FA sudah aktif pada akun ${email}; gunakan reset 2FA (POST /users/{id}/reset-2fa), bukan kode aktivasi baru.`);
    }
}

export interface HasilPemulihan {
    readonly userId: string;
    readonly email: string;
    /** Tampil SATU kali; tidak pernah disimpan apa adanya maupun masuk activity log (AL-05). */
    readonly passwordSementara: string;
    /** Tampil SATU kali (BR-070c/d). */
    readonly kodeAktivasi: string;
    readonly kodeAktivasiBerlakuSampai: Date;
    readonly sesiDicabut: number;
    readonly dipaksa: boolean;
}

export interface HasilKodeAktivasiCli {
    readonly userId: string;
    readonly email: string;
    /** Tampil SATU kali. */
    readonly kodeAktivasi: string;
    readonly berlakuSampai: Date;
}

export class BreakGlassService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
        private readonly logger: Logger,
    ) {}

    /**
     * `sigm4 admin:recover --email=<email> [--force]` (FR-01.6, SDD-04 §4.5). Menonaktifkan
     * 2FA target, menerbitkan password sementara DAN kode aktivasi 2FA (langkah 3, disatukan
     * dengan `BR-070d` — admin yang mendaftar ulang 2FA tetap memerlukannya), lalu mencabut
     * SELURUH sesi aktif DI SISTEM (langkah 4 — bukan hanya milik target).
     */
    async pulihkan(email: string, paksa: boolean): Promise<HasilPemulihan> {
        const sekarang = this.clock.now();
        const hasil = await this.db.transaction().setIsolationLevel("read committed").execute(async (tx) => {
            const repo = createCliRepository(tx);
            const target = await repo.kunciUserByEmail(email);
            if (target === undefined) throw new TargetTidakDitemukan(email);
            if (target.role_kode !== ROLE_ADMINISTRATOR) throw new BukanAdministrator(email);
            if (target.status !== "AKTIF") throw new AkunTidakAktif(email);

            if (!paksa) {
                const adaLain = await repo.adaAdminLainAktifBaruLogin(
                    target.id,
                    new Date(sekarang.getTime() - JENDELA_ADMIN_AKTIF_MS),
                );
                if (adaLain) throw new AdaAdminLainAktif();
            }

            await repo.lepasDuaFaktor(target.id);
            await repo.hapusKodeCadangan(target.id);
            await repo.hapusKodeAktivasiAktif(target.id);

            const identitas = { nama: target.nama, email: target.email, nipNis: target.nip_nis };
            const passwordSementara = generateTemporaryPassword(identitas);
            await repo.simpanPasswordSementara(target.id, await hashPassword(passwordSementara));

            const kodeNormal = bangkitkanKodeTunggal();
            const kedaluwarsa = new Date(sekarang.getTime() + MASA_KODE_AKTIVASI_MS);
            await repo.simpanKodeAktivasi(target.id, await hashPassword(kodeNormal), sekarang, kedaluwarsa);

            const sesiDicabut = await repo.cabutSeluruhRefreshTokenSistem(sekarang, ALASAN_SESI_BREAK_GLASS);

            // AL-01, AL-03: pelaku SYSTEM:CLI, dalam transaksi yang sama; TANPA nilai password/kode.
            await this.audit.writeCli(tx, {
                modul: MODUL,
                aksi: "ADMIN_BREAK_GLASS_RECOVERY",
                entitas: "users",
                entitasId: target.id,
                nilaiSesudah: { email: target.email, dipaksa: paksa, sesi_dicabut: sesiDicabut.length },
            });

            // SDD-EVT-04: outbox di dalam transaksi. Tidak ada pelaku manusia untuk `actor_id`
            // (kolom `event_outbox`) — target sendiri dipakai sebagai gantinya, pola yang sama
            // dengan AccountLocked pra-autentikasi (`AuthService.catatKredensialSalah`).
            const ctxTarget = createAuthContext({ userId: Number(target.id), roleCode: target.role_kode, scopes: new Map() });
            const events: DomainEvent[] = sesiDicabut.map((s) =>
                eventSesiDicabut(s.userId, { familyId: s.familyId, platform: s.platform }, ALASAN_SESI_BREAK_GLASS),
            );
            events.push({
                name: EVENT_BREAK_GLASS_RECOVERY,
                aggregateType: "user",
                aggregateId: target.id,
                payload: { user_id: target.id, email: target.email, dipaksa: paksa, sesi_dicabut: sesiDicabut.length },
            });
            await publishAll({ ctx: ctxTarget, tx }, events);

            return {
                userId: target.id,
                email: target.email,
                passwordSementara,
                kodeAktivasi: tampilkanKodeCadangan(kodeNormal),
                kodeAktivasiBerlakuSampai: kedaluwarsa,
                sesiDicabut: sesiDicabut.length,
                dipaksa: paksa,
            };
        });
        // OBS-05: alarm ke pemantauan SETELAH commit (FR-01.6 AC) — bukan rollback, sama dengan
        // pola AccountLocked/pemakaian ulang refresh token.
        this.logger.warn("Break-glass recovery Administrator dijalankan", {
            user_id: hasil.userId,
            dipaksa: hasil.dipaksa,
            sesi_dicabut: hasil.sesiDicabut,
        });
        return hasil;
    }

    /**
     * `sigm4 admin:activation-code --email=<email>` (FR-01.5 A6, BR-070d). Hanya untuk akun
     * AKTIF role wajib 2FA yang belum ber-2FA — dipakai instalasi awal (dua Administrator
     * pertama, `BR-070a`, RS-19) atau saat tidak ada Administrator ber-2FA yang dapat
     * menerbitkannya lewat `POST /users/{id}/2fa-activation-code`.
     */
    async terbitkanKodeAktivasi(email: string): Promise<HasilKodeAktivasiCli> {
        const sekarang = this.clock.now();
        return this.db.transaction().setIsolationLevel("read committed").execute(async (tx) => {
            const repo = createCliRepository(tx);
            const target = await repo.kunciUserByEmail(email);
            if (target === undefined) throw new TargetTidakDitemukan(email);
            if (target.status !== "AKTIF") throw new AkunTidakAktif(email);
            if (!wajibDuaFaktor(target.role_kode)) throw new BukanRoleWajibDuaFaktor(email);
            if (target.totp_enabled_at !== null) throw new DuaFaktorSudahAktif(email);

            await repo.hapusKodeAktivasiAktif(target.id);
            const kodeNormal = bangkitkanKodeTunggal();
            const kedaluwarsa = new Date(sekarang.getTime() + MASA_KODE_AKTIVASI_MS);
            await repo.simpanKodeAktivasi(target.id, await hashPassword(kodeNormal), sekarang, kedaluwarsa);

            await this.audit.writeCli(tx, {
                modul: MODUL,
                aksi: "TWO_FA_ACTIVATION_CODE_ISSUED",
                entitas: "users",
                entitasId: target.id,
                nilaiSesudah: { metode_verifikasi: null, berlaku_sampai: kedaluwarsa.toISOString() },
            });

            return {
                userId: target.id,
                email: target.email,
                kodeAktivasi: tampilkanKodeCadangan(kodeNormal),
                berlakuSampai: kedaluwarsa,
            };
        });
    }
}
