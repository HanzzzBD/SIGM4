// Riwayat entitas bagi layar detail modul lain (m18 §11; PR-03-27, keputusan 17e log phase-03):
// dipanggil lewat `index.ts` di transaksi pemanggil (SDD-SYS-03). Penyajian entri log = akses
// terhadap log itu sendiri → `ACTIVITY_LOG_VIEWED` setiap kali (AL-10, pola keputusan 82f).

import type { AuditLogger } from "../../../shared/audit/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { EntriRiwayat } from "../repositories/entity-history.repository.js";
import { createEntityHistoryRepository } from "../repositories/entity-history.repository.js";

export type { EntriRiwayat };

/** Batas entri per penyajian — riwayat satu pengajuan, bukan penelusuran log (FR-18.2 milik P-73). */
export const BATAS_RIWAYAT = 200;

export async function riwayatEntitas(scope: TransactionScope, audit: AuditLogger, entitas: string, ids: readonly string[], sumber: string): Promise<readonly EntriRiwayat[]> {
    const entri = await createEntityHistoryRepository(scope.tx).riwayat(scope.ctx, entitas, ids, BATAS_RIWAYAT);
    await audit.write(scope, {
        modul: "m18-activity-log",
        aksi: "ACTIVITY_LOG_VIEWED",
        nilaiSesudah: { sumber, entitas, entitas_id: ids, jumlah_hasil: entri.length },
    });
    return entri;
}
