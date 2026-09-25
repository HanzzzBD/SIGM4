// Route M-01 (SDD-AUTH-01, PM-01) + perakit router. Login dan refresh publik: keduanya
// justru yang menghasilkan kredensial, jadi tidak dapat menuntut autentikasi lebih dulu.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { AuthContext, OpsiAutentikasi, PermissionCache } from "../../shared/auth/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import type { Logger } from "../../shared/observability/index.js";
import type { JwtKeys, KotakRahasia } from "../../shared/security/index.js";
import { loginHandler, refreshHandler, verifikasiDuaFaktorHandler } from "./controllers/auth.controller.js";
import {
    forgotHandler,
    listPermintaanHandler,
    terbitkanHandler,
    tolakHandler,
} from "./controllers/password-reset.controller.js";
import {
    gantiPasswordHandler,
    lihatProfilHandler,
    perbaruiProfilHandler,
} from "./controllers/profile.controller.js";
import {
    buatUlangKodeCadanganHandler,
    enrollHandler,
    konfirmasiEnrollHandler,
} from "./controllers/two-factor.controller.js";
import {
    cabutSesiHandler,
    listSesiHandler,
    logoutHandler,
    logoutSemuaHandler,
} from "./controllers/session.controller.js";
import {
    ListSesiResponseSchema,
    LoginBodySchema,
    LoginResponseSchema,
    RefreshBodySchema,
    RefreshResponseSchema,
    SesiIdParamSchema,
    TanpaIsiSchema,
    VerifyDuaFaktorBodySchema,
    VerifyDuaFaktorResponseSchema,
} from "./schemas/auth.schema.js";
import {
    ForgotBodySchema,
    ForgotResponseSchema,
    ListPermintaanResponseSchema,
    PermintaanIdParamSchema,
    SinglePermintaanResponseSchema,
    TerbitkanBodySchema,
    TerbitkanResponseSchema,
    TolakBodySchema,
} from "./schemas/password-reset.schema.js";
import {
    MeResponseSchema,
    PasswordChangeBodySchema,
    PasswordChangeResponseSchema,
    UpdateProfilBodySchema,
    UpdateProfilResponseSchema,
} from "./schemas/profile.schema.js";
import {
    EnrollBodySchema,
    EnrollConfirmBodySchema,
    EnrollConfirmResponseSchema,
    EnrollResponseSchema,
    KodeCadanganResponseSchema,
} from "./schemas/two-factor.schema.js";
import { AuthService } from "./services/auth.service.js";
import { BreakGlassService } from "./services/break-glass.service.js";
import type { HasilKodeAktivasiCli, HasilPemulihan } from "./services/break-glass.service.js";
import { PasswordResetService } from "./services/password-reset.service.js";
import { PengelolaDuaFaktorService } from "./services/pengelola-dua-faktor.service.js";
import { ProfileService } from "./services/profile.service.js";
import { SessionService } from "./services/session.service.js";
import type { PenyimpanTantangan } from "./services/tantangan-dua-faktor.js";
import { TwoFactorService } from "./services/two-factor.service.js";

/** Pemilik katalog endpoint M-01 (m01-auth.md §7). */
const MODUL = "m01-auth";

/**
 * FR-01.1. Kelas `login` (SDD-13 §4.3): hanya percobaan gagal yang dihitung — login
 * yang berhasil tidak mengurangi jatah IP-nya.
 */
export const loginRoute = defineRoute({
    method: "POST",
    path: "/auth/login",
    public: true,
    rateLimitClass: "login",
    module: MODUL,
    summary: "Login email + password; menerbitkan access token EdDSA dan refresh token",
    body: LoginBodySchema,
    response: LoginResponseSchema,
});

/** SDD-SESS-04: rotasi refresh token; pemakaian ulang mencabut seluruh keluarganya. */
export const refreshRoute = defineRoute({
    method: "POST",
    path: "/auth/refresh",
    public: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Menukar refresh token dengan pasangan token baru",
    body: RefreshBodySchema,
    response: RefreshResponseSchema,
});

/**
 * FR-01.5 langkah 5. Publik: yang dibawanya challenge token, bukan sesi. Kelas `login`: kegagalan
 * kode dihitung pada sumbu IP (`SDD-13 §4.3`) sekaligus pada sumbu akun (penguncian `SDD-SESS-06`).
 */
export const verifyDuaFaktorRoute = defineRoute({
    method: "POST",
    path: "/auth/2fa/verify",
    public: true,
    rateLimitClass: "login",
    module: MODUL,
    summary: "Verifikasi faktor kedua (TOTP atau kode cadangan) dengan challenge token; menerbitkan sesi",
    successStatus: 200,
    body: VerifyDuaFaktorBodySchema,
    response: VerifyDuaFaktorResponseSchema,
});

/**
 * FR-01.5 langkah 1-2. `twoFactorExempt`: role wajib 2FA yang belum terdaftar justru harus dapat
 * menjangkau pendaftaran dengan sesi yang baru membuktikan password (`BR-070`).
 */
export const enrollDuaFaktorRoute = defineRoute({
    method: "POST",
    path: "/auth/2fa/enroll",
    authenticated: true,
    twoFactorExempt: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Mulai pendaftaran 2FA: secret TOTP + 10 kode cadangan (tampil sekali); role wajib 2FA menyertakan kode aktivasi (BR-070d)",
    successStatus: 200,
    body: EnrollBodySchema,
    response: EnrollResponseSchema,
});

/** FR-01.5 langkah 3-4: 6 digit dari authenticator mengaktifkan 2FA dan menaikkan sesi ini ke `amr` `otp`. */
export const konfirmasiDuaFaktorRoute = defineRoute({
    method: "POST",
    path: "/auth/2fa/enroll/confirm",
    authenticated: true,
    twoFactorExempt: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Konfirmasi pendaftaran 2FA dengan kode 6 digit; menerbitkan access token baru bagi sesi ini",
    successStatus: 200,
    body: EnrollConfirmBodySchema,
    response: EnrollConfirmResponseSchema,
});

/** FR-01.5 AC / UX P-77: hanya sesi yang sudah membuktikan faktor kedua. */
export const kodeCadanganBaruRoute = defineRoute({
    method: "POST",
    path: "/auth/2fa/backup-codes/regenerate",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Membuat ulang seluruh kode cadangan 2FA (yang lama tak berlaku lagi)",
    successStatus: 200,
    response: KodeCadanganResponseSchema,
});

/**
 * FR-01.2. Keempat route berikut `authenticated: true` (endpoint "Bearer", `SDD-AUTH-12`): datanya
 * milik pemanggil sendiri, jadi tidak ada permission katalog — scope `own` ditegakkan repository.
 */
export const logoutRoute = defineRoute({
    method: "POST",
    path: "/auth/logout",
    authenticated: true,
    // BR-070: jalan keluar sesi yang belum lolos 2FA.
    twoFactorExempt: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Logout: mencabut sesi yang membawa permintaan ini",
    successStatus: 204,
    response: TanpaIsiSchema,
});

/** FR-01.2 A1 — `LOGOUT_ALL_DEVICES`. */
export const logoutSemuaRoute = defineRoute({
    method: "POST",
    path: "/auth/logout-all",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Keluar dari semua perangkat: mencabut seluruh sesi pengguna",
    successStatus: 204,
    response: TanpaIsiSchema,
});

/** UX P-79 Perangkat Terhubung: sesi aktif milik pengguna, satu per keluarga refresh token. */
export const listSesiRoute = defineRoute({
    method: "GET",
    path: "/auth/sessions",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar sesi (perangkat) aktif milik pengguna",
    response: ListSesiResponseSchema,
});

/** Sesi milik orang lain dan sesi yang tidak ada dijawab sama: 403 (SDD-AUTH-08). */
export const cabutSesiRoute = defineRoute({
    method: "DELETE",
    path: "/auth/sessions/:id",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Mencabut satu sesi (perangkat) milik pengguna sendiri",
    params: SesiIdParamSchema,
    successStatus: 204,
    response: TanpaIsiSchema,
});

/**
 * FR-01.3 — reset password administratif. `forgot` publik dan SELALU menjawab sama (A1); sisanya milik
 * Administrator (`user.reset_password`, Lampiran C) — antrean P-67.
 */
export const forgotPasswordRoute = defineRoute({
    method: "POST",
    path: "/auth/password/forgot",
    public: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Ajukan permintaan reset password (jawaban netral untuk email apa pun)",
    successStatus: 202,
    body: ForgotBodySchema,
    response: ForgotResponseSchema,
});

export const listPermintaanResetRoute = defineRoute({
    method: "GET",
    path: "/auth/password/requests",
    permission: "user.reset_password",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Antrean permintaan reset password (P-67)",
    response: ListPermintaanResponseSchema,
});

/** Password sementara tampil SATU kali pada respons ini; tak dapat dibaca ulang (FR-01.3 AC). */
export const terbitkanResetRoute = defineRoute({
    method: "POST",
    path: "/auth/password/requests/:id/issue",
    permission: "user.reset_password",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Terbitkan password sementara atas satu permintaan (metode verifikasi wajib)",
    successStatus: 200,
    params: PermintaanIdParamSchema,
    body: TerbitkanBodySchema,
    response: TerbitkanResponseSchema,
});

export const tolakResetRoute = defineRoute({
    method: "POST",
    path: "/auth/password/requests/:id/reject",
    permission: "user.reset_password",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Tolak satu permintaan reset password beserta alasannya",
    successStatus: 200,
    params: PermintaanIdParamSchema,
    body: TolakBodySchema,
    response: SinglePermintaanResponseSchema,
});

/**
 * FR-01.4. `/me` bukan `/auth/*`: gerbang ganti password (`SDD-AUTH-09`) memblokirnya sampai
 * password diganti — konsisten dengan "seluruh menu lain diblokir" (`FR-01.1 A4`).
 */
export const lihatProfilRoute = defineRoute({
    method: "GET",
    path: "/me",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Profil & permission pengguna yang sedang login",
    response: MeResponseSchema,
});

/** Email dan role tidak diterima di sini (`BR-069`); foto menunggu `PR-03-04` (keputusan 4). */
export const perbaruiProfilRoute = defineRoute({
    method: "PUT",
    path: "/me",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Perbarui nama/telepon profil sendiri",
    body: UpdateProfilBodySchema,
    response: UpdateProfilResponseSchema,
});

/** FR-01.4 langkah 2-4: mencabut sesi lain; `successStatus` eksplisit karena PRD menetapkan `200`. */
export const gantiPasswordRoute = defineRoute({
    method: "POST",
    path: "/auth/password/change",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Ganti password sendiri; mencabut seluruh sesi lain",
    successStatus: 200,
    body: PasswordChangeBodySchema,
    response: PasswordChangeResponseSchema,
});

export interface AuthModuleDeps {
    readonly db: Kysely<Database>;
    readonly jwtKeys: JwtKeys;
    readonly permissionCache: PermissionCache;
    readonly auditLogger: AuditLogger;
    readonly clock: Clock;
    readonly logger: Logger;
    /** Kunci enkripsi secret TOTP (`TOTP_ENCRYPTION_KEY`, `SDD-SESS-08`). */
    readonly kotakTotp: KotakRahasia;
    /** Penyimpan challenge 2FA (`SDD-SESS-10`): Redis pada produksi. */
    readonly penyimpanTantangan: PenyimpanTantangan;
}

/** Opsi `authenticated()` dari deklarasi route: pengecualian 2FA hidup di SATU tempat, deklarasinya. */
function opsiDuaFaktor(route: { readonly twoFactorExempt?: true }): OpsiAutentikasi {
    return { tanpaDuaFaktor: route.twoFactorExempt === true };
}

export function authRouter(
    deps: AuthModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    terautentikasi: (opsi?: OpsiAutentikasi) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new AuthService(
        deps.db,
        deps.jwtKeys,
        deps.permissionCache,
        deps.auditLogger,
        deps.clock,
        deps.logger,
        deps.kotakTotp,
        deps.penyimpanTantangan,
    );
    const duaFaktor = new TwoFactorService(deps.db, deps.jwtKeys, deps.auditLogger, deps.clock, deps.kotakTotp);
    const sesi = new SessionService(deps.db, deps.auditLogger, deps.clock);
    const reset = new PasswordResetService(deps.db, deps.auditLogger, deps.clock, deps.logger);
    const profil = new ProfileService(deps.db, deps.jwtKeys, deps.permissionCache, deps.auditLogger, deps.clock);
    const router = express.Router();
    router.post(loginRoute.path, batasi(loginRoute), loginHandler(service));
    router.post(refreshRoute.path, batasi(refreshRoute), refreshHandler(service));
    router.post(verifyDuaFaktorRoute.path, batasi(verifyDuaFaktorRoute), verifikasiDuaFaktorHandler(service));
    router.post(
        enrollDuaFaktorRoute.path,
        batasi(enrollDuaFaktorRoute),
        terautentikasi(opsiDuaFaktor(enrollDuaFaktorRoute)),
        enrollHandler(duaFaktor),
    );
    router.post(
        konfirmasiDuaFaktorRoute.path,
        batasi(konfirmasiDuaFaktorRoute),
        terautentikasi(opsiDuaFaktor(konfirmasiDuaFaktorRoute)),
        konfirmasiEnrollHandler(duaFaktor),
    );
    router.post(kodeCadanganBaruRoute.path, batasi(kodeCadanganBaruRoute), terautentikasi(), buatUlangKodeCadanganHandler(duaFaktor));
    router.post(logoutRoute.path, batasi(logoutRoute), terautentikasi(opsiDuaFaktor(logoutRoute)), logoutHandler(sesi));
    router.post(logoutSemuaRoute.path, batasi(logoutSemuaRoute), terautentikasi(), logoutSemuaHandler(sesi));
    router.get(listSesiRoute.path, batasi(listSesiRoute), terautentikasi(), listSesiHandler(sesi));
    router.delete(cabutSesiRoute.path, batasi(cabutSesiRoute), terautentikasi(), cabutSesiHandler(sesi));
    router.post(forgotPasswordRoute.path, batasi(forgotPasswordRoute), forgotHandler(reset));
    router.get(listPermintaanResetRoute.path, batasi(listPermintaanResetRoute), otorisasi(listPermintaanResetRoute.permission), listPermintaanHandler(reset));
    router.post(terbitkanResetRoute.path, batasi(terbitkanResetRoute), otorisasi(terbitkanResetRoute.permission), terbitkanHandler(reset));
    router.post(tolakResetRoute.path, batasi(tolakResetRoute), otorisasi(tolakResetRoute.permission), tolakHandler(reset));
    router.get(lihatProfilRoute.path, batasi(lihatProfilRoute), terautentikasi(), lihatProfilHandler(profil));
    router.put(perbaruiProfilRoute.path, batasi(perbaruiProfilRoute), terautentikasi(), perbaruiProfilHandler(profil));
    router.post(gantiPasswordRoute.path, batasi(gantiPasswordRoute), terautentikasi(), gantiPasswordHandler(profil));
    return router;
}

/**
 * Pintu bagi modul lain yang menerbitkan password sementara TANPA mengimpor internal m01-auth
 * (SDD-SYS-03): `POST /users/{id}/reset-password` milik M-02 menerimanya lewat injeksi di composition
 * root. Bentuknya sengaja sempit — bukan `PasswordResetService` utuh.
 */
export function buatPenerbitPasswordSementara(deps: AuthModuleDeps): PenerbitPasswordSementara {
    const layanan = new PasswordResetService(deps.db, deps.auditLogger, deps.clock, deps.logger);
    return {
        terbitkanLangsung: async (ctx, userId, metode, klien) => {
            const hasil = await layanan.terbitkanLangsung(ctx, userId, metode, klien);
            return {
                permintaanId: hasil.permintaan.id,
                berlakuSampai: hasil.permintaan.kedaluwarsa_pada ?? new Date(0),
                passwordSementara: hasil.passwordSementara,
            };
        },
    };
}

export interface PenerbitPasswordSementara {
    terbitkanLangsung(
        ctx: AuthContext,
        userId: string,
        metode: "KARTU_IDENTITAS_TATAP_MUKA" | "KONFIRMASI_ATASAN_ATAU_WALI_KELAS",
        klien: { readonly ip: string | undefined; readonly userAgent: string | undefined },
    ): Promise<{ permintaanId: string; berlakuSampai: Date; passwordSementara: string }>;
}

/**
 * Pintu bagi M-02 untuk mengelola 2FA pengguna lain (`POST /users/{id}/reset-2fa` dan
 * `POST /users/{id}/2fa-activation-code`, PR-02-33) TANPA mengimpor internal m01-auth (SDD-SYS-03). Bentuknya
 * didefinisikan pemakai (`m02-users`) dan dipenuhi secara struktural di sini.
 */
export function buatPengelolaDuaFaktor(deps: AuthModuleDeps): PengelolaDuaFaktor {
    const layanan = new PengelolaDuaFaktorService(deps.db, deps.auditLogger, deps.clock);
    return {
        terbitkanKodeAktivasi: (ctx, userId, metode, klien) => layanan.terbitkanKodeAktivasi(ctx, userId, metode, klien),
        reset: (ctx, userId, metode, klien) => layanan.reset(ctx, userId, metode, klien),
    };
}

export interface PengelolaDuaFaktor {
    terbitkanKodeAktivasi(
        ctx: AuthContext,
        userId: string,
        metode: "KARTU_IDENTITAS_TATAP_MUKA" | "KONFIRMASI_ATASAN_ATAU_WALI_KELAS",
        klien: { readonly ip: string | undefined; readonly userAgent: string | undefined },
    ): Promise<{ kode: string; berlakuSampai: Date }>;
    reset(
        ctx: AuthContext,
        userId: string,
        metode: "KARTU_IDENTITAS_TATAP_MUKA" | "KONFIRMASI_ATASAN_ATAU_WALI_KELAS",
        klien: { readonly ip: string | undefined; readonly userAgent: string | undefined },
    ): Promise<{ sesiDicabut: number; kodeAktivasi: { kode: string; berlakuSampai: Date } | null }>;
}

/** Deps CLI (`worker/cli.ts`, PR-02-08) sengaja SEMPIT, bukan `AuthModuleDeps`: proses terpisah
 * dari sigm4-api, tanpa kunci JWT, `PermissionCache`, kotak TOTP, maupun penyimpan challenge
 * Redis — hanya yang benar-benar dipakai perintah break-glass (`SDD-SESS-11`). */
export interface BreakGlassCliDeps {
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
    readonly clock: Clock;
    readonly logger: Logger;
}

/**
 * Pintu bagi CLI break-glass (`FR-01.6`) dan kode aktivasi darurat (`FR-01.5 A6`, `PR-02-08`)
 * TANPA mengimpor internal m01-auth (SDD-SYS-03). Tidak pernah dipanggil dari jalur HTTP —
 * `worker/cli.ts` adalah SATU-SATUNYA pemanggil (`SDD-SESS-11`).
 */
export function buatBreakGlassCli(deps: BreakGlassCliDeps): BreakGlassCli {
    const layanan = new BreakGlassService(deps.db, deps.auditLogger, deps.clock, deps.logger);
    return {
        pulihkan: (email, paksa) => layanan.pulihkan(email, paksa),
        terbitkanKodeAktivasi: (email) => layanan.terbitkanKodeAktivasi(email),
    };
}

export interface BreakGlassCli {
    pulihkan(email: string, paksa: boolean): Promise<HasilPemulihan>;
    terbitkanKodeAktivasi(email: string): Promise<HasilKodeAktivasiCli>;
}
