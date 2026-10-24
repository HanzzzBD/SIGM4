import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

class PrivacyRepository extends BaseRepository {
    constructor(db: QueryExecutor) { super(db); }
    async administrator(ctx: AuthContext) {
        return this.query(ctx).selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id")
            .select("u.id").where("u.id", "=", String(ctx.userId)).where("u.status", "=", "AKTIF").where("r.kode", "=", "R-01")
            .where(eb => eb.exists(eb.selectFrom("role_permissions as rp").innerJoin("permissions as p", "p.id", "rp.permission_id")
                .select("p.id").whereRef("rp.role_id", "=", "r.id").where("p.kode", "=", "user.update").where("rp.scope", "=", "ALL"))).executeTakeFirst();
    }
    async lock(ctx: AuthContext, id: number) {
        return this.query(ctx).selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id")
            .select(["u.id", "u.status", "u.deactivated_at", "u.pseudonymized_at", "r.kode as role"])
            .where("u.id", "=", String(id)).forUpdate("u").executeTakeFirst();
    }
    async due(ctx: AuthContext, now: Date, after: number) {
        return this.query(ctx).selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id")
            .select("u.id").where("u.id", ">", String(after)).where("r.kode", "=", "R-07")
            .where("u.status", "=", "NONAKTIF").where("u.pseudonymized_at", "is", null)
            .where(sql<boolean>`((u.deactivated_at at time zone 'Asia/Jakarta') + interval '2 years') at time zone 'Asia/Jakarta' <= ${now}`)
            .orderBy("u.id").limit(100).execute();
    }
    async dueLocked(ctx: AuthContext, id: number, now: Date) {
        return this.query(ctx).selectFrom("users").select("id").where("id", "=", String(id))
            .where(sql<boolean>`((deactivated_at at time zone 'Asia/Jakarta') + interval '2 years') at time zone 'Asia/Jakarta' <= ${now}`).executeTakeFirst();
    }
    async erase(ctx: AuthContext, id: number, now: Date) {
        const db = this.query(ctx), userId = String(id);
        await db.updateTable("users").set({ nama: `Pengguna Terhapus #${id}`, email: `deleted+${id}@invalid.local`, nip_nis: null,
            telepon: null, work_unit_id: null, password_hash: `!pseudonymized:${randomUUID()}`, must_change_password: false,
            totp_secret_enc: null, totp_enabled_at: null, totp_last_step: null, failed_login_count: 0, failed_login_window_start: null,
            locked_until: null, status: "NONAKTIF", pseudonymized_at: now, updated_by: pelakuId(ctx),
            unit_kerja: sql<never>`null` })
            .where("id", "=", userId).where("pseudonymized_at", "is", null).executeTakeFirstOrThrow();
        await db.updateTable("refresh_tokens").set({ revoked_at: now }).where("user_id", "=", userId).where("revoked_at", "is", null).execute();
        await db.deleteFrom("totp_backup_codes").where("user_id", "=", userId).execute();
        await db.deleteFrom("totp_activation_codes").where("user_id", "=", userId).execute();
        await db.deleteFrom("password_history").where("user_id", "=", userId).execute();
        await db.deleteFrom("device_tokens").where("user_id", "=", userId).execute();
        // Expire issued passwords; reject pending requests without deleting their history.
        await db.updateTable("password_reset_requests").set({ status: "KEDALUWARSA" }).where("user_id", "=", userId).where("status", "=", "DITERBITKAN").execute();
        await db.updateTable("password_reset_requests").set({ status: "DITOLAK", diproses_oleh: pelakuId(ctx), diproses_pada: now, privacy_revoked_at: now,
            alasan_penolakan: "Akun telah dipseudonimkan; pemulihan tidak tersedia." }).where("user_id", "=", userId).where("status", "=", "MENUNGGU").execute();
    }
}
export const privacyRepository = (db: QueryExecutor) => defineRepository(new PrivacyRepository(db));
