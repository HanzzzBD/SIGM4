// AuthService — login, penguncian akun, dan rotasi refresh token (FR-01.1, SDD-SESS-02/03/04/06/12,
// SDD-04 §4.2–4.3).
//
// Verifikasi faktor kedua (FR-01.5, SDD-04 §4.4, PR-02-07) adalah langkah kedua login yang sama: ia hidup
// di sini supaya penerbitan sesi, penghitung kegagalan, dan penguncian tidak tersalin ke tempat lain.
// Pendaftaran dan pengelolaan 2FA milik `TwoFactorService`.

import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { AuditEntry, AuditLogger } from "../../../shared/audit/index.js";
import { createAuthContext } from "../../../shared/auth/index.js";
import type { PermissionCache } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { AuthError, DomainError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import type { Logger } from "../../../shared/observability/index.js";
import {
    ACCESS_TOKEN_TTL_DETIK,
    REFRESH_TTL_DETIK,
    bangkitkanRefreshToken,
    AMBANG_KODE_CADANGAN_MENIPIS,
    bentukKodeTotpSah,
    bentukRefreshTokenSah,
    cocokkanTotp,
    hashPassword,
    hashRefreshToken,
    normalisasiKodeCadangan,
    verifyPassword,
} from "../../../shared/security/index.js";
import type { JwtKeys, KotakRahasia, PlatformPerangkat } from "../../../shared/security/index.js";
import { AuthRepository } from "../repositories/auth.repository.js";
import type { UserDuaFaktorRow, UserLogin } from "../repositories/auth.repository.js";
import { amrSesi } from "./amr.js";
import { jejakKlien, potongUserAgent } from "./klien.js";
import type { KlienPermintaan } from "./klien.js";
import { sedangTerkunci, terapkanKegagalan } from "./lockout.js";
import type { PenyimpanTantangan } from "./tantangan-dua-faktor.js";
import { TANTANGAN_TTL_DETIK } from "./tantangan-dua-faktor.js";

const MODUL = "m01-auth";

/** Event outbox penguncian akun (SDD-07 §4.3); konsumennya — notifikasi `NT-39` — dipasang `PR-02-25`. */
export const EVENT_AKUN_TERKUNCI = "AccountLocked";
const AGREGAT_PENGGUNA = "user";

/** Alasan internal pada `LOGIN_FAILED`; TIDAK pernah sampai ke pemanggil (`SDD-SESS-12`). */
const ALASAN_EMAIL_TIDAK_DIKENAL = "EMAIL_TIDAK_DIKENAL";
const ALASAN_KREDENSIAL_SALAH = "KREDENSIAL_SALAH";
const ALASAN_AKUN_TERKUNCI = "AKUN_TERKUNCI";
const ALASAN_PASSWORD_SEMENTARA_KEDALUWARSA = "PASSWORD_SEMENTARA_KEDALUWARSA";
/** `LOGIN_FAILED` pada langkah kedua: password sudah benar, kodenya yang salah (FR-01.5 A1). */
const ALASAN_KODE_2FA_SALAH = "KODE_2FA_SALAH";


export interface UserRingkas {
    readonly id: string;
    readonly nama: string;
    readonly email: string;
    readonly role_kode: string;
    readonly must_change_password: boolean;
}

export interface SesiLogin {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly platform: PlatformPerangkat;
    readonly expiresInDetik: number;
    readonly user: UserRingkas;
    readonly permissions: Readonly<Record<string, string>>;
}

/** Login berhenti di sini bagi akun ber-2FA: sesi BELUM terbit (FR-01.5 langkah 5). */
export interface TantanganLogin {
    readonly jenis: "TANTANGAN";
    readonly tantanganToken: string;
    readonly expiresInDetik: number;
}

export type HasilLogin = (SesiLogin & { readonly jenis: "SESI" }) | TantanganLogin;

/** Sesi hasil verifikasi faktor kedua; `sisaKodeCadangan` menyulut peringatan FR-01.5 AC (≤ 2). */
export interface SesiVerifikasi extends SesiLogin {
    readonly sisaKodeCadangan: number;
    readonly kodeCadanganMenipis: boolean;
}

export interface SesiRefresh {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly platform: PlatformPerangkat;
    readonly expiresInDetik: number;
}

/**
 * Hash pengganti bagi email yang tidak terdaftar: pekerjaan Argon2id tetap dijalankan
 * sehingga waktu respons tidak membedakan "email tidak ada" dari "password salah"
 * (FR-01.1 A1). Dihitung sekali, saat pertama dibutuhkan.
 */
let hashPengganti: Promise<string> | undefined;
function ambilHashPengganti(): Promise<string> {
    hashPengganti ??= hashPassword("sigm4-hash-pengganti-waktu-tetap");
    return hashPengganti;
}

/**
 * Entri `LOGIN_FAILED` (`AL-02`, `AL-07`). Pelakunya belum diautentikasi, jadi akun yang
 * ditarget tercatat pada `entitas`/`entitasId`. Email yang dicoba TIDAK disimpan.
 */
function entriGagal(
    targetId: string | null,
    alasan: string,
    klien: KlienPermintaan,
    tambahan: Readonly<Record<string, unknown>> = {},
): AuditEntry {
    return {
        modul: MODUL,
        aksi: "LOGIN_FAILED",
        hasil: "GAGAL",
        ...(targetId === null ? {} : { entitas: "users", entitasId: targetId }),
        nilaiSesudah: { alasan, ...tambahan },
        ...jejakKlien(klien),
    };
}

export class AuthService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly jwt: JwtKeys,
        private readonly permissions: PermissionCache,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
        private readonly logger: Logger,
        private readonly kotak: KotakRahasia,
        private readonly tantangan: PenyimpanTantangan,
    ) {}

    /**
     * `POST /auth/login`. Setiap kegagalan kredensial — email tak dikenal, password salah,
     * DAN akun sedang terkunci — dijawab `401 UNAUTHENTICATED` yang sama persis
     * (`SDD-SESS-12`): status, kode, dan pesan tidak boleh membedakan ketiganya, kalau tidak
     * endpoint ini menjadi alat menebak email terdaftar. Akun nonaktif baru diketahui
     * SETELAH password benar (`403`, FR-01.1 A3).
     *
     * Penguncian (FR-01.1 A2) terjadi di sini tetapi tidak pernah terlihat pemanggil; jejaknya
     * ada pada `activity_logs` (`LOGIN_FAILED`, `ACCOUNT_LOCKED`) dan event `AccountLocked`.
     */
    async login(
        input: { readonly email: string; readonly password: string; readonly platform: PlatformPerangkat },
        klien: KlienPermintaan,
    ): Promise<HasilLogin> {
        const sekarang = this.clock.now();
        const user = await new AuthRepository(this.db).cariUserByEmail(input.email);
        // Argon2id SELALU berjalan tepat sekali — untuk hash asli maupun pengganti, terkunci
        // atau tidak — supaya waktu respons tidak membedakan ketiga keadaan di atas.
        const cocok = await verifyPassword(user?.password_hash ?? (await ambilHashPengganti()), input.password);

        if (user === undefined) {
            await this.catatGagalAnonim(null, ALASAN_EMAIL_TIDAK_DIKENAL, klien);
            throw new AuthError("UNAUTHENTICATED");
        }
        // Percobaan atas akun terkunci dicatat tetapi TIDAK dihitung (lihat `terapkanKegagalan`).
        if (sedangTerkunci(user.locked_until, sekarang)) {
            await this.catatGagalAnonim(user.id, ALASAN_AKUN_TERKUNCI, klien);
            throw new AuthError("UNAUTHENTICATED");
        }
        if (!cocok) {
            await this.catatKredensialSalah(user, klien, sekarang);
            throw new AuthError("UNAUTHENTICATED");
        }
        // Password sementara hasil reset yang lewat 72 jam ditolak seragam (FR-01.3 A3); bukan kegagalan
        // kredensial, jadi tidak menambah penghitung penguncian.
        if (user.wajib_ganti && (await this.passwordSementaraKedaluwarsa(user.id, sekarang, klien))) {
            throw new AuthError("UNAUTHENTICATED");
        }
        if (user.status !== "AKTIF") throw new DomainError("FORBIDDEN");

        // FR-01.5 langkah 5, SDD-04 §4.2 langkah 6: password benar tetapi sesi BELUM terbit — hanya
        // challenge 5 menit. Penghitung kegagalan sengaja TIDAK di-reset di sini: password yang benar
        // bukan bukti akun ini dikuasai pemiliknya, dan me-reset-nya membiarkan penyerang yang tahu
        // password menebak kode 6 digit tanpa pernah terkunci. Reset terjadi saat kode terbukti.
        if (user.totp_enabled_at !== null) {
            const token = await this.tantangan.terbitkan({ userId: user.id, platform: input.platform }, sekarang);
            return { jenis: "TANTANGAN", tantanganToken: token, expiresInDetik: TANTANGAN_TTL_DETIK };
        }

        const efektif = await this.permissions.load(Number(user.id));
        if (efektif === undefined) throw new AuthError("UNAUTHENTICATED");
        const ctx = createAuthContext({
            userId: Number(user.id),
            roleCode: efektif.roleCode,
            scopes: efektif.scopes,
        });

        const familyId = randomUUID();
        const refresh = bangkitkanRefreshToken();

        const profil = await this.db.transaction().setIsolationLevel("read committed").execute(async (tx) => {
            const repo = new AuthRepository(tx);
            // Kegagalan serentak dapat mengunci akun di antara pembacaan di atas dan sini; baris
            // dikunci lalu diperiksa ulang agar login tidak melewati penguncian yang baru terjadi.
            const status = await repo.kunciStatusGagal(user.id);
            if (status !== undefined && sedangTerkunci(status.locked_until, sekarang)) {
                await this.audit.writeAnonim(tx, entriGagal(user.id, ALASAN_AKUN_TERKUNCI, klien));
                return undefined;
            }
            await repo.sisipRefresh({
                userId: user.id,
                familyId,
                parentId: null,
                tokenHash: refresh.hash,
                platform: input.platform,
                ip: klien.ip ?? null,
                userAgent: potongUserAgent(klien.userAgent) ?? null,
                issuedAt: sekarang,
                expiresAt: new Date(sekarang.getTime() + REFRESH_TTL_DETIK[input.platform] * 1000),
                otpVerified: false,
            });
            await repo.catatLoginBerhasil(user.id, sekarang);
            // AL-01: dalam transaksi yang sama dengan penerbitan sesi.
            await this.audit.write(
                { ctx, tx },
                {
                    modul: MODUL,
                    aksi: "LOGIN_SUCCESS",
                    entitas: "users",
                    entitasId: user.id,
                    nilaiSesudah: { platform: input.platform },
                    ...jejakKlien(klien),
                },
            );
            return tx.selectFrom("users").select(["nama", "email"]).where("id", "=", user.id).executeTakeFirstOrThrow();
        });
        if (profil === undefined) throw new AuthError("UNAUTHENTICATED");

        return {
            jenis: "SESI",
            accessToken: this.jwt.terbitkan(
                { sub: user.id, sid: familyId, pwd: user.wajib_ganti, amr: amrSesi(false) },
                sekarang,
            ),
            refreshToken: refresh.token,
            platform: input.platform,
            expiresInDetik: ACCESS_TOKEN_TTL_DETIK,
            user: {
                id: user.id,
                nama: profil.nama,
                email: profil.email,
                role_kode: efektif.roleCode,
                must_change_password: user.wajib_ganti,
            },
            permissions: Object.fromEntries(efektif.scopes),
        };
    }

    /**
     * FR-01.3 A3: password sementara hasil reset berlaku 72 jam. Yang lewat ditolak seperti password
     * salah (401 seragam) dan permintaannya ditutup (`KEDALUWARSA`) saat itu juga — kedaluwarsa
     * ditegakkan di sini, tanpa pekerjaan terjadwal. Hanya berlaku bagi akun yang password-nya
     * ditetapkan penerbitan reset; akun baru buatan Administrator (FR-02.1) tak punya batas ini.
     */
    private async passwordSementaraKedaluwarsa(userId: string, sekarang: Date, klien: KlienPermintaan): Promise<boolean> {
        const terbit = await new AuthRepository(this.db).cariPenerbitanTerakhir(userId);
        if (terbit === undefined || terbit.status === "SELESAI") return false;
        if (terbit.kedaluwarsa_pada.getTime() > sekarang.getTime()) return false;
        await this.db.transaction().setIsolationLevel("read committed").execute(async (tx) => {
            if (terbit.status === "DITERBITKAN") await new AuthRepository(tx).kedaluwarsakanPermintaan(terbit.id);
            await this.audit.writeAnonim(tx, entriGagal(userId, ALASAN_PASSWORD_SEMENTARA_KEDALUWARSA, klien, { permintaan_id: terbit.id }));
        });
        return true;
    }

    /** `LOGIN_FAILED` tanpa menyentuh penghitung (email tak dikenal, atau akun sedang terkunci). */
    private async catatGagalAnonim(targetId: string | null, alasan: string, klien: KlienPermintaan): Promise<void> {
        await this.db
            .transaction()
            .setIsolationLevel("read committed")
            .execute((tx) => this.audit.writeAnonim(tx, entriGagal(targetId, alasan, klien)));
    }

    /**
     * Satu kegagalan password atas akun yang ADA (FR-01.1 A2, SDD-SESS-06). Penghitung, entri
     * log, dan — pada kegagalan yang menyebabkan penguncian — `ACCOUNT_LOCKED` beserta event
     * `AccountLocked` (NT-39) ditulis dalam SATU transaksi yang di-commit sebelum `401`
     * dijawab; melempar dari dalamnya akan membatalkan penghitungnya sendiri.
     */
    private async catatKredensialSalah(
        user: Pick<UserLogin, "id" | "role_kode">,
        klien: KlienPermintaan,
        sekarang: Date,
        alasan: string = ALASAN_KREDENSIAL_SALAH,
    ): Promise<Date | undefined> {
        const hasil = await this.db.transaction().setIsolationLevel("read committed").execute(async (tx) => {
            const repo = new AuthRepository(tx);
            const baris = await repo.kunciStatusGagal(user.id);
            const langkah =
                baris === undefined
                    ? ({ dihitung: false } as const)
                    : terapkanKegagalan(
                          {
                              hitungan: baris.failed_login_count,
                              awalJendela: baris.failed_login_window_start,
                              terkunciSampai: baris.locked_until,
                          },
                          sekarang,
                      );
            if (!langkah.dihitung) {
                // Terkunci oleh kegagalan serentak lain: dicatat, tidak dihitung.
                await this.audit.writeAnonim(tx, entriGagal(user.id, ALASAN_AKUN_TERKUNCI, klien));
                return undefined;
            }

            await repo.simpanStatusGagal(user.id, langkah.status);
            await this.audit.writeAnonim(
                tx,
                entriGagal(user.id, alasan, klien, { percobaan: langkah.status.hitungan }),
            );
            if (langkah.terkunciBaru && langkah.status.terkunciSampai !== null) {
                const terkunciSampai = langkah.status.terkunciSampai.toISOString();
                await this.audit.writeAnonim(tx, {
                    modul: MODUL,
                    aksi: "ACCOUNT_LOCKED",
                    entitas: "users",
                    entitasId: user.id,
                    nilaiSesudah: { terkunci_sampai: terkunciSampai, percobaan: langkah.status.hitungan },
                    ...jejakKlien(klien),
                });
                // SDD-EVT-04: terbit di dalam transaksi; konsumen NT-39 dipasang PR-02-25. Pelaku
                // outbox adalah akun yang terkunci — permintaan ini sendiri tidak berautentikasi.
                await publish(
                    {
                        ctx: createAuthContext({ userId: Number(user.id), roleCode: user.role_kode, scopes: new Map() }),
                        tx,
                    },
                    {
                        name: EVENT_AKUN_TERKUNCI,
                        aggregateType: AGREGAT_PENGGUNA,
                        aggregateId: user.id,
                        payload: { user_id: user.id, terkunci_sampai: terkunciSampai },
                    },
                );
            }
            return langkah;
        });

        if (hasil?.terkunciBaru === true) {
            // NFR-S-16, OBS-05: penguncian akun dapat dipantau. Pemanggil tidak diberi tahu.
            this.logger.warn("Akun terkunci karena percobaan login gagal", {
                user_id: user.id,
                percobaan: hasil.status.hitungan,
            });
            return hasil.status.terkunciSampai ?? undefined;
        }
        return undefined;
    }

    /**
     * `POST /auth/refresh` — rotasi (SDD-04 §4.3). Setiap kegagalan `401`. Pemakaian
     * ulang token yang sudah dirotasi mencabut SELURUH keluarga (SDD-SESS-04), dan
     * pencabutannya HARUS ter-commit meski permintaan berakhir 401 — karena itu hasil
     * transaksi dikembalikan sebagai nilai, bukan dilempar dari dalamnya.
     */
    async refresh(tokenMentah: string, klien: KlienPermintaan): Promise<SesiRefresh> {
        if (!bentukRefreshTokenSah(tokenMentah)) throw new AuthError("UNAUTHENTICATED");
        const tokenHash = hashRefreshToken(tokenMentah);
        const sekarang = this.clock.now();
        const baru = bangkitkanRefreshToken();

        const hasil = await this.db.transaction().setIsolationLevel("read committed").execute(async (tx) => {
            const repo = new AuthRepository(tx);
            const baris = await repo.cariRefreshUntukUbah(tokenHash);
            if (baris === undefined || baris.revoked_at !== null) return { jenis: "DITOLAK" } as const;

            const user = await repo.cariUserById(baris.user_id);

            if (baris.rotated_at !== null) {
                const dicabut = await repo.cabutKeluarga(baris.family_id, sekarang, "reuse_detected");
                // NFR-S-16: anomali keamanan tercatat dalam transaksi pencabutannya. Pelakunya
                // pemilik akun, yang tokennya dipakai ulang — permintaan ini tidak berautentikasi.
                const ctx = createAuthContext({
                    userId: Number(baris.user_id),
                    roleCode: user?.role_kode ?? "-",
                    scopes: new Map(),
                });
                await this.audit.write(
                    { ctx, tx },
                    {
                        modul: MODUL,
                        aksi: "REFRESH_TOKEN_REUSE_DETECTED",
                        entitas: "users",
                        entitasId: baris.user_id,
                        nilaiSesudah: { family_id: baris.family_id, token_dicabut: dicabut },
                        ...jejakKlien(klien),
                    },
                );
                return { jenis: "REUSE", userId: baris.user_id, familyId: baris.family_id, dicabut } as const;
            }
            if (baris.expires_at.getTime() <= sekarang.getTime()) return { jenis: "DITOLAK" } as const;
            if (user === undefined || user.status !== "AKTIF") {
                await repo.cabutKeluarga(baris.family_id, sekarang, "account_deactivated");
                return { jenis: "DITOLAK" } as const;
            }

            await repo.tandaiDirotasi(baris.id, sekarang);
            await repo.sisipRefresh({
                userId: baris.user_id,
                familyId: baris.family_id,
                parentId: baris.id,
                tokenHash: baru.hash,
                platform: baris.platform,
                ip: klien.ip ?? null,
                userAgent: potongUserAgent(klien.userAgent) ?? null,
                issuedAt: sekarang,
                expiresAt: new Date(sekarang.getTime() + REFRESH_TTL_DETIK[baris.platform] * 1000),
                // SDD-SESS-09: klaim faktor kedua diwarisi dari baris yang ditukar, tidak pernah dari klien.
                otpVerified: baris.otp_verified,
            });
            return {
                jenis: "OK",
                userId: baris.user_id,
                familyId: baris.family_id,
                platform: baris.platform,
                wajibGanti: user.wajib_ganti,
                otpVerified: baris.otp_verified,
            } as const;
        });

        if (hasil.jenis === "REUSE") {
            // OBS-05: alarm ke pemantauan. Notifikasi ke Administrator menunggu modul notifikasi.
            this.logger.error("Pemakaian ulang refresh token terdeteksi; keluarga dicabut", undefined, {
                user_id: hasil.userId,
                family_id: hasil.familyId,
                token_dicabut: hasil.dicabut,
            });
        }
        if (hasil.jenis !== "OK") throw new AuthError("UNAUTHENTICATED");

        return {
            accessToken: this.jwt.terbitkan(
                { sub: hasil.userId, sid: hasil.familyId, pwd: hasil.wajibGanti, amr: amrSesi(hasil.otpVerified) },
                sekarang,
            ),
            refreshToken: baru.token,
            platform: hasil.platform,
            expiresInDetik: ACCESS_TOKEN_TTL_DETIK,
        };
    }

    /**
     * `POST /auth/2fa/verify` — langkah kedua login (FR-01.5 langkah 5, SDD-04 §4.4). Menukar challenge
     * dan kode (TOTP 6 digit ATAU kode cadangan) dengan sesi. Password sudah terbukti pada langkah
     * pertama, jadi di sini — dan hanya di sini — akun terkunci boleh dijawab `423` beserta sisa waktu
     * (`SDD-SESS-12`, api-conventions 17.3).
     *
     * Kegagalan memakai penghitung dan penguncian yang SAMA dengan password (FR-01.5 A1: 5 kali → 15
     * menit); challenge tidak dihabiskan oleh kode yang salah, hanya oleh kode yang benar.
     */
    async verifikasiDuaFaktor(
        input: { readonly tantanganToken: string; readonly kode: string },
        klien: KlienPermintaan,
    ): Promise<SesiVerifikasi> {
        const sekarang = this.clock.now();
        const tantangan = await this.tantangan.baca(input.tantanganToken, sekarang);
        // Challenge tak dikenal/kedaluwarsa dan kode salah sama-sama 401 — pesannya tidak pernah dikirim untuk jawaban
        // autentikasi (SDD-AUTH-08); klien membedakannya lewat umur challenge (`expires_in`) dan `423`.
        if (tantangan === undefined) throw new AuthError("UNAUTHENTICATED");

        const efektif = await this.permissions.load(Number(tantangan.userId));
        if (efektif === undefined) throw new AuthError("UNAUTHENTICATED");
        const ctx = createAuthContext({
            userId: Number(tantangan.userId),
            roleCode: efektif.roleCode,
            scopes: efektif.scopes,
        });

        const familyId = randomUUID();
        const refresh = bangkitkanRefreshToken();

        const hasil = await this.db.transaction().setIsolationLevel("read committed").execute(async (tx) => {
            const repo = new AuthRepository(tx);
            const user = await repo.kunciUserDuaFaktor(tantangan.userId);
            if (
                user === undefined ||
                user.status !== "AKTIF" ||
                user.totp_enabled_at === null ||
                user.totp_secret_enc === null
            ) {
                return { jenis: "DITOLAK" } as const;
            }
            if (sedangTerkunci(user.locked_until, sekarang)) {
                return { jenis: "TERKUNCI", terkunciSampai: user.locked_until } as const;
            }

            const faktor = await this.cocokkanFaktorKedua(repo, user, user.totp_secret_enc, input.kode, sekarang);
            if (faktor === undefined) return { jenis: "SALAH", user } as const;
            if (faktor.jenis === "TOTP") {
                await repo.simpanLangkahTotp(user.id, faktor.langkah);
            } else if (!(await repo.pakaiKodeCadangan(faktor.kodeId, sekarang))) {
                // Kode yang sama dipakai verifikasi lain lebih dulu: satu kali pakai (FR-01.5 AC).
                return { jenis: "SALAH", user } as const;
            }

            await repo.sisipRefresh({
                userId: user.id,
                familyId,
                parentId: null,
                tokenHash: refresh.hash,
                platform: tantangan.platform,
                ip: klien.ip ?? null,
                userAgent: potongUserAgent(klien.userAgent) ?? null,
                issuedAt: sekarang,
                expiresAt: new Date(sekarang.getTime() + REFRESH_TTL_DETIK[tantangan.platform] * 1000),
                otpVerified: true,
            });
            await repo.catatLoginBerhasil(user.id, sekarang);
            const sisa = await repo.hitungKodeCadanganAktif(user.id);
            // AL-01: dalam transaksi yang sama dengan penerbitan sesi.
            await this.audit.write(
                { ctx, tx },
                {
                    modul: MODUL,
                    aksi: "LOGIN_SUCCESS",
                    entitas: "users",
                    entitasId: user.id,
                    nilaiSesudah: {
                        platform: tantangan.platform,
                        metode_2fa: faktor.jenis === "TOTP" ? "TOTP" : "KODE_CADANGAN",
                    },
                    ...jejakKlien(klien),
                },
            );
            if (faktor.jenis === "CADANGAN") {
                await this.audit.write(
                    { ctx, tx },
                    {
                        modul: MODUL,
                        aksi: "TWO_FA_BACKUP_CODE_USED",
                        entitas: "users",
                        entitasId: user.id,
                        nilaiSesudah: { sisa_kode: sisa },
                        ...jejakKlien(klien),
                    },
                );
            }
            return { jenis: "OK", user, sisa } as const;
        });

        if (hasil.jenis === "DITOLAK") {
            await this.tantangan.hapus(input.tantanganToken);
            throw new AuthError("UNAUTHENTICATED");
        }
        if (hasil.jenis === "TERKUNCI") {
            await this.tantangan.hapus(input.tantanganToken);
            throw galatTerkunci(hasil.terkunciSampai, sekarang);
        }
        if (hasil.jenis === "SALAH") {
            const terkunciSampai = await this.catatKredensialSalah(hasil.user, klien, sekarang, ALASAN_KODE_2FA_SALAH);
            if (terkunciSampai !== undefined) {
                await this.tantangan.hapus(input.tantanganToken);
                throw galatTerkunci(terkunciSampai, sekarang);
            }
            throw new AuthError("UNAUTHENTICATED");
        }

        // Kode benar: challenge dihabiskan. Kegagalan menghapusnya tidak membatalkan login yang sudah
        // ter-commit — challenge tetap mati sendiri ≤ 5 menit dan tak dapat dipakai tanpa kode lagi.
        await this.tantangan.hapus(input.tantanganToken).catch((galat: unknown) => {
            this.logger.warn("Challenge 2FA gagal dihapus setelah verifikasi berhasil", {
                user_id: hasil.user.id,
                galat: galat instanceof Error ? galat.message : "tidak diketahui",
            });
        });

        return {
            accessToken: this.jwt.terbitkan(
                { sub: hasil.user.id, sid: familyId, pwd: hasil.user.wajib_ganti, amr: amrSesi(true) },
                sekarang,
            ),
            refreshToken: refresh.token,
            platform: tantangan.platform,
            expiresInDetik: ACCESS_TOKEN_TTL_DETIK,
            user: {
                id: hasil.user.id,
                nama: hasil.user.nama,
                email: hasil.user.email,
                role_kode: efektif.roleCode,
                must_change_password: hasil.user.wajib_ganti,
            },
            permissions: Object.fromEntries(efektif.scopes),
            sisaKodeCadangan: hasil.sisa,
            kodeCadanganMenipis: hasil.sisa <= AMBANG_KODE_CADANGAN_MENIPIS,
        };
    }

    /**
     * Mencocokkan kode masukan dengan faktor kedua akun: 6 digit → TOTP; selain itu → kode cadangan.
     * Bentuk yang tidak cocok dengan keduanya ditolak TANPA menyentuh HMAC maupun Argon2id.
     * Rahasia yang tak dapat didekripsi (kunci salah pasang) dilempar apa adanya — itu kegagalan
     * konfigurasi (`500`), bukan kode yang salah; menghitungnya sebagai kegagalan pengguna akan
     * mengunci akun orang yang tidak bersalah.
     */
    private async cocokkanFaktorKedua(
        repo: AuthRepository,
        user: UserDuaFaktorRow,
        secretEnc: Buffer,
        kode: string,
        sekarang: Date,
    ): Promise<{ jenis: "TOTP"; langkah: number } | { jenis: "CADANGAN"; kodeId: string } | undefined> {
        if (bentukKodeTotpSah(kode)) {
            const secret = this.kotak.dekripsi(secretEnc, `totp:${user.id}`);
            const langkah = cocokkanTotp(secret, kode, sekarang, user.totp_last_step);
            return langkah === undefined ? undefined : { jenis: "TOTP", langkah };
        }
        const normal = normalisasiKodeCadangan(kode);
        if (normal === undefined) return undefined;
        for (const kandidat of await repo.daftarKodeCadanganAktif(user.id)) {
            if (await verifyPassword(kandidat.code_hash, normal)) return { jenis: "CADANGAN", kodeId: kandidat.id };
        }
        return undefined;
    }
}

/** `423` bagi langkah SESUDAH password terbukti; sisa waktu boleh ditampilkan (USER-FLOWS F-01). */
function galatTerkunci(terkunciSampai: Date | null, sekarang: Date): DomainError {
    const menit = Math.max(1, Math.ceil(((terkunciSampai?.getTime() ?? sekarang.getTime()) - sekarang.getTime()) / 60_000));
    return new DomainError(
        "ACCOUNT_LOCKED",
        `Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${String(menit)} menit.`,
    );
}
