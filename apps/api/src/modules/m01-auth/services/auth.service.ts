// AuthService — login, penguncian akun, dan rotasi refresh token (FR-01.1, SDD-SESS-02/03/04/06/12,
// SDD-04 §4.2–4.3).
//
// Bukan bagian PR ini (masing-masing PR-nya sendiri): logout dan pencabutan sesi (PR-02-04),
// ganti password (PR-02-06), 2FA (PR-02-07).

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
    bentukRefreshTokenSah,
    hashPassword,
    hashRefreshToken,
    verifyPassword,
} from "../../../shared/security/index.js";
import type { JwtKeys, PlatformPerangkat } from "../../../shared/security/index.js";
import { AuthRepository } from "../repositories/auth.repository.js";
import type { UserLogin } from "../repositories/auth.repository.js";
import { jejakKlien, potongUserAgent } from "./klien.js";
import type { KlienPermintaan } from "./klien.js";
import { sedangTerkunci, terapkanKegagalan } from "./lockout.js";

const MODUL = "m01-auth";
const AMR_KREDENSIAL = ["pwd"] as const;

/** Event outbox penguncian akun (SDD-07 §4.3); konsumennya — notifikasi `NT-39` — dipasang `PR-02-25`. */
export const EVENT_AKUN_TERKUNCI = "AccountLocked";
const AGREGAT_PENGGUNA = "user";

/** Alasan internal pada `LOGIN_FAILED`; TIDAK pernah sampai ke pemanggil (`SDD-SESS-12`). */
const ALASAN_EMAIL_TIDAK_DIKENAL = "EMAIL_TIDAK_DIKENAL";
const ALASAN_KREDENSIAL_SALAH = "KREDENSIAL_SALAH";
const ALASAN_AKUN_TERKUNCI = "AKUN_TERKUNCI";

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
    ): Promise<SesiLogin> {
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
        if (user.status !== "AKTIF") throw new DomainError("FORBIDDEN");

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
            accessToken: this.jwt.terbitkan(
                { sub: user.id, sid: familyId, pwd: user.wajib_ganti, amr: AMR_KREDENSIAL },
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
    private async catatKredensialSalah(user: UserLogin, klien: KlienPermintaan, sekarang: Date): Promise<void> {
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
                entriGagal(user.id, ALASAN_KREDENSIAL_SALAH, klien, { percobaan: langkah.status.hitungan }),
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
        }
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
            });
            return {
                jenis: "OK",
                userId: baris.user_id,
                familyId: baris.family_id,
                platform: baris.platform,
                wajibGanti: user.wajib_ganti,
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
                { sub: hasil.userId, sid: hasil.familyId, pwd: hasil.wajibGanti, amr: AMR_KREDENSIAL },
                sekarang,
            ),
            refreshToken: baru.token,
            platform: hasil.platform,
            expiresInDetik: ACCESS_TOKEN_TTL_DETIK,
        };
    }
}
