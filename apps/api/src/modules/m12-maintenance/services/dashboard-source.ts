import type { TransactionScope } from "../../../shared/db/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { createWorkOrderRepository } from "../repositories/work-order.repository.js";
import { tanggalWib } from "./work-order.service.js";
export async function technicianDashboard(scope: TransactionScope, now: Date) {
    if (!scope.ctx.can("workorder.view")) throw new ForbiddenError();
    return createWorkOrderRepository(scope.tx).dashboard(scope.ctx, tanggalWib(now));
}
