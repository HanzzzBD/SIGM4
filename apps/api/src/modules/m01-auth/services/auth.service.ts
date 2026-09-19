// AuthService — login dan rotasi refresh token (FR-01.1, SDD-SESS-02/03/04, SDD-04 §4.2–4.3).
//
// Bukan bagian PR-02-02 (masing-masing PR-nya sendiri): penguncian akun dan `LOGIN_FAILED`
// (PR-02-03), logout dan pencabutan sesi (PR-02-04), ganti password (PR-02-06), 2FA (PR-02-07).

import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { AuditEntry, AuditLogger } from "../../../shared/audit/index.js";
import { createAuthContext } from "../../../shared/auth/index.js";
import type { PermissionCache } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { AuthError, DomainError } from "../../../shared/errors/index.js";
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

const MODUL = "m01-auth";
const AMR_PASSWORD = ["pwd"] as const;
const BATAS_USER_AGENT = 500;

export interface KlienPermintaan {
    readonly ip: string | undefined;
    readonly userAgent: string | undefined;
}

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

function potongUserAgent(ua: string | undefined): string | undefined {
    return ua === undefined ? undefined : ua.slice(0, BATAS_USER_AGENT);
}

/** IP dan perangkat pada entri log (AL-02); kunci yang tak diketahui tidak disertakan. */
function jejakKlien(klien: KlienPermintaan): Pick<AuditEntry, "ip" | "userAgent"> {
    const userAgent = potongUserAgent(klien.userAgent);
    return {
        ...(klien.ip === undefined ? {} : { ip: klien.ip }),
        ...(userAgent === undefined ? {} : { userAgent }),
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
     * `POST /auth/login`. Kredensial salah dan email tak dikenal SAMA-SAMA `401
     * UNAUTHENTICATED` (tidak membocorkan apakah email terdaftar); akun nonaktif baru
     * diketahui SETELAH password benar (`403`, FR-01.1 A3).
     */
    async login(
        input: { readonly email: string; readonly password: string; readonly platform: PlatformPerangkat },
        klien: KlienPermintaan,
    ): Promise<SesiLogin> {
        const user = await new AuthRepository(this.db).cariUserByEmail(input.email);
        const cocok = await verifyPassword(user?.password_hash ?? (await ambilHashPengganti()), input.password);
        if (user === undefined || !cocok) throw new AuthError("UNAUTHENTICATED");
        if (user.status !== "AKTIF") throw new DomainError("FORBIDDEN");

        const efektif = await this.permissions.load(Number(user.id));
        if (efektif === undefined) throw new AuthError("UNAUTHENTICATED");
        const ctx = createAuthContext({
            userId: Number(user.id),
            roleCode: efektif.roleCode,
            scopes: efektif.scopes,
        });

        const sekarang = this.clock.now();
        const familyId = randomUUID();
        const refresh = bangkitkanRefreshToken();

        const profil = await this.db.transaction().setIsolationLevel("read committed").execute(async (tx) => {
            const repo = new AuthRepository(tx);
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
            await repo.catatLoginTerakhir(user.id, sekarang);
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

        return {
            accessToken: this.jwt.terbitkan(
                { sub: user.id, sid: familyId, pwd: user.must_change_password, amr: AMR_PASSWORD },
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
                must_change_password: user.must_change_password,
            },
            permissions: Object.fromEntries(efektif.scopes),
        };
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
                mustChangePassword: user.must_change_password,
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
                { sub: hasil.userId, sid: hasil.familyId, pwd: hasil.mustChangePassword, amr: AMR_PASSWORD },
                sekarang,
            ),
            refreshToken: baru.token,
            platform: hasil.platform,
            expiresInDetik: ACCESS_TOKEN_TTL_DETIK,
        };
    }
}
