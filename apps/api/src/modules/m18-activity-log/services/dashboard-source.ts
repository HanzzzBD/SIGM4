// Sumber kartu dashboard milik M-18 (SDD-14 §4.3a, keputusan 82): dipanggil M-15 lewat
// `index.ts` di dalam transaksinya (SDD-SYS-03). Hanya pembacaan — kecuali jejak akses.

import type { AuditLogger } from "../../../shared/audit/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { EntriTerbaru } from "../repositories/dashboard.repository.js";
import { createDashboardLogRepository } from "../repositories/dashboard.repository.js";

export type { EntriTerbaru };

/** "Login Hari Ini" (19.2): sukses & gagal dalam 24 jam terakhir. */
export function ringkasanLogin(scope: TransactionScope, sejak: Date): Promise<{ sukses: number; gagal: number }> {
    return createDashboardLogRepository(scope.tx).hitungLogin(scope.ctx, sejak);
}

/** "Aktivitas Sistem" (19.2): jumlah entri per tanggal WIB dalam rentang. */
export function aktivitasPerHari(scope: TransactionScope, mulai: Date, akhir: Date): Promise<readonly { tanggal: string; jumlah: number }[]> {
    return createDashboardLogRepository(scope.tx).perHari(scope.ctx, mulai, akhir);
}

/** "Aktivitas Terbaru" (19.2): 10 entri terakhir. */
export function aktivitasTerbaru(scope: TransactionScope, batas: number): Promise<readonly EntriTerbaru[]> {
    return createDashboardLogRepository(scope.tx).terbaru(scope.ctx, batas);
}

/**
 * m18 §11 `ACTIVITY_LOG_VIEWED` — akses terhadap isi log dari dashboard (keputusan 82f):
 * dicatat SETIAP penyajian, termasuk dari cache, karena setiap penyajian adalah akses.
 */
export async function catatAksesLogDashboard(scope: TransactionScope, audit: AuditLogger, kartu: string, jumlah: number): Promise<void> {
    await audit.write(scope, {
        modul: "m18-activity-log",
        aksi: "ACTIVITY_LOG_VIEWED",
        nilaiSesudah: { sumber: "dashboard", kartu, jumlah_hasil: jumlah },
    });
}
