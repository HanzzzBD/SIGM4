// Repository SLA & eskalasi (SDD-02 §4.5, SDD-APR-07; SDD-AUTH-02). PRIVAT terhadap
// modul — hanya services/sla-tracker.ts yang memanggilnya. Kolom pelacakan: 0033.

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { JenisPengajuan } from "../services/dsl.js";
import type { LangkahInstance } from "./approval.repository.js";

export interface LangkahTerkunci extends LangkahInstance {
    readonly instanceId: number;
    readonly slaDeadline: Date | null;
    readonly dieskalasiPada: Date | null;
    readonly pengingatTerakhirPada: Date | null;
    readonly alarmTerminalPada: Date | null;
}

export interface InstanceSla {
    readonly status: string;
    readonly langkahAktif: number | null;
    readonly pemohonId: number;
    readonly jenis: JenisPengajuan;
    readonly snapshot: unknown;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

export class SlaRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Langkah aktif seluruh instance yang masih menunggu (indeks `approval_steps_sla_idx`). */
    async langkahAktif(ctx: AuthContext): Promise<readonly number[]> {
        const baris = await this.query(ctx)
            .selectFrom("approval_steps as s")
            .innerJoin("approval_instances as i", (j) => j.onRef("i.id", "=", "s.instance_id").onRef("i.langkah_aktif", "=", "s.urutan"))
            .select("s.id")
            .where("i.status", "=", "MENUNGGU")
            .where("s.keputusan", "is", null)
            .orderBy("s.id")
            .execute();
        return baris.map((b) => Number(b.id));
    }

    /**
     * Mengunci baris LANGKAH lebih dulu — urutan yang sama dengan `decide` (langkah lalu
     * instance), sehingga job dan approver tidak saling mengunci silang. Langkah yang sudah
     * diputus sementara menunggu kunci tidak dikembalikan.
     */
    async kunci(ctx: AuthContext, stepId: number): Promise<LangkahTerkunci | undefined> {
        const b = await this.query(ctx)
            .selectFrom("approval_steps")
            .select([
                "id",
                "instance_id",
                "urutan",
                "approver_type",
                "approver_role_id",
                "approver_user_id",
                "sla_deadline",
                "dieskalasi_pada",
                "pengingat_terakhir_pada",
                "alarm_terminal_pada",
            ])
            .where("id", "=", String(stepId))
            .where("keputusan", "is", null)
            .forUpdate()
            .executeTakeFirst();
        return b === undefined
            ? undefined
            : {
                  id: Number(b.id),
                  instanceId: Number(b.instance_id),
                  urutan: b.urutan,
                  approverType: b.approver_type,
                  roleId: num(b.approver_role_id),
                  userId: num(b.approver_user_id),
                  terbuka: true,
                  slaDeadline: b.sla_deadline,
                  dieskalasiPada: b.dieskalasi_pada,
                  pengingatTerakhirPada: b.pengingat_terakhir_pada,
                  alarmTerminalPada: b.alarm_terminal_pada,
              };
    }

    async instance(ctx: AuthContext, instanceId: number): Promise<InstanceSla> {
        const b = await this.query(ctx)
            .selectFrom("approval_instances")
            .select(["status", "langkah_aktif", "pemohon_id", "jenis_pengajuan", "rule_snapshot"])
            .where("id", "=", String(instanceId))
            .executeTakeFirstOrThrow();
        return { status: b.status, langkahAktif: b.langkah_aktif, pemohonId: Number(b.pemohon_id), jenis: b.jenis_pengajuan, snapshot: b.rule_snapshot };
    }

    async tandaiPengingat(ctx: AuthContext, stepId: number, pada: Date): Promise<void> {
        await this.query(ctx).updateTable("approval_steps").set({ pengingat_terakhir_pada: pada }).where("id", "=", String(stepId)).execute();
    }

    /** D.5 `escalate`: target dialihkan ke pengguna eskalasi, tenggat baru absolut (SDD-APR-07). */
    async alihkan(ctx: AuthContext, stepId: number, keUserId: number, dariUserId: number | null, pada: Date, tenggat: Date): Promise<void> {
        await this.query(ctx)
            .updateTable("approval_steps")
            .set({
                approver_type: "user",
                approver_role_id: null,
                approver_user_id: keUserId,
                eskalasi_dari_user_id: dariUserId,
                dieskalasi_pada: pada,
                sla_deadline: tenggat,
            })
            .where("id", "=", String(stepId))
            .execute();
    }

    async tandaiTerminal(ctx: AuthContext, stepId: number, pada: Date): Promise<void> {
        await this.query(ctx).updateTable("approval_steps").set({ alarm_terminal_pada: pada }).where("id", "=", String(stepId)).execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createSlaRepository(executor: QueryExecutor): SlaRepository {
    return defineRepository(new SlaRepository(executor));
}
