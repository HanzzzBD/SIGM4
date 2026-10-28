import type { TransactionScope } from "../../../shared/db/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import { createMaterialRequestRepository } from "../repositories/request.repository.js";
import type { MaterialItemSnapshot } from "../access.js";
export async function materialRequestNotification(scope: TransactionScope, id: number, issueId?: number, revision?: number) {
    if (!isSystemAuthContext(scope.ctx)) throw new ForbiddenError();
    const repo = createMaterialRequestRepository(scope.tx), row = await repo.read(scope.ctx, String(id)); if (!row) return null;
    if (!issueId && revision!==undefined && revision!==row.revision) return null;
    const items = await repo.items(scope.ctx, row.id, row.revision);
    if (!issueId) return { nomor: row.nomor, lokasi: [...new Set(items.filter(i => (i.jumlah_disetujui ?? 0) > 0).map(i => (i.snapshot as MaterialItemSnapshot).lokasi))].join(", ") };
    const issued = await repo.issuedItems(scope.ctx, String(issueId));
    return { nomor: row.nomor, ringkasan: issued.map(i => { const item = items.find(r => r.id === i.item_id)!; const snap = item.snapshot as MaterialItemSnapshot; return `${i.jumlah} ${snap.satuan} ${snap.nama}`; }).join(", ") };
}
