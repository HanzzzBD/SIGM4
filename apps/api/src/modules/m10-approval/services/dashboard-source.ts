// Sumber kartu dashboard milik M-10 (SDD-14 §4.3a, keputusan 82) — dipanggil M-15 lewat
// `index.ts` di dalam transaksinya (SDD-SYS-03). Kotak masuk "menunggu saya" memakai
// `DecisionService.pending` yang sama dengan `GET /approvals/pending` (SDD-APR-16).

import type { TransactionScope } from "../../../shared/db/index.js";
import type { StatusPengajuan } from "../repositories/dashboard.repository.js";
import { createDashboardApprovalRepository } from "../repositories/dashboard.repository.js";
import { JENIS_PENGAJUAN } from "./dsl.js";
import type { JenisPengajuan } from "./dsl.js";

export type { StatusPengajuan };

const STATUS: readonly StatusPengajuan[] = ["MENUNGGU", "DISETUJUI", "DITOLAK", "PERLU_REVISI", "DIBATALKAN"];

/** "Status Konfigurasi" (19.2, keputusan 82g): aturan aktif per jenis + jenis yang jatuh ke aturan bawaan. */
export async function ringkasanAturan(scope: TransactionScope): Promise<{ aktif: readonly { jenis: JenisPengajuan; jumlah: number }[]; tanpa_aturan: readonly JenisPengajuan[] }> {
    const peta = await createDashboardApprovalRepository(scope.tx).aturanAktifPerJenis(scope.ctx);
    return {
        aktif: JENIS_PENGAJUAN.filter((j) => peta.has(j)).map((jenis) => ({ jenis, jumlah: peta.get(jenis) ?? 0 })),
        tanpa_aturan: JENIS_PENGAJUAN.filter((j) => !peta.has(j)),
    };
}

/** "Pengajuan Saya" (19.6, 19.7): pengajuan pemanggil dalam rentang, per status — status tanpa baris bernilai 0. */
export async function pengajuanSayaPerStatus(scope: TransactionScope, mulai: Date, akhir: Date): Promise<Readonly<Record<StatusPengajuan, number>>> {
    const peta = await createDashboardApprovalRepository(scope.tx).perStatusPemohon(scope.ctx, scope.ctx.userId, mulai, akhir);
    return Object.fromEntries(STATUS.map((s) => [s, peta.get(s) ?? 0])) as Record<StatusPengajuan, number>;
}
