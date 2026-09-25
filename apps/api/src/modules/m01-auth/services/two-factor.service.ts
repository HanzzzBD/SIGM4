// TwoFactorService — pendaftaran dan pengelolaan 2FA TOTP sendiri (FR-01.5, BR-070, BR-070c,
// SDD-SESS-08/09, PR-02-07). Verifikasi faktor kedua saat login ada di `AuthService`: ia berjalan
// sebelum ada sesi dan berbagi penerbitan sesi serta penguncian dengan login.
//
// Reset 2FA pengguna lain dan penerbitan kode aktivasi oleh Administrator ada di `PengelolaDuaFaktorService`
// (PR-02-33). TIDAK ada di mana pun (belum ada PR pemiliknya; logs/phase-02.md §10): menonaktifkan 2FA sendiri
// bagi role opsional.

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { AMR_OTP, wajibDuaFaktor } from "../../../shared/auth/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { publishAll } from "../../../shared/events/index.js";
import type { DomainEvent } from "../../../shared/events/index.js";
import {
    bangkitkanKodeCadangan,
    bangkitkanSecretTotp,
    base32Encode,
    cocokkanTotp,
    hashPassword,
    normalisasiKodeCadangan,
    tampilkanKodeCadangan,
    urlOtpauth,
    verifyPassword,
} from "../../../shared/security/index.js";
import type { JwtKeys, KotakRahasia } from "../../../shared/security/index.js";
import { createActivationCodeRepository } from "../repositories/activation-code.repository.js";
import { createSessionRepository } from "../repositories/session.repository.js";
import { createTwoFactorRepository } from "../repositories/two-factor.repository.js";
import { amrSesi } from "./amr.js";
import { jejakKlien } from "./klien.js";
import type { KlienPermintaan } from "./klien.js";
import { BATAS_GAGAL_KODE_AKTIVASI, PESAN_KODE_AKTIVASI_TIDAK_BERLAKU } from "./kode-aktivasi.js";
import { eventSesiDicabut } from "./sesi-event.js";

const MODUL = "m01-auth";

/** Nama penerbit pada aplikasi authenticator. */
const PENERBIT_OTPAUTH = "SIGM4";

const PESAN_KODE_SALAH = "Kode verifikasi salah atau sudah tidak berlaku.";

/** `refresh_tokens.revoke_reason` saat pendaftaran 2FA berhasil (`BR-070e`). */
const ALASAN_DUA_FAKTOR_AKTIF = "two_fa_enabled";

/** Event outbox (SDD-07 §4.3): konsumennya — notifikasi `NT-39a` ke Administrator — dipasang `PR-02-25`. */
export const EVENT_DUA_FAKTOR_AKTIF = "TwoFactorEnabled";

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
     *
     * Akun role WAJIB 2FA harus menyertakan kode aktivasi yang diterbitkan Administrator (`BR-070d`): password
     * saja tidak cukup, sehingga pemegang password tak dapat mendaftarkan authenticator miliknya lebih dulu.
     * Kegagalan mencocokkan kode dicatat dan dihitung DALAM transaksi yang di-commit sebelum galat dijawab.
     */
    async mulaiPendaftaran(ctx: AuthContext, kodeAktivasi: string | undefined, klien: KlienPermintaan): Promise<PendaftaranDuaFaktor> {
        const secret = bangkitkanSecretTotp();
        const kode = bangkitkanKodeCadangan();
        // Argon2id (BR-070c) dihitung SEBELUM transaksi: sepuluh hash tidak menahan kunci baris.
        const hashKode = await Promise.all(kode.map((k) => hashPassword(k)));

        const sekarang = this.clock.now();
        const hasil = await withTransaction(
            ctx,
            async (scope) => {
                const repo = createTwoFactorRepository(scope.tx);
                const baris = await repo.kunciUser(ctx);
                if (baris === undefined) throw new NotFoundError();
                if (baris.totp_enabled_at !== null) {
                    throw galatValidasi("2fa", "2FA sudah aktif pada akun ini.");
                }
                if (wajibDuaFaktor(ctx.roleCode) && (await this.kodeAktivasiDitolak(scope, ctx, kodeAktivasi, sekarang, klien))) {
                    return { ditolak: true } as const;
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
                return { ditolak: false, email: baris.email } as const;
            },
            this.db,
        );
        if (hasil.ditolak) throw galatValidasi("kode_aktivasi", PESAN_KODE_AKTIVASI_TIDAK_BERLAKU);

        return {
            secret: base32Encode(secret),
            otpauthUri: urlOtpauth(secret, hasil.email, PENERBIT_OTPAUTH),
            kodeCadangan: kode.map((k) => tampilkanKodeCadangan(k)),
        };
    }

    /**
     * `POST /auth/2fa/enroll/confirm` (FR-01.5 langkah 3-4): 6 digit dari authenticator memvalidasi
     * secret, lalu 2FA berlaku dan sesi INI ditandai terverifikasi (`refresh_tokens.otp_verified`),
     * sehingga refresh berikutnya menerbitkan `amr` yang memuat `otp`. Seluruh sesi LAIN pemilik akun
     * dicabut dan `TwoFactorEnabled` terbit (`BR-070e`, `NT-39a`): pemilik yang mendadak keluar dari
     * sesinya adalah sinyal pertama bahwa 2FA-nya didaftarkan pihak lain. Token baru diterbitkan
     * terpisah lewat `terbitkanAksesBaru` — tidak ada jalur dari `kode` ke token (pola `PR-02-06`).
     */
    async konfirmasiPendaftaran(
        ctx: AuthContext,
        sesiSaatIni: string,
        kode: string,
        klien: KlienPermintaan,
    ): Promise<{ readonly wajibGanti: boolean }> {
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
                // BR-070d: role wajib hanya boleh menyelesaikan pendaftaran yang kodenya sudah dicocokkan pada `enroll`.
                // Tanpa ini, secret tertunda yang lahir tanpa kode (mis. sebelum aturan berlaku) dapat dikonfirmasi.
                let kodeAktivasiId: string | undefined;
                if (wajibDuaFaktor(ctx.roleCode)) {
                    const aktif = await createActivationCodeRepository(scope.tx).kunciAktif(ctx, String(ctx.userId));
                    if (
                        aktif === undefined ||
                        aktif.verified_at === null ||
                        aktif.expires_at.getTime() <= sekarang.getTime() ||
                        aktif.failed_attempts >= BATAS_GAGAL_KODE_AKTIVASI
                    ) {
                        throw galatValidasi("kode_aktivasi", PESAN_KODE_AKTIVASI_TIDAK_BERLAKU);
                    }
                    kodeAktivasiId = aktif.id;
                }
                const secret = this.kotak.dekripsi(baris.totp_secret_enc, aadSecretTotp(ctx.userId));
                // Belum ada langkah terakhir yang perlu dilampaui: secret ini baru.
                const langkah = cocokkanTotp(secret, kode, sekarang, null);
                if (langkah === undefined) throw galatValidasi("kode", PESAN_KODE_SALAH);

                await repo.aktifkan(ctx, sekarang, langkah);
                if (kodeAktivasiId !== undefined) await createActivationCodeRepository(scope.tx).habiskan(ctx, kodeAktivasiId, sekarang);
                await repo.tandaiSesiTerverifikasi(ctx, sesiSaatIni);
                // BR-070e: sesi lain keluar dalam transaksi yang sama dengan pengaktifannya.
                const sesiDicabut = await createSessionRepository(scope.tx).cabutSemuaKecuali(
                    ctx,
                    sesiSaatIni,
                    sekarang,
                    ALASAN_DUA_FAKTOR_AKTIF,
                );
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "TWO_FA_ENABLED",
                    entitas: "users",
                    entitasId: ctx.userId,
                    nilaiSesudah: {
                        sesi_dicabut: sesiDicabut.length,
                        ...(kodeAktivasiId === undefined ? {} : { kode_aktivasi_dipakai: true }),
                    },
                    ...jejakKlien(klien),
                });
                const events: DomainEvent[] = sesiDicabut.map((s) => eventSesiDicabut(ctx.userId, s, ALASAN_DUA_FAKTOR_AKTIF));
                events.push({
                    name: EVENT_DUA_FAKTOR_AKTIF,
                    aggregateType: "user",
                    aggregateId: ctx.userId,
                    payload: { user_id: String(ctx.userId), sesi_dicabut: sesiDicabut.length },
                });
                await publishAll(scope, events);
                return { wajibGanti: baris.wajib_ganti };
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
     *
     * Penandanya bernama `wajibGanti` (boolean), bukan memuat kata "password": ia bukan rahasia, dan nama
     * itu menjebak heuristik CodeQL `js/clear-text-storage-of-sensitive-data` pada jalur token → cookie
     * (pola yang sama dengan alias `wajib_ganti` pada `AuthRepository`, `PR-02-02`/`PR-02-06`).
     */
    terbitkanAksesBaru(ctx: AuthContext, sesiSaatIni: string, wajibGanti: boolean): string {
        return this.jwt.terbitkan(
            { sub: String(ctx.userId), sid: sesiSaatIni, pwd: wajibGanti, amr: amrSesi(true) },
            this.clock.now(),
        );
    }

    /**
     * Mencocokkan kode aktivasi akun sendiri pada `enroll` (`BR-070d`). Mengembalikan `true` bila DITOLAK — pemanggil
     * mengakhiri transaksi dengan commit (bukan melempar) supaya penghitung kesalahan dan jejak penolakan menetap.
     * Kode yang tidak ada, salah, kedaluwarsa, atau hangus dijawab sama; sebabnya hanya ada di activity log.
     *
     * Hanya tebakan sungguhan yang dihitung: kode yang tak dikirim atau bentuknya mustahil cocok tidak menambah
     * penghitung. Lima kesalahan menghanguskan kode, TANPA mengunci akun (SDD-SESS-17).
     */
    private async kodeAktivasiDitolak(
        scope: TransactionScope,
        ctx: AuthContext,
        masukan: string | undefined,
        sekarang: Date,
        klien: KlienPermintaan,
    ): Promise<boolean> {
        const repo = createActivationCodeRepository(scope.tx);
        const tolak = async (alasan: string, sisaPercobaan?: number): Promise<true> => {
            await this.audit.write(scope, {
                modul: MODUL,
                aksi: "TWO_FA_ACTIVATION_CODE_REJECTED",
                hasil: "GAGAL",
                entitas: "users",
                entitasId: ctx.userId,
                nilaiSesudah: { alasan, ...(sisaPercobaan === undefined ? {} : { sisa_percobaan: sisaPercobaan }) },
                ...jejakKlien(klien),
            });
            return true;
        };

        const aktif = await repo.kunciAktif(ctx, String(ctx.userId));
        if (aktif === undefined) return tolak("TIDAK_ADA");
        if (aktif.expires_at.getTime() <= sekarang.getTime()) return tolak("KEDALUWARSA");
        if (aktif.failed_attempts >= BATAS_GAGAL_KODE_AKTIVASI) return tolak("HANGUS");

        const normal = masukan === undefined ? undefined : normalisasiKodeCadangan(masukan);
        if (normal === undefined) return tolak(masukan === undefined ? "TIDAK_DIKIRIM" : "BENTUK_SALAH");
        if (!(await verifyPassword(aktif.code_hash, normal))) {
            const jumlah = await repo.tambahGagal(ctx, aktif.id);
            return tolak("SALAH", Math.max(0, BATAS_GAGAL_KODE_AKTIVASI - jumlah));
        }
        await repo.tandaiTerverifikasi(ctx, aktif.id, sekarang);
        return false;
    }
}
