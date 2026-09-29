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
export {
    approvalRouter,
    createRuleRoute,
    decideRoute,
    delegateRoute,
    historyRoute,
    listPendingRoute,
    listRulesRoute,
    previewRuleRoute,
    ruleStatusRoute,
    updateRuleRoute,
} from "./routes.js";
export type { HasilKeputusan, PenanganHasil } from "./services/decision.service.js";
export { DecisionService, RegistriPenanganHasil, penanganHasil } from "./services/decision.service.js";
export type { RingkasanSla, TindakanSla } from "./services/sla-tracker.js";
export { SlaTracker } from "./services/sla-tracker.js";
export type { ApprovalSlaBreachedPayload } from "./schemas/sla-event.schema.js";
export { ApprovalSlaBreachedPayloadSchema, NOTIFIKASI_TINDAKAN_SLA } from "./schemas/sla-event.schema.js";
export type { InstanceBaru, PengajuanBaru, SnapshotAturan } from "./services/approval.service.js";
export { ApprovalService } from "./services/approval.service.js";
export type { PenyediaRincian, RincianPengajuan, SumberNotifikasiApproval } from "./services/notification-sources.js";
export {
    RegistriPenyediaRincian,
    catatanLangkah,
    pemutusLangkah,
    penyediaRincian,
    sumberNotifikasiApproval,
} from "./services/notification-sources.js";
