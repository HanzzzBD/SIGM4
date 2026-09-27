// ApprovalService — pembentukan instance & aktivasi langkah (SDD-02 §4.3–4.4) serta
// delegasi (FR-10.2 A3). Resolusi approver: SDD-APR-13/14/16, RE-10 … RE-13;
// keputusan 67 log phase-02. Keputusan approver (RE-09) milik PR-02-21.
//
// `createInstance`/`aktifkanBerikutnya` berjalan di transaksi PEMANGGIL (SDD-APR-08):
// pengajuan tanpa instance persetujuan tidak mungkin ada.

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BusinessCalendarService } from "../../../shared/calendar/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import type { ApprovalRepository, AturanAktif, DelegasiRow, LangkahInstance, Target } from "../repositories/approval.repository.js";
import { createApprovalRepository } from "../repositories/approval.repository.js";
import { ALASAN_DILEWATI, resolvePemutus } from "./approver-resolver.js";
import type { HasilResolusi } from "./approver-resolver.js";
import type { KamusFakta } from "./condition-evaluator.js";
import type { JenisPengajuan, Kondisi } from "./dsl.js";
import { ATURAN_BAWAAN, selectRule } from "./rule-selector.js";

const MODUL = "m10-approval";
/** RE-11 / SDD-APR-13: fallback bawaan bila aturan tak menetapkannya. */
const KODE_ROLE_ADMINISTRATOR = "R-01";
/** SDD-APR-13 (keputusan 67): langkah fallback = SLA aturan bawaan. */
const SLA_FALLBACK_JAM = ATURAN_BAWAAN.steps[0].sla_hours;
/** SQLSTATE `exclusion_violation`. */
const EXCLUSION_VIOLATION = "23P01";

interface TargetSnapshot {
    readonly approver_type: "role" | "user";
    readonly approver_role_id: number | null;
    readonly approver_user_id: number | null;
}

/** RE-05 / SDD-APR-03: definisi UTUH aturan terpilih — dibekukan di `rule_snapshot`. */
export interface SnapshotAturan {
    readonly rule_id: number | null;
    readonly versi: number | null;
    readonly prioritas: number | null;
    readonly kondisi: Kondisi;
    readonly langkah: readonly (TargetSnapshot & {
        readonly urutan: number;
        readonly sla_jam: number;
        readonly on_sla_breach: "remind" | "escalate";
        readonly eskalasi_ke: number | null;
    })[];
    readonly fallback_approver: TargetSnapshot | null;
    readonly terminal_on_exhausted_escalation: "hold_and_alert" | "auto_reject";
}

export interface PengajuanBaru {
    readonly jenis: JenisPengajuan;
    readonly referensiId: number;
    readonly pemohonId: number;
    /** Dari FactAdapter jenis pengajuan (SDD-APR-09). */
    readonly fakta: KamusFakta;
}

export interface InstanceBaru {
    readonly instanceId: number;
    readonly ruleId: number | null;
    readonly langkahAktif: number;
}

export interface DelegasiBaru {
    readonly penerimaId: number;
    readonly mulai: string;
    readonly selesai: string;
}

const keSnapshotTarget = (t: Target): TargetSnapshot => ({ approver_type: t.approverType, approver_role_id: t.roleId, approver_user_id: t.userId });
const dariSnapshotTarget = (t: TargetSnapshot): Target => ({ approverType: t.approver_type, roleId: t.approver_role_id, userId: t.approver_user_id });

function snapshotDari(aturan: AturanAktif): SnapshotAturan {
    return {
        rule_id: aturan.id,
        versi: aturan.versi,
        prioritas: aturan.prioritas,
        kondisi: aturan.kondisi,
        langkah: aturan.langkah.map((l) => ({ ...keSnapshotTarget(l), urutan: l.urutan, sla_jam: l.slaJam, on_sla_breach: l.onSlaBreach, eskalasi_ke: l.eskalasiKe })),
        fallback_approver: aturan.fallback === null ? null : keSnapshotTarget(aturan.fallback),
        terminal_on_exhausted_escalation: aturan.terminal,
    };
}

/** Tanggal kalender WIB 'YYYY-MM-DD' — rentang delegasi dibaca dalam zona sekolah. */
function tanggalWib(instan: Date): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(instan);
}

export class ApprovalService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
        private readonly calendar: BusinessCalendarService = new BusinessCalendarService(),
    ) {}

    /** SDD-02 §4.3: pilih aturan (RE-04/RE-06), bekukan snapshot (RE-05), bentuk seluruh langkah (SDD-APR-04). */
    async createInstance(scope: TransactionScope, p: PengajuanBaru): Promise<InstanceBaru> {
        const repo = createApprovalRepository(scope.tx);
        const { terpilih } = selectRule(await repo.activeRules(scope.ctx, p.jenis), p.fakta);
        const snapshot = terpilih === null ? await this.snapshotBawaan(repo, scope.ctx) : snapshotDari(terpilih);

        const instanceId = await repo.insertInstance(scope.ctx, p.jenis, p.referensiId, p.pemohonId, snapshot.rule_id, snapshot);
        await repo.insertLangkah(scope.ctx, instanceId, snapshot.langkah.map((l) => ({ ...dariSnapshotTarget(l), urutan: l.urutan })));
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "APPROVAL_INSTANCE_CREATED",
            entitas: "approval_instances",
            entitasId: instanceId,
            nilaiSesudah: { jenis_pengajuan: p.jenis, referensi_id: p.referensiId, rule_id: snapshot.rule_id, versi: snapshot.versi },
        });

        // RE-10 / SDD-02 §4.3: konflik kepentingan diputuskan saat instance lahir, bagi SEMUA langkah.
        const tanggal = tanggalWib(this.clock.now());
        for (const l of await repo.langkahInstance(scope.ctx, instanceId)) {
            const hasil = await this.resolusi(repo, scope.ctx, l, p.pemohonId, tanggal);
            if (hasil.sebabKosong === "KONFLIK_KEPENTINGAN") await this.lewati(scope, repo, instanceId, l, hasil);
        }

        const langkahAktif = await this.aktifkanBerikutnya(scope, instanceId);
        return { instanceId, ruleId: snapshot.rule_id, langkahAktif };
    }

    /**
     * SDD-02 §4.4 `activate`: langkah terbuka pertama yang punya pemutus sah menjadi aktif;
     * yang tidak punya dilewati beralasan (RE-10/RE-13). Bila habis, langkah fallback
     * ditambahkan dan diaktifkan apa adanya (RE-11) — tidak pernah disetujui otomatis
     * (BR-039a) — dan Administrator dialarmi (NT-47). Mengembalikan urutan langkah aktif.
     */
    async aktifkanBerikutnya(scope: TransactionScope, instanceId: number): Promise<number> {
        const repo = createApprovalRepository(scope.tx);
        const { pemohonId, snapshot: mentah } = await repo.muatInstance(scope.ctx, instanceId);
        const snapshot = mentah as SnapshotAturan;
        const langkah = await repo.langkahInstance(scope.ctx, instanceId);
        const tanggal = tanggalWib(this.clock.now());

        for (const l of langkah.filter((x) => x.terbuka)) {
            const dariAturan = snapshot.langkah.find((s) => s.urutan === l.urutan);
            // Langkah fallback (di luar snapshot) adalah jalur terakhir: tidak dilewati lagi.
            if (dariAturan === undefined) return this.aktifkan(scope, repo, instanceId, l, SLA_FALLBACK_JAM);
            const hasil = await this.resolusi(repo, scope.ctx, l, pemohonId, tanggal);
            if (hasil.pemutus.length > 0) return this.aktifkan(scope, repo, instanceId, l, dariAturan.sla_jam);
            await this.lewati(scope, repo, instanceId, l, hasil);
        }

        const target =
            snapshot.fallback_approver === null
                ? { approverType: "role" as const, roleId: await repo.roleIdByKode(scope.ctx, KODE_ROLE_ADMINISTRATOR), userId: null }
                : dariSnapshotTarget(snapshot.fallback_approver);
        const urutan = Math.max(0, ...langkah.map((l) => l.urutan)) + 1;
        await repo.insertLangkah(scope.ctx, instanceId, [{ ...target, urutan }]);
        const [fallback] = (await repo.langkahInstance(scope.ctx, instanceId)).filter((l) => l.urutan === urutan);
        if (fallback === undefined) throw new Error(`Langkah fallback instance ${String(instanceId)} tidak tersimpan.`);
        await publish(scope, {
            name: "ApprovalFallbackRouted",
            aggregateType: "approval_instance",
            aggregateId: instanceId,
            payload: { instance_id: instanceId, urutan_fallback: urutan },
        });
        return this.aktifkan(scope, repo, instanceId, fallback, SLA_FALLBACK_JAM);
    }

    /** `POST /approvals/delegate` (FR-10.2 A3, SDD-APR-16): pemberi = pemanggil. */
    async delegasikan(ctx: AuthContext, input: DelegasiBaru): Promise<DelegasiRow> {
        if (input.penerimaId === ctx.userId) {
            throw new DomainError("VALIDATION_ERROR", "Penerima delegasi tidak boleh diri Anda sendiri.", { field: "penerima_id" });
        }
        if (input.selesai < tanggalWib(this.clock.now())) {
            throw new DomainError("VALIDATION_ERROR", "Tanggal selesai delegasi sudah lewat.", { field: "selesai" });
        }
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createApprovalRepository(scope.tx);
                const calon = await repo.calonPenerima(scope.ctx, input.penerimaId);
                // Satu pesan bagi tak ada/nonaktif/tak berhak: tidak membocorkan keberadaan akun.
                if (calon === undefined || !calon.aktif || !calon.bolehMemutus) {
                    throw new DomainError("VALIDATION_ERROR", "Penerima delegasi harus pengguna aktif yang berwenang memutus persetujuan.", {
                        field: "penerima_id",
                    });
                }
                let delegasi: DelegasiRow;
                try {
                    delegasi = await repo.insertDelegasi(scope.ctx, ctx.userId, input.penerimaId, input.mulai, input.selesai);
                } catch (e) {
                    if ((e as { code?: unknown }).code === EXCLUSION_VIOLATION) {
                        throw new DomainError("VALIDATION_ERROR", "Anda sudah memiliki delegasi yang beririsan dengan rentang tanggal ini.", {
                            field: "mulai",
                        });
                    }
                    throw e;
                }
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "APPROVAL_DELEGATED",
                    entitas: "approval_delegations",
                    entitasId: delegasi.id,
                    nilaiSesudah: delegasi,
                });
                return delegasi;
            },
            this.db,
        );
    }

    private async snapshotBawaan(repo: ApprovalRepository, ctx: AuthContext): Promise<SnapshotAturan> {
        const [langkah] = ATURAN_BAWAAN.steps;
        return {
            rule_id: null,
            versi: null,
            prioritas: null,
            kondisi: ATURAN_BAWAAN.kondisi,
            langkah: [
                {
                    urutan: langkah.order,
                    approver_type: "role",
                    approver_role_id: await repo.roleIdByKode(ctx, langkah.approver_role),
                    approver_user_id: null,
                    sla_jam: langkah.sla_hours,
                    on_sla_breach: langkah.on_sla_breach,
                    eskalasi_ke: null,
                },
            ],
            fallback_approver: null,
            terminal_on_exhausted_escalation: ATURAN_BAWAAN.terminal_on_exhausted_escalation,
        };
    }

    private async resolusi(repo: ApprovalRepository, ctx: AuthContext, target: Target, pemohonId: number, tanggal: string): Promise<HasilResolusi> {
        const pemegang = await repo.pemegangAktif(ctx, target);
        return resolvePemutus(pemegang, await repo.delegasiBerlaku(ctx, pemegang, tanggal), pemohonId);
    }

    private async lewati(scope: TransactionScope, repo: ApprovalRepository, instanceId: number, l: LangkahInstance, hasil: HasilResolusi): Promise<void> {
        const alasan = ALASAN_DILEWATI[hasil.sebabKosong ?? "APPROVER_NONAKTIF"];
        await repo.lewatiLangkah(scope.ctx, l.id, alasan, this.clock.now());
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "APPROVAL_STEP_SKIPPED",
            entitas: "approval_steps",
            entitasId: l.id,
            keterangan: `dilewati — ${alasan}`,
            nilaiSesudah: { instance_id: instanceId, urutan: l.urutan, alasan_dilewati: alasan },
        });
    }

    /** SDD-APR-07: tenggat absolut dalam jam kerja (CAL-01, SDD-APR-15). */
    private async aktifkan(scope: TransactionScope, repo: ApprovalRepository, instanceId: number, l: LangkahInstance, slaJam: number): Promise<number> {
        const tenggat = await this.calendar.addWorkingHours(scope.tx, this.clock.now(), slaJam);
        await repo.aktifkanLangkah(scope.ctx, instanceId, l.id, l.urutan, tenggat);
        return l.urutan;
    }
}
