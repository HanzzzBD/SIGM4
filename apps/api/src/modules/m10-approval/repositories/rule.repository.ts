// Repository konfigurasi approval rule (FR-10.1, SDD-02 §4.5b; SDD-AUTH-02). PRIVAT
// terhadap modul — hanya services/rule-config.service.ts yang memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { JenisPengajuan, Kondisi } from "../services/dsl.js";
import type { LangkahAturan, Target } from "./approval.repository.js";

/** Aturan yang sudah dipetakan ke id (role kode → id terjadi di layanan). */
export interface AturanTersolusi {
    readonly jenis: JenisPengajuan;
    readonly prioritas: number;
    readonly kondisi: Kondisi;
    readonly langkah: readonly LangkahAturan[];
    readonly fallback: Target | null;
    readonly terminal: "hold_and_alert" | "auto_reject";
}

export interface AturanBaris extends AturanTersolusi {
    readonly id: number;
    readonly statusAktif: boolean;
    readonly versi: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export interface InfoPengguna {
    readonly nama: string;
    readonly aktif: boolean;
    readonly bolehMemutus: boolean;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

export class RuleRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Seluruh aturan (aktif & nonaktif), `id` menaik; `hanyaId` membatasi ke satu aturan. */
    async daftar(ctx: AuthContext, hanyaId?: number): Promise<readonly AturanBaris[]> {
        let q = this.query(ctx)
            .selectFrom("approval_rules")
            .select([
                "id",
                "jenis_pengajuan",
                "prioritas",
                "kondisi",
                "status_aktif",
                "versi",
                "fallback_approver_type",
                "fallback_role_id",
                "fallback_user_id",
                "terminal_on_exhausted_escalation",
                "created_at",
                "updated_at",
            ]);
        if (hanyaId !== undefined) q = q.where("id", "=", String(hanyaId));
        const aturan = await q.orderBy("id").execute();
        if (aturan.length === 0) return [];
        const langkah = await this.query(ctx)
            .selectFrom("approval_rule_steps")
            .select(["rule_id", "urutan", "approver_type", "approver_role_id", "approver_user_id", "sla_jam", "on_sla_breach", "eskalasi_ke"])
            .where("rule_id", "in", aturan.map((a) => a.id))
            .orderBy("urutan")
            .execute();
        return aturan.map((a) => ({
            id: Number(a.id),
            jenis: a.jenis_pengajuan,
            prioritas: a.prioritas,
            kondisi: a.kondisi as Kondisi,
            statusAktif: a.status_aktif,
            versi: a.versi,
            fallback: a.fallback_approver_type === null ? null : { approverType: a.fallback_approver_type, roleId: num(a.fallback_role_id), userId: num(a.fallback_user_id) },
            terminal: a.terminal_on_exhausted_escalation,
            createdAt: a.created_at,
            updatedAt: a.updated_at,
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

    async roles(ctx: AuthContext): Promise<readonly { id: number; kode: string; nama: string }[]> {
        const baris = await this.query(ctx).selectFrom("roles").select(["id", "kode", "nama"]).execute();
        return baris.map((b) => ({ id: Number(b.id), kode: b.kode, nama: b.nama }));
    }

    /** SDD-02 §4.5b: pengguna langkah/eskalasi/fallback wajib ada, AKTIF, dan memegang `approval.decide`. */
    async pengguna(ctx: AuthContext, ids: readonly number[]): Promise<ReadonlyMap<number, InfoPengguna>> {
        if (ids.length === 0) return new Map();
        const baris = await this.query(ctx)
            .selectFrom("users as u")
            .select([
                "u.id",
                "u.nama",
                "u.status",
                sql<boolean>`EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
                                      WHERE rp.role_id = u.role_id AND p.kode = 'approval.decide')`.as("boleh"),
            ])
            .where("u.id", "in", ids.map(String))
            .execute();
        return new Map(baris.map((b) => [Number(b.id), { nama: b.nama, aktif: b.status === "AKTIF", bolehMemutus: b.boleh }]));
    }

    async buat(ctx: AuthContext, a: AturanTersolusi): Promise<number> {
        const pelaku = pelakuId(ctx);
        const baris = await this.query(ctx)
            .insertInto("approval_rules")
            .values({
                jenis_pengajuan: a.jenis,
                prioritas: a.prioritas,
                kondisi: JSON.stringify(a.kondisi),
                fallback_approver_type: a.fallback?.approverType ?? null,
                fallback_role_id: a.fallback?.roleId ?? null,
                fallback_user_id: a.fallback?.userId ?? null,
                terminal_on_exhausted_escalation: a.terminal,
                created_by: pelaku,
                updated_by: pelaku,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        const id = Number(baris.id);
        await this.sisipLangkah(ctx, id, a.langkah);
        return id;
    }

    /**
     * Mengganti definisi utuh dan menaikkan `versi` (FR-10.1 AC). Instance berjalan tidak
     * tersentuh: definisinya beku di `rule_snapshot` (SDD-APR-03). `false` bila tak ada.
     */
    async ganti(ctx: AuthContext, id: number, a: AturanTersolusi): Promise<boolean> {
        const hasil = await this.query(ctx)
            .updateTable("approval_rules")
            .set((eb) => ({
                jenis_pengajuan: a.jenis,
                prioritas: a.prioritas,
                kondisi: JSON.stringify(a.kondisi),
                fallback_approver_type: a.fallback?.approverType ?? null,
                fallback_role_id: a.fallback?.roleId ?? null,
                fallback_user_id: a.fallback?.userId ?? null,
                terminal_on_exhausted_escalation: a.terminal,
                versi: eb("versi", "+", 1),
                updated_by: pelakuId(ctx),
            }))
            .where("id", "=", String(id))
            .executeTakeFirst();
        if (hasil.numUpdatedRows !== 1n) return false;
        await this.query(ctx).deleteFrom("approval_rule_steps").where("rule_id", "=", String(id)).execute();
        await this.sisipLangkah(ctx, id, a.langkah);
        return true;
    }

    /** `false` bila aturan tidak ada. */
    async setStatus(ctx: AuthContext, id: number, aktif: boolean): Promise<boolean> {
        const hasil = await this.query(ctx)
            .updateTable("approval_rules")
            .set({ status_aktif: aktif, updated_by: pelakuId(ctx) })
            .where("id", "=", String(id))
            .executeTakeFirst();
        return hasil.numUpdatedRows === 1n;
    }

    private async sisipLangkah(ctx: AuthContext, ruleId: number, langkah: readonly LangkahAturan[]): Promise<void> {
        await this.query(ctx)
            .insertInto("approval_rule_steps")
            .values(
                langkah.map((l) => ({
                    rule_id: ruleId,
                    urutan: l.urutan,
                    approver_type: l.approverType,
                    approver_role_id: l.roleId,
                    approver_user_id: l.userId,
                    sla_jam: l.slaJam,
                    on_sla_breach: l.onSlaBreach,
                    eskalasi_ke: l.eskalasiKe,
                })),
            )
            .execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createRuleRepository(executor: QueryExecutor): RuleRepository {
    return defineRepository(new RuleRepository(executor));
}
