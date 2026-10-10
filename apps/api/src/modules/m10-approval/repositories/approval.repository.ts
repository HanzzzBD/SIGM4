// Repository mesin persetujuan (SDD-02 §4.1 RuleRepository + penyimpanan instance,
// SDD-AUTH-02). PRIVAT terhadap modul — hanya services/ yang memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { DelegasiBerlaku } from "../services/approver-resolver.js";
import type { JenisPengajuan, Kondisi } from "../services/dsl.js";

export type TipeApprover = "role" | "user";

/** Target approver: tepat satu dari role/pengguna (CHECK `*_approver_sah`, 0031). */
export interface Target {
    readonly approverType: TipeApprover;
    readonly roleId: number | null;
    readonly userId: number | null;
}

export interface LangkahAturan extends Target {
    readonly urutan: number;
    readonly slaJam: number;
    readonly onSlaBreach: "remind" | "escalate";
    readonly eskalasiKe: number | null;
}

export interface AturanAktif {
    readonly id: number;
    readonly versi: number;
    readonly prioritas: number;
    readonly kondisi: Kondisi;
    readonly fallback: Target | null;
    readonly terminal: "hold_and_alert" | "auto_reject";
    readonly langkah: readonly LangkahAturan[];
}

export interface LangkahInstance extends Target {
    readonly id: number;
    readonly urutan: number;
    /** Belum diputus maupun dilewati (`keputusan IS NULL`). */
    readonly terbuka: boolean;
}

export interface DelegasiRow {
    readonly id: string;
    readonly pemberi_id: string;
    readonly penerima_id: string;
    readonly mulai: string;
    readonly selesai: string;
    readonly created_at: Date;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

export class ApprovalRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** RE-04: aturan aktif sejenis beserta langkahnya (indeks `approval_rules_pemilihan_idx`). */
    async activeRules(ctx: AuthContext, jenis: JenisPengajuan): Promise<readonly AturanAktif[]> {
        const aturan = await this.query(ctx)
            .selectFrom("approval_rules")
            .select(["id", "versi", "prioritas", "kondisi", "fallback_approver_type", "fallback_role_id", "fallback_user_id", "terminal_on_exhausted_escalation"])
            .where("jenis_pengajuan", "=", jenis)
            .where("status_aktif", "=", true)
            .orderBy("prioritas", "desc")
            .orderBy("id")
            .execute();
        if (aturan.length === 0) return [];
        const langkah = await this.query(ctx)
            .selectFrom("approval_rule_steps")
            .select(["rule_id", "urutan", "approver_type", "approver_role_id", "approver_user_id", "sla_jam", "on_sla_breach", "eskalasi_ke"])
            .where("rule_id", "in", aturan.map((a) => a.id))
            .orderBy("rule_id")
            .orderBy("urutan")
            .execute();
        return aturan.map((a) => ({
            id: Number(a.id),
            versi: a.versi,
            prioritas: a.prioritas,
            kondisi: a.kondisi as Kondisi,
            fallback:
                a.fallback_approver_type === null
                    ? null
                    : { approverType: a.fallback_approver_type, roleId: num(a.fallback_role_id), userId: num(a.fallback_user_id) },
            terminal: a.terminal_on_exhausted_escalation,
            langkah: langkah
                .filter((l) => l.rule_id === a.id)
                .map((l) => ({
                    urutan: l.urutan,
                    approverType: l.approver_type,
                    roleId: num(l.approver_role_id),
                    userId: num(l.approver_user_id),
                    slaJam: l.sla_jam,
                    onSlaBreach: l.on_sla_breach,
                    eskalasiKe: num(l.eskalasi_ke),
                })),
        }));
    }

    async roleIdByKode(ctx: AuthContext, kode: string): Promise<number> {
        const baris = await this.query(ctx).selectFrom("roles").select("id").where("kode", "=", kode).executeTakeFirstOrThrow();
        return Number(baris.id);
    }

    /** Pemegang AKTIF target: seluruh pemegang role, atau pengguna itu sendiri bila AKTIF. */
    async pemegangAktif(ctx: AuthContext, target: Target): Promise<readonly number[]> {
        let q = this.query(ctx).selectFrom("users").select("id").where("status", "=", "AKTIF");
        q = target.approverType === "role" ? q.where("role_id", "=", String(target.roleId)) : q.where("id", "=", String(target.userId));
        const baris = await q.orderBy("id").execute();
        return baris.map((b) => Number(b.id));
    }

    /** SDD-APR-16: delegasi yang mencakup `tanggal` (WIB, 'YYYY-MM-DD') bagi para pemberi. */
    async delegasiBerlaku(ctx: AuthContext, pemberiIds: readonly number[], tanggal: string): Promise<readonly DelegasiBerlaku[]> {
        if (pemberiIds.length === 0) return [];
        const baris = await this.query(ctx)
            .selectFrom("approval_delegations as d")
            .innerJoin("users as u", "u.id", "d.penerima_id")
            .select(["d.pemberi_id", "d.penerima_id", "u.status"])
            .where("d.pemberi_id", "in", pemberiIds.map(String))
            .where(sql<boolean>`${tanggal}::date BETWEEN d.mulai AND d.selesai`)
            .execute();
        return baris.map((b) => ({ pemberiId: Number(b.pemberi_id), penerimaId: Number(b.penerima_id), penerimaAktif: b.status === "AKTIF" }));
    }

    /** Instance `MENUNGGU` sebuah objek (paling banyak satu — indeks `approval_instances_berjalan_uq`), dikunci. */
    async instanceBerjalan(ctx: AuthContext, jenis: JenisPengajuan, referensiId: number): Promise<{ instanceId: number; langkahAktif: number | null } | undefined> {
        const baris = await this.query(ctx)
            .selectFrom("approval_instances")
            .select(["id", "langkah_aktif"])
            .where("jenis_pengajuan", "=", jenis)
            .where("referensi_id", "=", String(referensiId))
            .where("status", "=", "MENUNGGU")
            .forUpdate()
            .executeTakeFirst();
        return baris === undefined ? undefined : { instanceId: Number(baris.id), langkahAktif: baris.langkah_aktif };
    }

    /** Status akhir di luar keputusan approver; CHECK `approval_instances_selesai_konsisten` menuntut waktu selesai. */
    async tutupInstance(ctx: AuthContext, instanceId: number, status: "DIBATALKAN", pada: Date): Promise<void> {
        await this.query(ctx)
            .updateTable("approval_instances")
            .set({ status, diselesaikan_pada: pada, langkah_aktif: null })
            .where("id", "=", String(instanceId))
            .where("status", "=", "MENUNGGU")
            .execute();
    }

    async insertInstance(ctx: AuthContext, jenis: JenisPengajuan, referensiId: number, pemohonId: number, ruleId: number | null, snapshot: unknown): Promise<number> {
        const baris = await this.query(ctx)
            .insertInto("approval_instances")
            .values({ jenis_pengajuan: jenis, referensi_id: referensiId, pemohon_id: pemohonId, rule_id: ruleId, rule_snapshot: JSON.stringify(snapshot) })
            .returning("id")
            .executeTakeFirstOrThrow();
        return Number(baris.id);
    }

    /** Bahan aktivasi: pemohon (BR-039) dan snapshot (SLA per langkah, fallback). */
    async muatInstance(ctx: AuthContext, instanceId: number): Promise<{ pemohonId: number; snapshot: unknown }> {
        const baris = await this.query(ctx)
            .selectFrom("approval_instances")
            .select(["pemohon_id", "rule_snapshot"])
            .where("id", "=", String(instanceId))
            .executeTakeFirstOrThrow();
        return { pemohonId: Number(baris.pemohon_id), snapshot: baris.rule_snapshot };
    }

    async insertLangkah(ctx: AuthContext, instanceId: number, langkah: readonly (Target & { urutan: number })[]): Promise<void> {
        await this.query(ctx)
            .insertInto("approval_steps")
            .values(
                langkah.map((l) => ({
                    instance_id: instanceId,
                    urutan: l.urutan,
                    approver_type: l.approverType,
                    approver_role_id: l.roleId,
                    approver_user_id: l.userId,
                })),
            )
            .execute();
    }

    async langkahInstance(ctx: AuthContext, instanceId: number): Promise<readonly LangkahInstance[]> {
        const baris = await this.query(ctx)
            .selectFrom("approval_steps")
            .select(["id", "urutan", "approver_type", "approver_role_id", "approver_user_id", "keputusan"])
            .where("instance_id", "=", String(instanceId))
            .orderBy("urutan")
            .execute();
        return baris.map((b) => ({
            id: Number(b.id),
            urutan: b.urutan,
            approverType: b.approver_type,
            roleId: num(b.approver_role_id),
            userId: num(b.approver_user_id),
            terbuka: b.keputusan === null,
        }));
    }

    /** SDD-APR-12: dilewati tetap ditulis, beralasan; diputuskan sistem (tanpa pemutus). */
    async lewatiLangkah(ctx: AuthContext, stepId: number, alasan: string, pada: Date): Promise<void> {
        await this.query(ctx)
            .updateTable("approval_steps")
            .set({ keputusan: "DILEWATI", dilewati: true, alasan_dilewati: alasan, diputuskan_pada: pada })
            .where("id", "=", String(stepId))
            .where("keputusan", "is", null)
            .execute();
    }

    /** SDD-APR-04/07: penunjuk tunggal + tenggat absolut. */
    async aktifkanLangkah(ctx: AuthContext, instanceId: number, stepId: number, urutan: number, slaDeadline: Date): Promise<void> {
        await this.query(ctx).updateTable("approval_steps").set({ sla_deadline: slaDeadline }).where("id", "=", String(stepId)).execute();
        await this.query(ctx).updateTable("approval_instances").set({ langkah_aktif: urutan }).where("id", "=", String(instanceId)).execute();
    }

    /** Status dan izin memutus calon penerima delegasi (SDD-APR-16). */
    async calonPenerima(ctx: AuthContext, userId: number): Promise<{ aktif: boolean; bolehMemutus: boolean } | undefined> {
        const baris = await this.query(ctx)
            .selectFrom("users as u")
            .select([
                "u.status",
                sql<boolean>`EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
                                      WHERE rp.role_id = u.role_id AND p.kode = 'approval.decide')`.as("boleh"),
            ])
            .where("u.id", "=", String(userId))
            .executeTakeFirst();
        return baris === undefined ? undefined : { aktif: baris.status === "AKTIF", bolehMemutus: baris.boleh };
    }

    async insertDelegasi(ctx: AuthContext, pemberiId: number, penerimaId: number, mulai: string, selesai: string): Promise<DelegasiRow> {
        return this.query(ctx)
            .insertInto("approval_delegations")
            .values({ pemberi_id: pemberiId, penerima_id: penerimaId, mulai, selesai, created_by: ctx.userId, updated_by: ctx.userId })
            .returning([
                "id",
                "pemberi_id",
                "penerima_id",
                sql<string>`to_char(mulai, 'YYYY-MM-DD')`.as("mulai"),
                sql<string>`to_char(selesai, 'YYYY-MM-DD')`.as("selesai"),
                "created_at",
            ])
            .executeTakeFirstOrThrow();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createApprovalRepository(executor: QueryExecutor): ApprovalRepository {
    return defineRepository(new ApprovalRepository(executor));
}
