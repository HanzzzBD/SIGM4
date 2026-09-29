// Sumber dashboard milik M-20 (SDD-14 §4.3a, keputusan 82) — dipanggil M-15 lewat
// `index.ts` di dalam transaksinya (SDD-SYS-03).

import type { TransactionScope } from "../../../shared/db/index.js";
import type { Periode } from "../repositories/dashboard.repository.js";
import { createDashboardSettingRepository } from "../repositories/dashboard.repository.js";

export type { Periode };

/** "Status Konfigurasi" (keputusan 82g): kekurangan konfigurasi dasar yang menghambat operasi. */
export function kelengkapanKonfigurasi(scope: TransactionScope): Promise<{ tahunAjaranAktif: boolean; hariKerjaAktif: number; teksKosong: readonly string[] }> {
    return createDashboardSettingRepository(scope.tx).kelengkapan(scope.ctx);
}

/** Rentang `semester` / `tahun_ajaran` (19.1): periode aktif yang memuat `hariIni` (YYYY-MM-DD WIB). */
export function periodeAkademikAktif(scope: TransactionScope, hariIni: string): Promise<{ tahunAjaran: Periode | null; semester: Periode | null }> {
    return createDashboardSettingRepository(scope.tx).periodeAktif(scope.ctx, hariIni);
}
