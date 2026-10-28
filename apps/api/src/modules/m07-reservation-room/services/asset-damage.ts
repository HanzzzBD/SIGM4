// FR-11.2 A1: efek wajib atomik bersama perubahan kondisi aset di transaksi verifikasi.
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { BusinessCalendarService } from "../../../shared/calendar/index.js";
import { ApprovalService } from "../../m10-approval/index.js";
import { reservationsAffectedByDamage } from "../../m08-reservation-item/index.js";
import { CancellationService } from "./cancellation.service.js";
export async function cancelReservationsForUnavailableAsset(scope: TransactionScope, assetId: number, clock: Clock, audit: AuditLogger, maintenanceAsset?: string) {
    const service = new CancellationService(scope.tx, clock, audit, new ApprovalService(scope.tx, audit, clock, new BusinessCalendarService()));
    for (const row of await reservationsAffectedByDamage(scope, assetId, clock.now())) await service.batalkanDalam(scope, Number(row.id), maintenanceAsset === undefined ? "Aset menjadi Tidak Tersedia setelah verifikasi kerusakan (FR-11.2 A1)." : "Aset masuk Dalam Perbaikan (FR-12.1).", true, maintenanceAsset);
}
