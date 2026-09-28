// Permukaan publik m10-approval (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain; `services/` privat terhadap modul ini.
export type { Fakta, KamusFakta } from "./services/condition-evaluator.js";
export { evaluate } from "./services/condition-evaluator.js";
export type { JenisPengajuan, Kondisi } from "./services/dsl.js";
export { FIELD_DSL, JENIS_PENGAJUAN, KondisiSchema } from "./services/dsl.js";
export type { HasilPemilihan, KandidatAturan } from "./services/rule-selector.js";
export { ATURAN_BAWAAN, selectRule } from "./services/rule-selector.js";
export type { PelanggaranAturan } from "./services/rule-validator.js";
export { validateCondition } from "./services/rule-validator.js";
export type { ApprovalModuleDeps } from "./routes.js";
export { approvalRouter, decideRoute, delegateRoute, listPendingRoute } from "./routes.js";
export type { HasilKeputusan, PenanganHasil } from "./services/decision.service.js";
export type { InstanceBaru, PengajuanBaru, SnapshotAturan } from "./services/approval.service.js";
export { ApprovalService } from "./services/approval.service.js";
