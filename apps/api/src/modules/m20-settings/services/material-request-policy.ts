import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { ForbiddenError, NotFoundError, DomainError } from "../../../shared/errors/index.js";
export const MATERIAL_DEFAULT_THRESHOLD = "bahan.ambang_permintaan_default";
export async function materialRequestThresholds(scope: TransactionScope, ids: readonly string[]): Promise<{ default_qty: number | null; overrides: Map<string, number> }> {
    if (!scope.ctx.can("material.view") && !scope.ctx.can("material.request") && !scope.ctx.can("setting.view") && !scope.ctx.can("setting.manage")) throw new ForbiddenError();
    const setting = await scope.tx.selectFrom("system_settings").select("value").where("key", "=", MATERIAL_DEFAULT_THRESHOLD).forShare().executeTakeFirst();
    const overrides = ids.length ? await scope.tx.selectFrom("material_approval_thresholds").select(["material_id", "batas"]).where("material_id", "in", ids).execute() : [];
    const qty = setting?.value;
    return { default_qty: typeof qty === "number" && Number.isInteger(qty) && qty >= 0 && qty <= 2147483647 ? qty : null, overrides: new Map(overrides.map(i => [i.material_id, i.batas])) };
}
export async function setMaterialRequestThreshold(scope: TransactionScope, clock: Clock, audit: AuditLogger, id: string, batas: number | null): Promise<void> {
    if (!scope.ctx.can("setting.manage")) throw new ForbiddenError();
    if (batas !== null && (!Number.isInteger(batas) || batas < 0 || batas > 2147483647)) throw new DomainError("VALIDATION_ERROR", "Batas harus bilangan bulat nonnegatif.");
    const material = await scope.tx.selectFrom("materials").select("id").where("id", "=", id).forUpdate().executeTakeFirst(); if (!material) throw new NotFoundError();
    const old = await scope.tx.selectFrom("material_approval_thresholds").select("batas").where("material_id", "=", id).executeTakeFirst();
    if (batas === null) await scope.tx.deleteFrom("material_approval_thresholds").where("material_id", "=", id).execute();
    else await scope.tx.insertInto("material_approval_thresholds").values({ material_id: id, batas, updated_at: clock.now(), updated_by: String(scope.ctx.userId) }).onConflict(c => c.column("material_id").doUpdateSet({ batas, updated_at: clock.now(), updated_by: String(scope.ctx.userId) })).execute();
    await audit.write(scope, { modul: "m20-settings", aksi: "SETTING_UPDATED", entitas: "materials", entitasId: id, nilaiSebelum: { ambang_permintaan: old?.batas ?? null }, nilaiSesudah: { ambang_permintaan: batas } });
}
