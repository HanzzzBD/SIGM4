import { MaterialRequestDetailSchema, MaterialRequestSummarySchema } from "@sigm4/schemas";
import type { MaterialRequestQuery } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import { NotFoundError, ForbiddenError } from "../../../shared/errors/index.js";
import type { HistoryService } from "../../m10-approval/index.js";
import { createMaterialRequestRepository } from "../repositories/request.repository.js";

import { studentMaterialScope } from "../access.js";
import type { MaterialItemSnapshot } from "../access.js";
export class MaterialRequestQueryService {
    constructor(private readonly history: HistoryService) {}
    async detail(scope: TransactionScope, id: string) {
        const repo = createMaterialRequestRepository(scope.tx); let row = await repo.read(scope.ctx, id);
        if (!row && (scope.ctx.can("approval.decide") || scope.ctx.can("approval.view"))) {
            const candidate = await repo.read(scope.ctx, id, true);
            if (candidate) {
                for (const cycle of (await repo.cycles(scope.ctx, id)).reverse()) {
                    if (cycle.approval_instance_id && await this.history.mayReadContext(scope, Number(cycle.approval_instance_id))) { row = candidate; break; }
                }
            }
        }
        if (!row) throw new NotFoundError("Permintaan bahan tidak ditemukan.");
        const [items, cycles, issues] = await Promise.all([repo.items(scope.ctx, id, row.revision), repo.cycles(scope.ctx, id), repo.issues(scope.ctx, id)]);
        const summary = MaterialRequestSummarySchema.parse({ ...row, jumlah_jenis: new Set(items.map(i => i.material_id)).size, jumlah_diminta: items.reduce((n, i) => n + i.jumlah_diminta, 0), jumlah_diserahkan: items.reduce((n, i) => n + i.jumlah_diserahkan, 0), created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() });
        return MaterialRequestDetailSchema.parse({ ...summary, items: items.map(i => ({ ...i, ...(i.snapshot as MaterialItemSnapshot), saldo_terkini: studentMaterialScope(scope.ctx) ? null : i.saldo_terkini })), cycles: cycles.map(c => ({ ...c, thresholds: c.threshold_snapshot, created_at: c.created_at.toISOString() })), penyerahan: await Promise.all(issues.map(async i => ({ ...i, items: await repo.issuedItems(scope.ctx, i.id) }))) });
    }
    async list(scope: TransactionScope, query: MaterialRequestQuery) {
        if (!scope.ctx.can("material.view")) throw new ForbiddenError();
        const result = await createMaterialRequestRepository(scope.tx).list(scope.ctx, query), data = [];
        for (const id of result.ids) { const d = await this.detail(scope, id); data.push(MaterialRequestSummarySchema.parse(d)); }
        return { data, meta: result.meta };
    }
}
