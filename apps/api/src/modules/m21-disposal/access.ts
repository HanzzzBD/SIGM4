import { sql } from "kysely";
import { DomainError } from "../../shared/errors/index.js";
import type { TransactionScope } from "../../shared/db/index.js";
export const invalid = (message: string, field = "status") => new DomainError("VALIDATION_ERROR", message, { errors: [{ field, message }] });
export const wibDate = (now: Date) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
export const dateColumn = (name: string) => sql<string | null>`to_char(${sql.ref(name)},'YYYY-MM-DD')`;
export async function disposalBlockers(scope: TransactionScope, ids: readonly string[], now: Date, owner?: string) {
    const result = new Map(ids.map(id => [id, [] as string[]])); if (!ids.length) return result;
    const [claims, loans, slots, work, audits] = await Promise.all([
        scope.tx.selectFrom("asset_disposal_claims").select(["asset_id", "disposal_id"]).where("asset_id", "in", ids).$if(owner !== undefined, q => q.where("disposal_id", "!=", owner!)).execute(),
        scope.tx.selectFrom("loan_items").select(["asset_id", "loan_id"]).where("asset_id", "in", ids).where("status_kembali", "=", "BELUM_KEMBALI").execute(),
        scope.tx.selectFrom("booking_slots").select(["resource_id", "reservation_id", "loan_id", "id"]).where("resource_type", "=", "asset").where("resource_id", "in", ids).where("status", "in", ["TENTATIVE", "CONFIRMED", "ACTIVE"]).where(sql<boolean>`slot_range IS NOT NULL AND upper(slot_range)>${now}::timestamptz`).execute(),
        scope.tx.selectFrom("work_orders").select(["asset_id", "id"]).where("asset_id", "in", ids).where("status", "not in", ["SELESAI", "DIBATALKAN"]).execute(),
        scope.tx.selectFrom("audit_active_assets").select(["asset_id", "session_id"]).where("asset_id", "in", ids).execute(),
    ]);
    for (const r of claims) result.get(r.asset_id)!.push(`Usulan penghapusan #${r.disposal_id}`);
    for (const r of loans) result.get(r.asset_id)!.push(`Peminjaman #${r.loan_id} belum kembali`);
    for (const r of slots) result.get(r.resource_id)!.push(`Slot #${r.id}${r.reservation_id ? ` reservasi #${r.reservation_id}` : r.loan_id ? ` pinjaman #${r.loan_id}` : ""}`);
    for (const r of work) result.get(r.asset_id!)!.push(`Work order #${r.id} belum ditutup`);
    for (const r of audits) result.get(r.asset_id)!.push(`Opname #${r.session_id} aktif`);
    return result;
}
export async function lockAssets(scope: TransactionScope, ids: readonly string[]) {
    return scope.tx.selectFrom("assets").select(["id", "kondisi", "room_id", "dihapuskan", "nilai_perolehan"]).where("id", "in", ids).orderBy("id").forUpdate().execute();
}
