import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import { penanganHasil, penyediaRincian } from "../m10-approval/index.js";
import { materialRequestApproval, materialRequestApprovalSource } from "./services/request-approval.js";
export function registerMaterialRequests(clock: Clock, audit: AuditLogger): void {
    if (!penanganHasil.cari("PERMINTAAN_BAHAN")) penanganHasil.daftar(materialRequestApproval(clock, audit));
    if (!penyediaRincian.cari("PERMINTAAN_BAHAN")) penyediaRincian.daftar(materialRequestApprovalSource);
}
