// SlaTracker — SLA, pengingat, eskalasi (FR-10.2 A2/A2a, BR-039a, Lampiran D.5,
// SDD-02 §4.5, SDD-APR-06/07/15). Dipanggil job `approval-sla-check` (tiap 30 menit)
// dengan pelaku SYSTEM. Semantik: keputusan 70 & 73 log phase-02 — `remind` tak pernah
// terminal; `escalate` dialihkan sekali, pelanggaran berikutnya atau target yang tak
// dapat memutus = eskalasi habis → perilaku terminal SEKALI. Tidak pernah menyetujui.

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BusinessCalendarService } from "../../../shared/calendar/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { publish } from "../../../shared/events/index.js";
import type { Logger } from "../../../shared/observability/index.js";
import type { LangkahTerkunci } from "../repositories/sla.repository.js";
import { ApprovalSlaBreachedPayloadSchema } from "../schemas/sla-event.schema.js";
import type { ApprovalSlaBreachedPayload } from "../schemas/sla-event.schema.js";
import { createSlaRepository } from "../repositories/sla.repository.js";
import type { ApprovalService, SnapshotAturan } from "./approval.service.js";
import { tanggalWib } from "./approval.service.js";
import type { DecisionService } from "./decision.service.js";

const MODUL = "m10-approval";

/** `ApprovalSlaBreached.tindakan` (SDD-07 §4.3) → NT-06 / NT-07 / NT-47. */
export type TindakanSla = ApprovalSlaBreachedPayload["tindakan"];

type Hasil = "LEWAT" | "BELUM" | "AKTIF_ULANG" | "PENGINGAT" | "ESKALASI" | "DITAHAN" | "DITOLAK";

export interface RingkasanSla {
    readonly diperiksa: number;
    readonly diaktifkanUlang: number;
    readonly pengingat: number;
    readonly eskalasi: number;
    readonly ditahan: number;
    readonly ditolak: number;
    readonly galat: number;
}

export class SlaTracker {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
        private readonly approval: ApprovalService,
        private readonly decision: DecisionService,
        private readonly logger: Logger,
        private readonly calendar: BusinessCalendarService = new BusinessCalendarService(),
    ) {}

    /** Satu siklus: setiap langkah aktif diproses dalam transaksinya sendiri (JOB-03, galat terisolasi). */
    async periksa(ctx: AuthContext): Promise<RingkasanSla> {
        const hitung: Record<Hasil, number> = { LEWAT: 0, BELUM: 0, AKTIF_ULANG: 0, PENGINGAT: 0, ESKALASI: 0, DITAHAN: 0, DITOLAK: 0 };
        let galat = 0;
        const langkah = await createSlaRepository(this.db).langkahAktif(ctx);
        for (const stepId of langkah) {
            try {
                hitung[await withTransaction(ctx, (scope) => this.proses(scope, stepId), this.db)] += 1;
            } catch (e) {
                galat += 1;
                this.logger.error("Pemeriksaan SLA langkah persetujuan gagal", e, { step_id: stepId });
            }
        }
        return {
            diperiksa: langkah.length,
            diaktifkanUlang: hitung.AKTIF_ULANG,
            pengingat: hitung.PENGINGAT,
            eskalasi: hitung.ESKALASI,
            ditahan: hitung.DITAHAN,
            ditolak: hitung.DITOLAK,
            galat,
        };
    }

    private async proses(scope: TransactionScope, stepId: number): Promise<Hasil> {
        const repo = createSlaRepository(scope.tx);
        const l = await repo.kunci(scope.ctx, stepId);
        if (l === undefined) return "LEWAT"; // diputus sementara menunggu kunci
        const inst = await repo.instance(scope.ctx, l.instanceId);
        if (inst.status !== "MENUNGGU" || inst.langkahAktif !== l.urutan) return "LEWAT";
        const snapshot = inst.snapshot as SnapshotAturan;
        const dariAturan = snapshot.langkah.find((s) => s.urutan === l.urutan);

        // SDD-02 §4.4 / RE-13: pemutus hilang sesudah langkah aktif. Fallback (di luar snapshot)
        // dan langkah yang sudah dieskalasi adalah jalur terakhir — tidak dilewati lagi.
        if (dariAturan !== undefined && l.dieskalasiPada === null) {
            if (await this.approval.aktifkanUlang(scope, l.instanceId, l, inst.pemohonId)) return "AKTIF_ULANG";
        }

        const sekarang = this.clock.now();
        if (l.slaDeadline === null || l.slaDeadline.getTime() > sekarang.getTime()) return "BELUM";

        // Langkah fallback ber-`remind` (SDD-APR-13, keputusan 67).
        if ((dariAturan?.on_sla_breach ?? "remind") === "remind") {
            // NT-06 maks 1×/hari per langkah, hari WIB (CAL-03).
            if (l.pengingatTerakhirPada !== null && tanggalWib(l.pengingatTerakhirPada) === tanggalWib(sekarang)) return "BELUM";
            await repo.tandaiPengingat(scope.ctx, l.id, sekarang);
            await this.catat(scope, "APPROVAL_SLA_REMINDED", l, { sla_deadline: l.slaDeadline.toISOString() });
            await this.terbitkan(scope, l, "REMIND");
            return "PENGINGAT";
        }

        if (l.alarmTerminalPada !== null) return "BELUM"; // terminal sudah dijalankan (sekali)
        if (l.dieskalasiPada === null && dariAturan?.eskalasi_ke != null) {
            const keUserId = dariAturan.eskalasi_ke;
            const target = { approverType: "user" as const, roleId: null, userId: keUserId };
            // Keputusan 73: target yang tak dapat memutus (nonaktif / pemohon) = eskalasi habis.
            if ((await this.approval.pemutusSah(scope, target, inst.pemohonId)).pemutus.length > 0) {
                // Tenggat baru = SLA langkah yang sama, jam kerja (CAL-01, SDD-APR-07).
                const tenggat = await this.calendar.addWorkingHours(scope.tx, sekarang, dariAturan.sla_jam);
                const dari = l.approverType === "user" ? l.userId : null;
                await repo.alihkan(scope.ctx, l.id, keUserId, dari, sekarang, tenggat);
                await this.catat(scope, "APPROVAL_ESCALATED", l, { eskalasi_ke: keUserId, eskalasi_dari_user_id: dari, sla_deadline: tenggat.toISOString() });
                await this.terbitkan(scope, l, "ESCALATE", { eskalasi_ke: keUserId });
                return "ESKALASI";
            }
        }

        // Eskalasi habis (FR-10.2 A2a, BR-039a): tidak pernah disetujui otomatis.
        const terminal = snapshot.terminal_on_exhausted_escalation;
        await repo.tandaiTerminal(scope.ctx, l.id, sekarang);
        await this.catat(scope, "APPROVAL_ESCALATION_EXHAUSTED", l, { terminal });
        if (terminal === "auto_reject") {
            await this.decision.tolakOtomatis(scope, l.instanceId, l.urutan);
            return "DITOLAK";
        }
        await this.terbitkan(scope, l, "EXHAUSTED");
        return "DITAHAN";
    }

    private async catat(scope: TransactionScope, aksi: string, l: LangkahTerkunci, rincian: Record<string, unknown>): Promise<void> {
        await this.audit.write(scope, {
            modul: MODUL,
            aksi,
            entitas: "approval_steps",
            entitasId: l.id,
            nilaiSesudah: { instance_id: l.instanceId, urutan: l.urutan, ...rincian },
        });
    }

    private async terbitkan(scope: TransactionScope, l: LangkahTerkunci, tindakan: TindakanSla, tambahan: Record<string, unknown> = {}): Promise<void> {
        await publish(scope, {
            name: "ApprovalSlaBreached",
            aggregateType: "approval_instance",
            aggregateId: l.instanceId,
            // Kontrak konsumen M-17 (keputusan 75): payload yang menyimpang gagal di sini, bukan di konsumen.
            payload: ApprovalSlaBreachedPayloadSchema.parse({ instance_id: l.instanceId, urutan: l.urutan, tindakan, ...tambahan }),
        });
    }
}
