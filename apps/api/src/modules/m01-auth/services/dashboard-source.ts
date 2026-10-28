// Sumber kartu dashboard milik M-01 (SDD-14 §4.3a, keputusan 82) — dipanggil M-15 lewat
// `index.ts` di dalam transaksinya (SDD-SYS-03).

import type { TransactionScope } from "../../../shared/db/index.js";
import type { PermintaanMenunggu } from "../repositories/dashboard.repository.js";
import { createDashboardResetRepository } from "../repositories/dashboard.repository.js";

export type { PermintaanMenunggu };

/** "Permintaan Reset Password" (19.2): antrean `MENUNGGU` tindakan Administrator (FR-01.3). */
export function permintaanResetMenunggu(scope: TransactionScope, batas: number): Promise<{ jumlah: number; daftar: readonly PermintaanMenunggu[] }> {
    return createDashboardResetRepository(scope.tx).menunggu(scope.ctx, batas);
}
