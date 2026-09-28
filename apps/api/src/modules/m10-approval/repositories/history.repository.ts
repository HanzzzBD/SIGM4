// Repository linimasa persetujuan (FR-10.3, SDD-02 §4.5a; SDD-AUTH-02). PRIVAT
// terhadap modul — hanya services/history.service.ts yang memanggilnya.

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { JenisPengajuan } from "../services/dsl.js";
import type { Target } from "./approval.repository.js";
import type { StatusInstance } from "./decision.repository.js";

export interface Nama {
    readonly id: number;
    readonly nama: string | null;
}

export interface InstanceRiwayat {
    readonly id: number;
    readonly jenis: JenisPengajuan;
    readonly referensiId: number;
    readonly status: StatusInstance;
    readonly pemohon: Nama;
    readonly ruleId: number | null;
    readonly snapshot: unknown;
    readonly langkahAktif: number | null;
    readonly createdAt: Date;
    readonly diselesaikanPada: Date | null;
}

export interface LangkahRiwayat extends Target {
    readonly urutan: number;
    readonly targetRoleNama: string | null;
    readonly targetUserNama: string | null;
    readonly keputusan: "DISETUJUI" | "DITOLAK" | "PERLU_REVISI" | "DILEWATI" | null;
    readonly catatan: string | null;
    readonly diputuskanOleh: Nama | null;
    readonly atasNama: Nama | null;
    readonly diputuskanPada: Date | null;
    readonly alasanDilewati: string | null;
    readonly slaDeadline: Date | null;
    readonly dieskalasiPada: Date | null;
    readonly eskalasiDari: Nama | null;
    readonly alarmTerminalPada: Date | null;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));
const nama = (id: string | null, n: string | null): Nama | null => (id === null ? null : { id: Number(id), nama: n });

export class HistoryRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async instance(ctx: AuthContext, id: number): Promise<InstanceRiwayat | undefined> {
        const b = await this.query(ctx)
            .selectFrom("approval_instances as i")
            .leftJoin("users as p", "p.id", "i.pemohon_id")
            .select([
                "i.id",
                "i.jenis_pengajuan",
                "i.referensi_id",
                "i.status",
                "i.pemohon_id",
                "p.nama as pemohon_nama",
                "i.rule_id",
                "i.rule_snapshot",
                "i.langkah_aktif",
                "i.created_at",
                "i.diselesaikan_pada",
            ])
            .where("i.id", "=", String(id))
            .executeTakeFirst();
        return b === undefined
            ? undefined
            : {
                  id: Number(b.id),
                  jenis: b.jenis_pengajuan,
                  referensiId: Number(b.referensi_id),
                  status: b.status,
                  pemohon: { id: Number(b.pemohon_id), nama: b.pemohon_nama },
                  ruleId: num(b.rule_id),
                  snapshot: b.rule_snapshot,
                  langkahAktif: b.langkah_aktif,
                  createdAt: b.created_at,
                  diselesaikanPada: b.diselesaikan_pada,
              };
    }

    async langkah(ctx: AuthContext, instanceId: number): Promise<readonly LangkahRiwayat[]> {
        const baris = await this.query(ctx)
            .selectFrom("approval_steps as s")
            .leftJoin("roles as r", "r.id", "s.approver_role_id")
            .leftJoin("users as t", "t.id", "s.approver_user_id")
            .leftJoin("users as d", "d.id", "s.diputuskan_oleh")
            .leftJoin("users as a", "a.id", "s.atas_nama_user_id")
            .leftJoin("users as e", "e.id", "s.eskalasi_dari_user_id")
            .select([
                "s.urutan",
                "s.approver_type",
                "s.approver_role_id",
                "s.approver_user_id",
                "r.nama as role_nama",
                "t.nama as target_nama",
                "s.keputusan",
                "s.catatan",
                "s.diputuskan_oleh",
                "d.nama as pemutus_nama",
                "s.atas_nama_user_id",
                "a.nama as atas_nama_nama",
                "s.diputuskan_pada",
                "s.alasan_dilewati",
                "s.sla_deadline",
                "s.dieskalasi_pada",
                "s.eskalasi_dari_user_id",
                "e.nama as eskalasi_dari_nama",
                "s.alarm_terminal_pada",
            ])
            .where("s.instance_id", "=", String(instanceId))
            .orderBy("s.urutan")
            .execute();
        return baris.map((b) => ({
            urutan: b.urutan,
            approverType: b.approver_type,
            roleId: num(b.approver_role_id),
            userId: num(b.approver_user_id),
            targetRoleNama: b.role_nama,
            targetUserNama: b.target_nama,
            keputusan: b.keputusan,
            catatan: b.catatan,
            diputuskanOleh: nama(b.diputuskan_oleh, b.pemutus_nama),
            atasNama: nama(b.atas_nama_user_id, b.atas_nama_nama),
            diputuskanPada: b.diputuskan_pada,
            alasanDilewati: b.alasan_dilewati,
            slaDeadline: b.sla_deadline,
            dieskalasiPada: b.dieskalasi_pada,
            eskalasiDari: nama(b.eskalasi_dari_user_id, b.eskalasi_dari_nama),
            alarmTerminalPada: b.alarm_terminal_pada,
        }));
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createHistoryRepository(executor: QueryExecutor): HistoryRepository {
    return defineRepository(new HistoryRepository(executor));
}
