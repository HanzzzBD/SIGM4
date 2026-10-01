// Penyelarasan `assets.status` DIRESERVASI dengan slot (BR-005b) — dijalankan job
// `slot-activation` (SDD-01 §4.6) di transaksi berpelaku SYSTEM. Setiap perubahan tercatat
// `ASSET_STATUS_CHANGED` (m04 §11 "termasuk yang otomatis oleh sistem", AL-01/AL-06).

import type { AuditLogger } from "../../../shared/audit/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { createReservationStatusRepository } from "../repositories/reservation-status.repository.js";

const MODUL = "m04-assets";

export interface HasilSinkronStatus {
    readonly ditetapkan: readonly number[];
    readonly dikembalikan: readonly number[];
}

export async function sinkronkanStatusDireservasi(scope: TransactionScope, audit: AuditLogger, waktu: Date): Promise<HasilSinkronStatus> {
    const repo = createReservationStatusRepository(scope.tx);
    const dikembalikan = await repo.kembalikanTersedia(scope.ctx, waktu);
    const ditetapkan = await repo.tetapkanDireservasi(scope.ctx, waktu);
    const catat = (id: number, sebelum: string, sesudah: string) =>
        audit.write(scope, { modul: MODUL, aksi: "ASSET_STATUS_CHANGED", entitas: "assets", entitasId: String(id), nilaiSebelum: { status: sebelum }, nilaiSesudah: { status: sesudah } });
    for (const id of dikembalikan) await catat(id, "DIRESERVASI", "TERSEDIA");
    for (const id of ditetapkan) await catat(id, "TERSEDIA", "DIRESERVASI");
    return { ditetapkan, dikembalikan };
}
