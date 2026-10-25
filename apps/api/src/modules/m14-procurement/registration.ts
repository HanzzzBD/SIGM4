import type { AuditLogger } from "../../shared/audit/index.js";
import { penanganHasil,penyediaRincian } from "../m10-approval/index.js";
import { procurementApprovalAdapter,procurementApprovalSource } from "./services/approval-adapter.js";
import type { ProcurementPolicy } from "./services/rules.js";
export function registerProcurements(audit:AuditLogger,policy:ProcurementPolicy){
 if(!penanganHasil.cari("PENGADAAN_BARANG"))penanganHasil.daftar(procurementApprovalAdapter(audit,policy));
 if(!penyediaRincian.cari("PENGADAAN_BARANG"))penyediaRincian.daftar(procurementApprovalSource);
}
