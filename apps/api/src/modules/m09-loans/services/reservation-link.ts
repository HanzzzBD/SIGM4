import type { TransactionScope } from "../../../shared/db/index.js";
import { createLoanRepository } from "../repositories/loan.repository.js";
export async function reservationLoanLinks(scope: TransactionScope, ids: readonly string[]) {
    if (!scope.ctx.can("loan.view")) return [];
    return createLoanRepository(scope.tx).reservationLinks(scope.ctx, ids);
}
