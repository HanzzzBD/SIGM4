// PengelolaDuaFaktorService — Administrator mengelola 2FA pengguna LAIN (FR-01.5 A3/A7, BR-070d, PR-02-33):
// menerbitkan kode aktivasi 2FA dan mereset 2FA. Route-nya milik M-02 (`/users/{id}/…`); logikanya milik M-01
// dan dipanggil lewat pintu sempit yang disuntikkan composition root (pola `PenerbitPasswordSementara`,
// keputusan 26 log phase-02), sehingga m02-users tidak mengimpor internal m01-auth (SDD-SYS-03).
//
// Kedua operasi menuntut `metode_verifikasi` identitas luring (seperti FR-01.3 langkah 3), dan tak berlaku bagi
// akun SENDIRI: Administrator yang kehilangan perangkat dipulihkan Administrator lain atau `break-glass`
// (FR-01.5 A4, FR-01.6 A1) — reset-diri hanya membuka jalan mengunci diri sendiri (keputusan 50 log phase-02).

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { wajibDuaFaktor } from "../../../shared/auth/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { publishAll } from "../../../shared/events/index.js";
import type { DomainEvent } from "../../../shared/events/index.js";
import { createActivationCodeRepository } from "../repositories/activation-code.repository.js";
import type { MetodeVerifikasi } from "../repositories/activation-code.repository.js";
import { createAdminDuaFaktorRepository } from "../repositories/admin-dua-faktor.repository.js";
import type { SasaranDuaFaktor } from "../repositories/admin-dua-faktor.repository.js";
import { createPasswordResetRepository } from "../repositories/password-reset.repository.js";
import { jejakKlien } from "./klien.js";
import type { KlienPermintaan } from "./klien.js";
import { MASA_KODE_AKTIVASI_MS, siapkanKodeAktivasi } from "./kode-aktivasi.js";
import type { KodeAktivasiSiap, KodeAktivasiTerbit } from "./kode-aktivasi.js";
import { eventSesiDicabut } from "./sesi-event.js";

const MODUL = "m01-auth";

/** `refresh_tokens.revoke_reason` saat 2FA direset (`FR-01.5 A3`: seluruh sesi pengguna dicabut). */
const ALASAN_SESI_RESET_DUA_FAKTOR = "two_fa_reset";

export interface HasilResetDuaFaktor {
    readonly sesiDicabut: number;
    /** Terisi bagi role wajib 2FA yang AKTIF (BR-070d); `null` bagi role lain atau akun nonaktif. */
    readonly kodeAktivasi: KodeAktivasiTerbit | null;
}

function galatValidasi(field: string, pesan: string): DomainError {
    return new DomainError("VALIDATION_ERROR", pesan, { errors: [{ field, message: pesan }] });
}

export class PengelolaDuaFaktorService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
    ) {}

    /**
     * `POST /users/{id}/2fa-activation-code` (FR-01.5 A7). Hanya bagi akun AKTIF role wajib 2FA yang belum
     * ber-2FA. Kode menggantikan yang sebelumnya, tampil satu kali, dan tidak pernah tercatat.
     */
    async terbitkanKodeAktivasi(
        ctx: AuthContext,
        userId: string,
        metode: MetodeVerifikasi,
        klien: KlienPermintaan,
    ): Promise<KodeAktivasiTerbit> {
        if (String(ctx.userId) === userId) {
            throw galatValidasi("id", "Tidak dapat menerbitkan kode aktivasi 2FA bagi akun sendiri.");
        }
        const siap = await siapkanKodeAktivasi();

        return withTransaction(
            ctx,
            async (scope) => {
                const sasaran = await createAdminDuaFaktorRepository(scope.tx).kunciSasaran(ctx, userId);
                if (sasaran === undefined) throw new NotFoundError();
                if (sasaran.status !== "AKTIF") throw galatValidasi("id", "Akun pengguna tidak aktif; aktifkan akun lebih dulu.");
                if (!wajibDuaFaktor(sasaran.role_kode)) {
                    throw galatValidasi("id", "Kode aktivasi 2FA hanya untuk akun role yang wajib 2FA.");
                }
                if (sasaran.totp_enabled_at !== null) {
                    throw galatValidasi("id", "2FA sudah aktif pada akun ini; gunakan reset 2FA bila perlu mendaftar ulang.");
                }
                return this.terbitkanDalam(scope, ctx, sasaran, siap, metode, klien);
            },
            this.db,
        );
    }

    /**
     * `POST /users/{id}/reset-2fa` (FR-01.5 A3). Melepas 2FA (secret, penanda aktif, langkah terakhir), menghapus
     * kode cadangan dan kode aktivasi lama, mencabut SELURUH sesi sasaran, dan — bagi role wajib 2FA yang aktif —
     * menerbitkan kode aktivasi baru dalam transaksi yang sama (BR-070d). Yang direset harus sedang ber-2FA.
     */
    async reset(ctx: AuthContext, userId: string, metode: MetodeVerifikasi, klien: KlienPermintaan): Promise<HasilResetDuaFaktor> {
        if (String(ctx.userId) === userId) {
            throw galatValidasi("id", "Tidak dapat mereset 2FA akun sendiri; minta Administrator lain.");
        }
        // Dihitung di luar transaksi; dibuang bila sasaran ternyata tak memerlukan kode (role opsional/nonaktif).
        const siap = await siapkanKodeAktivasi();
        const sekarang = this.clock.now();

        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createAdminDuaFaktorRepository(scope.tx);
                const sasaran = await repo.kunciSasaran(ctx, userId);
                if (sasaran === undefined) throw new NotFoundError();
                if (sasaran.totp_enabled_at === null) throw galatValidasi("id", "2FA belum aktif pada akun ini.");

                await repo.lepasDuaFaktor(ctx, userId);
                await repo.hapusKodeCadangan(ctx, userId);
                await createActivationCodeRepository(scope.tx).hapusAktif(ctx, userId);
                const sesiDicabut = await createPasswordResetRepository(scope.tx).cabutSemuaSesi(
                    ctx,
                    userId,
                    sekarang,
                    ALASAN_SESI_RESET_DUA_FAKTOR,
                );

                const perluKode = sasaran.status === "AKTIF" && wajibDuaFaktor(sasaran.role_kode);
                const kodeAktivasi = perluKode ? await this.terbitkanDalam(scope, ctx, sasaran, siap, metode, klien) : null;

                // AL-01/AL-05: pelaku Administrator, sasaran pada entitas; TANPA nilai kode.
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "TWO_FA_RESET",
                    entitas: "users",
                    entitasId: userId,
                    nilaiSesudah: {
                        metode_verifikasi: metode,
                        sesi_dicabut: sesiDicabut.length,
                        kode_aktivasi_diterbitkan: kodeAktivasi !== null,
                    },
                    ...jejakKlien(klien),
                });
                const events: DomainEvent[] = sesiDicabut.map((s) => eventSesiDicabut(userId, s, ALASAN_SESI_RESET_DUA_FAKTOR));
                await publishAll(scope, events);
                return { sesiDicabut: sesiDicabut.length, kodeAktivasi };
            },
            this.db,
        );
    }

    /** Menyimpan kode (menggantikan yang lama) dan mencatatnya; nilai kode tidak pernah masuk log. */
    private async terbitkanDalam(
        scope: TransactionScope,
        ctx: AuthContext,
        sasaran: SasaranDuaFaktor,
        siap: KodeAktivasiSiap,
        metode: MetodeVerifikasi,
        klien: KlienPermintaan,
    ): Promise<KodeAktivasiTerbit> {
        const sekarang = this.clock.now();
        const berlakuSampai = new Date(sekarang.getTime() + MASA_KODE_AKTIVASI_MS);
        await createActivationCodeRepository(scope.tx).ganti(ctx, sasaran.id, {
            codeHash: siap.hash,
            diterbitkanOleh: ctx.userId,
            metode,
            diterbitkanPada: sekarang,
            kedaluwarsaPada: berlakuSampai,
        });
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "TWO_FA_ACTIVATION_CODE_ISSUED",
            entitas: "users",
            entitasId: sasaran.id,
            nilaiSesudah: { metode_verifikasi: metode, berlaku_sampai: berlakuSampai.toISOString() },
            ...jejakKlien(klien),
        });
        return { kode: siap.tampil, berlakuSampai };
    }
}
