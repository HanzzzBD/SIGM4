// Pekerjaan `approval-sla-check` (Bab 26 `JOB`, tiap 30 menit; FR-10.2 A2/A2a,
// SDD-02 §4.5): pengingat, eskalasi, dan perilaku terminal persetujuan berpelaku
// SYSTEM (AL-06). Ringkasan JOB-05 lewat `jalankanPekerjaanSistem`.
//
// `DecisionService` membaca registri proses `penanganHasil` yang sama dengan API
// (keputusan 75), sehingga `auto_reject` melepas objek lewat penangan modul pengaju
// (SDD-APR-17). Pendaftar: PR-03-10 (reservasi ruangan), PR-04-02 (reservasi aset).

import type { Kysely } from "kysely";
import { ApprovalService, DecisionService, SlaTracker } from "../modules/m10-approval/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import type { Clock } from "../shared/clock/index.js";
import type { Database } from "../shared/db/index.js";
import { Logger } from "../shared/observability/index.js";
import type { RingkasanPekerjaan } from "./system-job.js";
import { jalankanPekerjaanSistem } from "./system-job.js";

export const PEKERJAAN_SLA = "approval-sla-check";
/** Tiap 30 menit (availability-concurrency.md Bab 26) — sama di UTC dan WIB. */
export const CRON_SLA = "*/30 * * * *";

export async function jalankanPemeriksaanSla(db: Kysely<Database>, clock: Clock): Promise<RingkasanPekerjaan> {
    const logger = new Logger({ clock, modulBawaan: PEKERJAAN_SLA });
    const audit = new AuditLogger({ clock, logger });
    const approval = new ApprovalService(db, audit, clock);
    const tracker = new SlaTracker(db, audit, clock, approval, new DecisionService(db, audit, clock, approval), logger);
    return jalankanPekerjaanSistem({ nama: PEKERJAAN_SLA, db, audit, clock }, async (ctx) => {
        const { diperiksa, galat, ...rincian } = await tracker.periksa(ctx);
        return { diproses: diperiksa, galat, rincian };
    });
}
