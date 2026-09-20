// TwoFactorService — pendaftaran dan pengelolaan 2FA TOTP sendiri (FR-01.5, BR-070, BR-070c,
// SDD-SESS-08/09, PR-02-07). Verifikasi faktor kedua saat login ada di `AuthService`: ia berjalan
// sebelum ada sesi dan berbagi penerbitan sesi serta penguncian dengan login.
//
// TIDAK ada di sini (belum ada PR pemiliknya; logs/phase-02.md §10): menonaktifkan 2FA sendiri bagi
// role opsional, dan reset 2FA pengguna lain oleh Administrator (`FR-01.5 A3`, `POST /users/{id}/reset-2fa`).

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { AMR_OTP } from "../../../shared/auth/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import {
    bangkitkanKodeCadangan,
    bangkitkanSecretTotp,
    base32Encode,
    cocokkanTotp,
    hashPassword,
    tampilkanKodeCadangan,
    urlOtpauth,
} from "../../../shared/security/index.js";
import type { JwtKeys, KotakRahasia } from "../../../shared/security/index.js";
import { createTwoFactorRepository } from "../repositories/two-factor.repository.js";
import { amrSesi } from "./amr.js";
import { jejakKlien } from "./klien.js";
import type { KlienPermintaan } from "./klien.js";

const MODUL = "m01-auth";

/** Nama penerbit pada aplikasi authenticator. */
const PENERBIT_OTPAUTH = "SIGM4";

const PESAN_KODE_SALAH = "Kode verifikasi salah atau sudah tidak berlaku.";

/** Rahasia terenkripsi diikat pada pemiliknya (AAD): baris yang ditukar ke akun lain gagal didekripsi. */
export function aadSecretTotp(userId: number | string): string {
    return `totp:${String(userId)}`;
}

/** Yang ditampilkan SATU kali saat pendaftaran (FR-01.5 langkah 2, BR-070c). */
export interface PendaftaranDuaFaktor {
    readonly secret: string;
    readonly otpauthUri: string;
    readonly kodeCadangan: readonly string[];
}

function galatValidasi(field: string, pesan: string): DomainError {
    return new DomainError("VALIDATION_ERROR", pesan, { errors: [{ field, message: pesan }] });
}

export class TwoFactorService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly jwt: JwtKeys,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
        private readonly kotak: KotakRahasia,
    ) {}

    /**
     * `POST /auth/2fa/enroll` (FR-01.5 langkah 1-2). Membangkitkan secret dan 10 kode cadangan; secret
     * tersimpan terenkripsi tetapi 2FA BELUM berlaku sampai `konfirmasiPendaftaran`. Diulang selagi belum
     * dikonfirmasi = mengganti secret dan kode cadangan (pengguna yang gagal memindai QR dapat mengulang).
     */
    async mulaiPendaftaran(ctx: AuthContext, klien: KlienPermintaan): Promise<PendaftaranDuaFaktor> {
        const secret = bangkitkanSecretTotp();
        const kode = bangkitkanKodeCadangan();
        // Argon2id (BR-070c) dihitung SEBELUM transaksi: sepuluh hash tidak menahan kunci baris.
        const hashKode = await Promise.all(kode.map((k) => hashPassword(k)));

        const email = await withTransaction(
            ctx,
            async (scope) => {
                const repo = createTwoFactorRepository(scope.tx);
                const baris = await repo.kunciUser(ctx);
                if (baris === undefined) throw new NotFoundError();
                if (baris.totp_enabled_at !== null) {
                    throw galatValidasi("2fa", "2FA sudah aktif pada akun ini.");
                }
                await repo.simpanSecretTertunda(ctx, this.kotak.enkripsi(secret, aadSecretTotp(ctx.userId)));
                await repo.gantiKodeCadangan(ctx, hashKode);
                // AL-01: dalam transaksi yang sama. Secret dan kode tidak pernah masuk log.
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "TWO_FA_ENROLLMENT_STARTED",
                    entitas: "users",
                    entitasId: ctx.userId,
                    nilaiSesudah: { jumlah_kode_cadangan: kode.length },
                    ...jejakKlien(klien),
                });
                return baris.email;
            },
            this.db,
        );

        return {
            secret: base32Encode(secret),
            otpauthUri: urlOtpauth(secret, email, PENERBIT_OTPAUTH),
            kodeCadangan: kode.map((k) => tampilkanKodeCadangan(k)),
        };
    }

    /**
     * `POST /auth/2fa/enroll/confirm` (FR-01.5 langkah 3-4): 6 digit dari authenticator memvalidasi
     * secret, lalu 2FA berlaku dan sesi INI ditandai terverifikasi (`refresh_tokens.otp_verified`),
     * sehingga refresh berikutnya menerbitkan `amr` yang memuat `otp`. Token baru diterbitkan
     * terpisah lewat `terbitkanAksesBaru` — tidak ada jalur dari `kode` ke token (pola `PR-02-06`).
     */
    async konfirmasiPendaftaran(
        ctx: AuthContext,
        sesiSaatIni: string,
        kode: string,
        klien: KlienPermintaan,
    ): Promise<{ readonly wajibGantiPassword: boolean }> {
        const sekarang = this.clock.now();
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createTwoFactorRepository(scope.tx);
                const baris = await repo.kunciUser(ctx);
                if (baris === undefined) throw new NotFoundError();
                if (baris.totp_enabled_at !== null) throw galatValidasi("2fa", "2FA sudah aktif pada akun ini.");
                if (baris.totp_secret_enc === null) {
                    throw galatValidasi("kode", "Pendaftaran 2FA belum dimulai.");
                }
                const secret = this.kotak.dekripsi(baris.totp_secret_enc, aadSecretTotp(ctx.userId));
                // Belum ada langkah terakhir yang perlu dilampaui: secret ini baru.
                const langkah = cocokkanTotp(secret, kode, sekarang, null);
                if (langkah === undefined) throw galatValidasi("kode", PESAN_KODE_SALAH);

                await repo.aktifkan(ctx, sekarang, langkah);
                await repo.tandaiSesiTerverifikasi(ctx, sesiSaatIni);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "TWO_FA_ENABLED",
                    entitas: "users",
                    entitasId: ctx.userId,
                    ...jejakKlien(klien),
                });
                return { wajibGantiPassword: baris.wajib_ganti };
            },
            this.db,
        );
    }

    /**
     * `POST /auth/2fa/backup-codes/regenerate` (FR-01.5 AC, UX P-77): mengganti SELURUH kode cadangan.
     * Hanya untuk sesi yang membuktikan faktor kedua (`amr` memuat `otp`) — sesi yang baru memegang
     * password tidak boleh mencetak kode pemulihan yang melewati 2FA.
     */
    async buatUlangKodeCadangan(
        ctx: AuthContext,
        amr: readonly string[] | undefined,
        klien: KlienPermintaan,
    ): Promise<readonly string[]> {
        if (amr?.includes(AMR_OTP) !== true) {
            throw new DomainError("TWO_FACTOR_REQUIRED", "Verifikasi dua langkah (2FA) diperlukan untuk membuat ulang kode cadangan.");
        }
        const kode = bangkitkanKodeCadangan();
        const hashKode = await Promise.all(kode.map((k) => hashPassword(k)));

        await withTransaction(
            ctx,
            async (scope) => {
                const repo = createTwoFactorRepository(scope.tx);
                const baris = await repo.kunciUser(ctx);
                if (baris === undefined) throw new NotFoundError();
                if (baris.totp_enabled_at === null) throw galatValidasi("2fa", "2FA belum aktif pada akun ini.");
                await repo.gantiKodeCadangan(ctx, hashKode);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "TWO_FA_BACKUP_CODES_REGENERATED",
                    entitas: "users",
                    entitasId: ctx.userId,
                    nilaiSesudah: { jumlah_kode_cadangan: kode.length },
                    ...jejakKlien(klien),
                });
            },
            this.db,
        );
        return kode.map((k) => tampilkanKodeCadangan(k));
    }

    /**
     * Access token baru bagi sesi yang SAMA (`sid` tetap) berklaim `amr=["pwd","otp"]` — membuka gerbang 2FA
     * seketika setelah konfirmasi, tanpa menunggu `/auth/refresh`. `pwd` dibawa dari keadaan akun, bukan
     * diasumsikan `false`: pengguna yang masih wajib ganti password tetap terkena gerbangnya.
     */
    terbitkanAksesBaru(ctx: AuthContext, sesiSaatIni: string, wajibGantiPassword: boolean): string {
        return this.jwt.terbitkan(
            { sub: String(ctx.userId), sid: sesiSaatIni, pwd: wajibGantiPassword, amr: amrSesi(true) },
            this.clock.now(),
        );
    }
}
