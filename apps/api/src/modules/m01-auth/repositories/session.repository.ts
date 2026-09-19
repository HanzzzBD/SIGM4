// Repository sesi pengguna (`refresh_tokens`, SDD-04 §4.6). Berbeda dari `AuthRepository`
// (pra-autentikasi), semua metode di sini dipanggil oleh pengguna yang sudah login dan
// menerima `AuthContext` (SDD-AUTH-05). Scope-nya selalu `own`: setiap kueri disaring pada
// `user_id = ctx.userId` — tidak ada parameter yang dapat menunjuk sesi milik orang lain.
//
// PRIVAT terhadap modul (SDD-SYS-03).

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export type PlatformSesi = "WEB" | "ANDROID" | "IOS";

/** Satu sesi aktif = satu keluarga refresh token; barisnya adalah token yang sedang berlaku. */
export interface SesiRow {
    readonly id: string;
    readonly platform: PlatformSesi;
    readonly ip: string | null;
    readonly user_agent: string | null;
    readonly dibuat_pada: Date;
    readonly terakhir_diperbarui: Date;
    readonly berlaku_sampai: Date;
}

export interface SesiDicabut {
    readonly familyId: string;
    readonly platform: PlatformSesi;
}

export class SessionRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /**
     * Sesi aktif milik pemanggil: token yang sedang berlaku (belum dirotasi, belum dicabut,
     * belum kedaluwarsa) — tepat satu per keluarga. `dibuat_pada` = penerbitan token pertama
     * keluarga (login), `terakhir_diperbarui` = penerbitan token yang sedang berlaku.
     */
    async daftarAktif(ctx: AuthContext, sekarang: Date): Promise<readonly SesiRow[]> {
        const baris = await this.query(ctx)
            .selectFrom("refresh_tokens as r")
            .select([
                "r.family_id",
                "r.platform",
                "r.ip",
                "r.user_agent",
                "r.issued_at as terakhir_diperbarui",
                "r.expires_at as berlaku_sampai",
                sql<Date>`(SELECT min(x.issued_at) FROM refresh_tokens x WHERE x.family_id = r.family_id)`.as("dibuat_pada"),
            ])
            .where("r.user_id", "=", String(ctx.userId))
            .where("r.rotated_at", "is", null)
            .where("r.revoked_at", "is", null)
            .where("r.expires_at", ">", sekarang)
            .orderBy("r.issued_at", "desc")
            .execute();
        return baris.map((b) => ({
            id: b.family_id,
            platform: b.platform,
            ip: b.ip,
            user_agent: b.user_agent,
            dibuat_pada: b.dibuat_pada,
            terakhir_diperbarui: b.terakhir_diperbarui,
            berlaku_sampai: b.berlaku_sampai,
        }));
    }

    /** Apakah keluarga ini pernah menjadi milik pemanggil (apa pun keadaannya sekarang). */
    async adaMilik(ctx: AuthContext, familyId: string): Promise<boolean> {
        const baris = await this.query(ctx)
            .selectFrom("refresh_tokens")
            .select("id")
            .where("family_id", "=", familyId)
            .where("user_id", "=", String(ctx.userId))
            .limit(1)
            .executeTakeFirst();
        return baris !== undefined;
    }

    /** Mencabut seluruh baris keluarga yang belum dicabut; mengembalikan platformnya bila ada yang dicabut. */
    async cabutKeluarga(ctx: AuthContext, familyId: string, waktu: Date, alasan: string): Promise<SesiDicabut | undefined> {
        const baris = await this.query(ctx)
            .updateTable("refresh_tokens")
            .set({ revoked_at: waktu, revoke_reason: alasan })
            .where("family_id", "=", familyId)
            .where("user_id", "=", String(ctx.userId))
            .where("revoked_at", "is", null)
            .returning(["family_id", "platform"])
            .execute();
        const pertama = baris[0];
        return pertama === undefined ? undefined : { familyId: pertama.family_id, platform: pertama.platform };
    }

    /** Mencabut seluruh sesi pemanggil; satu entri per keluarga yang benar-benar dicabut. */
    async cabutSemua(ctx: AuthContext, waktu: Date, alasan: string): Promise<readonly SesiDicabut[]> {
        const baris = await this.query(ctx)
            .updateTable("refresh_tokens")
            .set({ revoked_at: waktu, revoke_reason: alasan })
            .where("user_id", "=", String(ctx.userId))
            .where("revoked_at", "is", null)
            .returning(["family_id", "platform"])
            .execute();
        const perKeluarga = new Map<string, SesiDicabut>();
        for (const b of baris) perKeluarga.set(b.family_id, { familyId: b.family_id, platform: b.platform });
        return [...perKeluarga.values()];
    }
}

/** Pintu masuk repository: `defineRepository` menolak metode yang tidak menerima `AuthContext` (SDD-AUTH-02). */
export function createSessionRepository(executor: QueryExecutor): SessionRepository {
    return defineRepository(new SessionRepository(executor));
}
