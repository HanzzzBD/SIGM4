// Sumber kartu dashboard milik M-04 (SDD-14 §4.3a, keputusan 82) — dipanggil M-15 lewat
// `index.ts` di dalam transaksinya (SDD-SYS-03).

import type { TransactionScope } from "../../../shared/db/index.js";
import type { RingkasanAset } from "../repositories/dashboard.repository.js";
import { createDashboardAssetRepository } from "../repositories/dashboard.repository.js";

export type { RingkasanAset };

/** Total, kondisi, status, belum berlabel QR, dan total nilai perolehan aset aktif. */
export function ringkasanAset(scope: TransactionScope): Promise<RingkasanAset> {
    return createDashboardAssetRepository(scope.tx).ringkasan(scope.ctx);
}
