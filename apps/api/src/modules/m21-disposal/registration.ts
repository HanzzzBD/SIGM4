import type { AuditLogger } from "../../shared/audit/index.js";
import type { Clock } from "../../shared/clock/index.js";
import { penanganHasil, penyediaRincian } from "../m10-approval/index.js";
import { disposalApprovalAdapter, disposalApprovalSource } from "./services/approval-adapter.js";
import { sumberLinimasaAset } from "../m04-assets/index.js";
import { disposalTimelineSource } from "./services/public-source.js";
export function registerDisposals(audit: AuditLogger, clock: Clock) {
    if (!penanganHasil.cari("PENGHAPUSAN_ASET")) penanganHasil.daftar(disposalApprovalAdapter(audit, clock));
    if (!penyediaRincian.cari("PENGHAPUSAN_ASET")) penyediaRincian.daftar(disposalApprovalSource);
    if (!sumberLinimasaAset.cari("PENGHAPUSAN")) sumberLinimasaAset.daftar(disposalTimelineSource);
}
