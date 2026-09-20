// ProfileService — kelola profil sendiri + ganti password sendiri (FR-01.4, PR-02-06).
//
// Foto profil TIDAK ada di sini: `users.foto_file_id` menunggu `stored_files` (PR-03-04,
// logs/phase-01.md §2 keputusan 4). Larangan memakai ulang 3 password terakhir dan daftar
// password bocor (`NFR-S-03a`) juga TIDAK ada di sini: keduanya menuntut tabel riwayat yang
// belum ada dan dimiliki `PR-02-31` (logs/phase-01.md §2 keputusan 9).

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext, PermissionCache } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { publishAll } from "../../../shared/events/index.js";
import type { DomainEvent } from "../../../shared/events/index.js";
import {
    checkPasswordPolicy,
    hashPassword,
    verifyPassword,
} from "../../../shared/security/index.js";
import type { JwtKeys, PasswordViolation } from "../../../shared/security/index.js";
import { createProfileRepository } from "../repositories/profile.repository.js";
import type { PembaruanProfil, ProfilRow } from "../repositories/profile.repository.js";
import { createSessionRepository } from "../repositories/session.repository.js";
import { jejakKlien } from "./klien.js";
import type { KlienPermintaan } from "./klien.js";
import { eventSesiDicabut } from "./sesi-event.js";

const MODUL = "m01-auth";

/** `refresh_tokens.revoke_reason` (SDD-04 §4.6, FR-01.4 langkah 4). */
const ALASAN_GANTI_PASSWORD = "password_changed";

/** Event outbox (SDD-07 §4.3): konsumennya — notifikasi `NT-38a` — dipasang `PR-02-25`. */
export const EVENT_PASSWORD_DIGANTI_SETELAH_RESET = "PasswordChangedAfterReset";
const AGREGAT_PENGGUNA = "user";

export interface ProfilTampil {
    readonly user: ProfilRow;
    readonly permissions: Readonly<Record<string, string>>;
}

const PESAN_PELANGGARAN: Readonly<Record<PasswordViolation, string>> = {
    TOO_SHORT: "Password baru minimal 12 karakter.",
    MISSING_UPPERCASE: "Password baru harus mengandung huruf besar.",
    MISSING_LOWERCASE: "Password baru harus mengandung huruf kecil.",
    MISSING_DIGIT: "Password baru harus mengandung angka.",
    CONTAINS_IDENTITY: "Password baru tidak boleh memuat nama atau email Anda.",
};

export class ProfileService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly jwt: JwtKeys,
        private readonly permissions: PermissionCache,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
    ) {}

    /** `GET /me`. */
    async lihat(ctx: AuthContext): Promise<ProfilTampil> {
        const [user, efektif] = await Promise.all([
            createProfileRepository(this.db).ambil(ctx),
            this.permissions.load(ctx.userId),
        ]);
        if (user === undefined || efektif === undefined) throw new NotFoundError();
        return { user, permissions: Object.fromEntries(efektif.scopes) };
    }

    /** `PUT /me` (FR-01.4 langkah 5). Email dan role tidak diterima di sini (BR-069). */
    async perbarui(ctx: AuthContext, input: PembaruanProfil): Promise<ProfilRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createProfileRepository(scope.tx);
                const sebelum = await repo.ambil(ctx);
                if (sebelum === undefined) throw new NotFoundError();
                const sesudah = await repo.perbarui(ctx, input);
                // AL-01: dalam transaksi yang sama dengan pembaruannya.
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "PROFILE_UPDATED",
                    entitas: "users",
                    entitasId: ctx.userId,
                    nilaiSebelum: { nama: sebelum.nama, telepon: sebelum.telepon },
                    nilaiSesudah: { nama: sesudah.nama, telepon: sesudah.telepon },
                });
                return sesudah;
            },
            this.db,
        );
    }

    /**
     * `POST /auth/password/change` (FR-01.4 langkah 2-4). Password lama diverifikasi, password
     * baru diperiksa terhadap kebijakan (`NFR-S-03a`, tanpa daftar bocor/riwayat — `PR-02-31`),
     * lalu seluruh sesi LAIN dicabut. Bila password ini menyelesaikan penerbitan reset yang masih
     * `DITERBITKAN`, permintaannya ditandai `SELESAI` dan `NT-38a` terbit dalam transaksi yang sama.
     *
     * TIDAK mengembalikan token: penerbitannya milik `terbitkanAksesBaru`, yang tidak pernah
     * menyentuh nilai password. Memisahkannya menjaga agar nilai password tak punya jalur
     * apa pun menuju respons — termasuk jalur semu lewat nilai balik (`SEC-T`, pola `PR-02-02`).
     */
    async gantiPassword(
        ctx: AuthContext,
        sesiSaatIni: string,
        input: { readonly passwordLama: string; readonly passwordBaru: string },
        klien: KlienPermintaan,
    ): Promise<void> {
        const sekarang = this.clock.now();

        await withTransaction(
            ctx,
            async (scope) => {
                const repo = createProfileRepository(scope.tx);
                const baris = await repo.kunciUntukGantiPassword(ctx);
                if (baris === undefined) throw new NotFoundError();

                const cocok = await verifyPassword(baris.password_hash, input.passwordLama);
                if (!cocok) {
                    throw new DomainError("VALIDATION_ERROR", "Password lama salah.", {
                        errors: [{ field: "password_lama", message: "Password lama salah." }],
                    });
                }

                const pelanggaran = checkPasswordPolicy(input.passwordBaru, {
                    nama: baris.nama,
                    email: baris.email,
                    nipNis: baris.nip_nis,
                });
                if (pelanggaran.length > 0) {
                    throw new DomainError("VALIDATION_ERROR", "Password baru tidak memenuhi kebijakan.", {
                        errors: pelanggaran.map((v) => ({ field: "password_baru", message: PESAN_PELANGGARAN[v] })),
                    });
                }

                await repo.simpanPasswordBaru(ctx, await hashPassword(input.passwordBaru));

                const sesiDicabut = await createSessionRepository(scope.tx).cabutSemuaKecuali(
                    ctx,
                    sesiSaatIni,
                    sekarang,
                    ALASAN_GANTI_PASSWORD,
                );
                // AL-01: dalam transaksi yang sama dengan penggantiannya; tanpa nilai password (FR-01.4 AC).
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "PASSWORD_CHANGED",
                    entitas: "users",
                    entitasId: ctx.userId,
                    nilaiSesudah: { sesi_dicabut: sesiDicabut.length },
                    ...jejakKlien(klien),
                });

                const events: DomainEvent[] = sesiDicabut.map((s) =>
                    eventSesiDicabut(ctx.userId, s, ALASAN_GANTI_PASSWORD),
                );

                const menunggu = await repo.kunciPenerbitanDiterbitkan(ctx);
                if (menunggu !== undefined) {
                    await repo.tandaiSelesai(ctx, menunggu.id);
                    events.push({
                        name: EVENT_PASSWORD_DIGANTI_SETELAH_RESET,
                        aggregateType: AGREGAT_PENGGUNA,
                        aggregateId: ctx.userId,
                        payload: { user_id: String(ctx.userId), permintaan_id: menunggu.id },
                    });
                }
                await publishAll(scope, events);
            },
            this.db,
        );
    }

    /**
     * Access token baru bagi sesi yang SAMA (`sid` tetap) berklaim `pwd=false` — membuka gerbang
     * ganti password (`SDD-AUTH-09`) seketika tanpa menunggu `/auth/refresh` (UX-FLOWS `P-05`).
     * Hanya bergantung pada identitas pemanggil dan sesinya; nilai password tidak pernah masuk ke sini.
     * `amr` dibawa apa adanya dari token sesi ini (`SDD-SESS-09`): mengganti password tidak boleh
     * menurunkan sesi yang sudah ber-2FA menjadi `["pwd"]`, dan tidak boleh menaikkan yang belum.
     */
    terbitkanAksesBaru(ctx: AuthContext, sesiSaatIni: string, amr: readonly string[]): string {
        return this.jwt.terbitkan(
            { sub: String(ctx.userId), sid: sesiSaatIni, pwd: false, amr },
            this.clock.now(),
        );
    }
}
