import { sql } from "kysely";
import type { TransactionScope } from "../../shared/db/index.js";
import { ForbiddenError, NotFoundError, DomainError } from "../../shared/errors/index.js";
export const dateColumn = (name: string) => sql<string>`to_char(${sql.ref(name)}, 'YYYY-MM-DD')`;
export const invalid = (message: string, field = "status") => new DomainError("VALIDATION_ERROR", message, { errors: [{ field, message }] });
export async function lockSession(scope: TransactionScope, id: string) {
    const row = await scope.tx.selectFrom("audit_sessions").selectAll().select([dateColumn("periode_mulai").as("periode_mulai"), dateColumn("periode_selesai").as("periode_selesai")]).where("id", "=", id).forUpdate().executeTakeFirst();
    if (!row) throw new NotFoundError("Sesi opname tidak ditemukan.");
    return row;
}
export async function requireAssignee(scope: TransactionScope, id: string) {
    if (!await scope.tx.selectFrom("audit_session_assignees").select("user_id").where("session_id", "=", id).where("user_id", "=", String(scope.ctx.userId)).executeTakeFirst()) throw new ForbiddenError();
}
export function requireRunning(row: { status: string; finalized_at: Date | null }, scanning = false) {
    if (row.status !== "BERJALAN" || (scanning && row.finalized_at !== null)) throw invalid("Sesi sudah difinalisasi, menunggu persetujuan, atau tertutup.");
}
