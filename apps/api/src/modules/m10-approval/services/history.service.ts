// HistoryService — linimasa persetujuan (FR-10.3, SDD-02 §4.5a; keputusan 76).
// Seluruh waktu dalam MENIT KERJA lewat BusinessCalendarService (CAL-01, SDD-APR-06).
// Scope `own` (FR-10.3 A1): pemohon, pemutus/atas-nama langkah mana pun, atau pemutus sah
// langkah aktif. Di luar itu — dan instance yang tak ada — dijawab sama (SDD-AUTH-08).

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BusinessCalendarService } from "../../../shared/calendar/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import type { InstanceRiwayat, LangkahRiwayat, Nama } from "../repositories/history.repository.js";
import { createHistoryRepository } from "../repositories/history.repository.js";
import type { StatusInstance } from "../repositories/decision.repository.js";
import type { ApprovalService, SnapshotAturan } from "./approval.service.js";
import type { JenisPengajuan } from "./dsl.js";

export type StatusLangkah = "DISETUJUI" | "DITOLAK" | "PERLU_REVISI" | "DILEWATI" | "AKTIF" | "BELUM_AKTIF" | "TIDAK_DIJALANKAN";

export interface LangkahLinimasa {
    readonly urutan: number;
    readonly status: StatusLangkah;
    readonly approver: { readonly tipe: "role" | "user"; readonly role: Nama | null; readonly user: Nama | null };
    /** Langkah fallback RE-11 (di luar `rule_snapshot`). */
    readonly fallback: boolean;
    readonly catatan: string | null;
    readonly diputuskan_oleh: Nama | null;
    /** RE-12: approver asli bila diputus penerima delegasi. */
    readonly atas_nama: Nama | null;
    readonly diputuskan_pada: Date | null;
    readonly alasan_dilewati: string | null;
    /** FR-10.3 A2: penanda eskalasi (SDD-02 §4.5). */
    readonly eskalasi: { readonly pada: Date; readonly dari: Nama | null } | null;
    readonly eskalasi_habis_pada: Date | null;
    /** Hanya langkah AKTIF (FR-10.3 langkah 3). */
    readonly sla: { readonly deadline: Date | null; readonly sisa_menit_kerja: number; readonly terlambat: boolean } | null;
    /** Hanya langkah yang sudah diputus/dilewati (FR-10.3 AC). */
    readonly durasi_menit_kerja: number | null;
}

export interface Linimasa {
    readonly instance_id: number;
    readonly jenis_pengajuan: JenisPengajuan;
    readonly referensi_id: number;
    readonly status: StatusInstance;
    readonly pemohon: Nama;
    readonly aturan: { readonly rule_id: number | null; readonly versi: number | null };
    readonly langkah_aktif: number | null;
    readonly dibuat_pada: Date;
    readonly diselesaikan_pada: Date | null;
    /** Lampiran D.5 `auto_reject`: ditutup SYSTEM, bukan keputusan manusia. */
    readonly ditolak_otomatis: boolean;
    readonly langkah: readonly LangkahLinimasa[];
}

export class HistoryService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
        private readonly approval: ApprovalService,
        private readonly calendar: BusinessCalendarService = new BusinessCalendarService(),
    ) {}

    /** `GET /approvals/{id}/history`. */
    async linimasa(ctx: AuthContext, instanceId: number): Promise<Linimasa> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createHistoryRepository(scope.tx);
                const inst = await repo.instance(scope.ctx, instanceId);
                const semua = scope.ctx.scopeOf("approval.view") === "all";
                // SDD-AUTH-08 menyamarkan keberadaan hanya bagi yang TAK berhak; scope `all` berhak atas
                // seluruh instance, jadi yang tak ada = 404 (pola endpoint lain, gerbang SEC-T-01).
                if (inst === undefined) throw semua ? new NotFoundError("Instance persetujuan tidak ditemukan.") : new ForbiddenError();
                const langkah = await repo.langkah(scope.ctx, instanceId);
                if (!semua && !(await this.boleh(scope, inst, langkah))) throw new ForbiddenError();
                return this.susun(scope, inst, langkah);
            },
            this.db,
        );
    }

    /** Scope `own` (FR-10.3 A1). */
    private async boleh(scope: TransactionScope, inst: InstanceRiwayat, langkah: readonly LangkahRiwayat[]): Promise<boolean> {
        const saya = scope.ctx.userId;
        if (inst.pemohon.id === saya) return true;
        if (langkah.some((l) => l.diputuskanOleh?.id === saya || l.atasNama?.id === saya)) return true;
        const aktif = this.aktif(inst, langkah);
        // Sumber aturan yang sama dengan kotak masuk & keputusan (SDD-APR-16).
        return aktif !== undefined && (await this.approval.pemutusSah(scope, aktif, inst.pemohon.id)).pemutus.some((p) => p.userId === saya);
    }

    private aktif(inst: InstanceRiwayat, langkah: readonly LangkahRiwayat[]): LangkahRiwayat | undefined {
        return inst.status === "MENUNGGU" ? langkah.find((l) => l.urutan === inst.langkahAktif && l.keputusan === null) : undefined;
    }

    private async susun(scope: TransactionScope, inst: InstanceRiwayat, langkah: readonly LangkahRiwayat[]): Promise<Linimasa> {
        const snapshot = inst.snapshot as SnapshotAturan;
        const dariAturan = new Set(snapshot.langkah.map((l) => l.urutan));
        const aktif = this.aktif(inst, langkah);
        const sekarang = this.clock.now();
        const hasil: LangkahLinimasa[] = [];
        // Langkah mulai menunggu saat langkah sebelumnya selesai (atau instance lahir).
        let mulai: Date | null = inst.createdAt;
        for (const l of langkah) {
            let sla: LangkahLinimasa["sla"] = null;
            if (l === aktif) {
                const lewat = l.slaDeadline !== null && l.slaDeadline.getTime() <= sekarang.getTime();
                sla = {
                    deadline: l.slaDeadline,
                    sisa_menit_kerja: l.slaDeadline === null || lewat ? 0 : await this.calendar.workingMinutesBetween(scope.tx, sekarang, l.slaDeadline),
                    terlambat: lewat,
                };
            }
            const durasi =
                l.diputuskanPada !== null && mulai !== null ? await this.calendar.workingMinutesBetween(scope.tx, mulai, l.diputuskanPada) : null;
            hasil.push({
                urutan: l.urutan,
                status: l.keputusan ?? (l === aktif ? "AKTIF" : inst.status === "MENUNGGU" ? "BELUM_AKTIF" : "TIDAK_DIJALANKAN"),
                approver: {
                    tipe: l.approverType,
                    role: l.roleId === null ? null : { id: l.roleId, nama: l.targetRoleNama },
                    user: l.userId === null ? null : { id: l.userId, nama: l.targetUserNama },
                },
                fallback: !dariAturan.has(l.urutan),
                catatan: l.catatan,
                diputuskan_oleh: l.diputuskanOleh,
                atas_nama: l.atasNama,
                diputuskan_pada: l.diputuskanPada,
                alasan_dilewati: l.alasanDilewati,
                eskalasi: l.dieskalasiPada === null ? null : { pada: l.dieskalasiPada, dari: l.eskalasiDari },
                eskalasi_habis_pada: l.alarmTerminalPada,
                sla,
                durasi_menit_kerja: durasi,
            });
            mulai = l.diputuskanPada;
        }
        return {
            instance_id: inst.id,
            jenis_pengajuan: inst.jenis,
            referensi_id: inst.referensiId,
            status: inst.status,
            pemohon: inst.pemohon,
            aturan: { rule_id: inst.ruleId, versi: snapshot.versi },
            langkah_aktif: inst.langkahAktif,
            dibuat_pada: inst.createdAt,
            diselesaikan_pada: inst.diselesaikanPada,
            ditolak_otomatis: inst.status === "DITOLAK" && !langkah.some((l) => l.keputusan === "DITOLAK"),
            langkah: hasil,
        };
    }
}
