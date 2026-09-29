// Sumber kartu dashboard milik M-02 (SDD-14 §4.3a, keputusan 82) — dipanggil M-15 lewat
// `index.ts` di dalam transaksinya (SDD-SYS-03).

import type { TransactionScope } from "../../../shared/db/index.js";
import type { PenggunaPerRole } from "../repositories/dashboard.repository.js";
import { createDashboardUserRepository } from "../repositories/dashboard.repository.js";

export type { PenggunaPerRole };

/** "Total Pengguna Aktif" & "Distribusi Role" (19.2): akun AKTIF per role. */
export function penggunaAktifPerRole(scope: TransactionScope): Promise<readonly PenggunaPerRole[]> {
    return createDashboardUserRepository(scope.tx).aktifPerRole(scope.ctx);
}
