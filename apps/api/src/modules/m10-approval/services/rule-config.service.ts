// RuleConfigService — konfigurasi approval rule + pratinjau (FR-10.1, RE-04 … RE-08,
// Lampiran D.5, SDD-APR-02/10, SDD-02 §4.5b; keputusan 77). Body berbentuk D.5 dengan
// role ditulis KODE; dipetakan ke id di sini. Pratinjau memakai evaluator + pemilih +
// resolusi pemutus yang SAMA dengan mesin (SDD-APR-10) dan tidak menulis apa pun.

import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import type { LangkahAturan, Target } from "../repositories/approval.repository.js";
import type { AturanBaris, AturanTersolusi, RuleRepository } from "../repositories/rule.repository.js";
import { createRuleRepository } from "../repositories/rule.repository.js";
import type { DefinisiAturan } from "../schemas/rule.schema.js";
import type { ApprovalService } from "./approval.service.js";
import { ALASAN_DILEWATI } from "./approver-resolver.js";
import type { KamusFakta } from "./condition-evaluator.js";
import type { JenisPengajuan } from "./dsl.js";
import { ATURAN_BAWAAN, selectRule } from "./rule-selector.js";
import type { PelanggaranAturan } from "./rule-validator.js";
import { validateCondition } from "./rule-validator.js";

const MODUL = "m10-approval";
const PESAN_TIDAK_VALID = "Definisi aturan persetujuan tidak valid.";
/** RE-11 / SDD-APR-13: fallback bawaan. */
const KODE_ROLE_ADMINISTRATOR = "R-01";

type Role = { readonly id: number; readonly kode: string; readonly nama: string };
type Nama = { readonly id: number; readonly nama: string | null };

/** Bentuk D.5 yang dikembalikan GET/POST/PUT — kebalikan persis dari body. */
export interface AturanRespons {
    readonly id: number;
    readonly jenis_pengajuan: JenisPengajuan;
    readonly prioritas: number;
    readonly status_aktif: boolean;
    readonly versi: number;
    readonly kondisi: unknown;
    readonly steps: readonly Record<string, unknown>[];
    readonly fallback_approver: Record<string, unknown> | null;
    readonly terminal_on_exhausted_escalation: "hold_and_alert" | "auto_reject";
    readonly created_at: Date;
    readonly updated_at: Date;
}

export interface InputPratinjau {
    readonly jenis_pengajuan: JenisPengajuan;
    readonly fakta: KamusFakta;
    readonly pemohon_id?: number | undefined;
    readonly aturan_draf?: (DefinisiAturan & { readonly id?: number | undefined }) | undefined;
}

export interface LangkahPratinjau {
    readonly urutan: number;
    readonly approver: { readonly tipe: "role" | "user"; readonly role: { kode: string | null; nama: string | null } | null; readonly user: Nama | null };
    readonly sla_jam: number;
    readonly on_sla_breach: "remind" | "escalate";
    readonly eskalasi_ke: Nama | null;
    readonly fallback: boolean;
    /** RE-10 / RE-13: alasan bila langkah akan dilewati bagi `pemohon_id`. */
    readonly akan_dilewati: string | null;
}

export interface HasilPratinjau {
    readonly terpilih: { rule_id: number | null; draf: boolean; bawaan: boolean; prioritas: number | null; versi: number | null };
    readonly cocok: readonly { rule_id: number | null; draf: boolean; prioritas: number }[];
    readonly langkah: readonly LangkahPratinjau[];
}

interface Kandidat {
    readonly id: number;
    readonly prioritas: number;
    readonly kondisi: AturanTersolusi["kondisi"];
    readonly aturan: AturanTersolusi;
    readonly draf: boolean;
    readonly versi: number | null;
}

export class RuleConfigService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly approval: ApprovalService,
    ) {}

    async daftar(ctx: AuthContext): Promise<readonly AturanRespons[]> {
        return withTransaction(ctx, async (scope) => {
            const repo = createRuleRepository(scope.tx);
            const roles = await repo.roles(scope.ctx);
            return (await repo.daftar(scope.ctx)).map((a) => keRespons(a, roles));
        }, this.db);
    }

    /** `POST /approval-rules` — APPROVAL_RULE_CREATED. */
    async buat(ctx: AuthContext, def: DefinisiAturan): Promise<AturanRespons> {
        return withTransaction(ctx, async (scope) => {
            const repo = createRuleRepository(scope.tx);
            const id = await repo.buat(scope.ctx, await this.solusikan(scope, repo, def));
            return this.catat(scope, repo, id, "APPROVAL_RULE_CREATED", undefined);
        }, this.db);
    }

    /** `PUT /approval-rules/{id}` — definisi utuh diganti, versi naik (FR-10.1 A4, BR-040). */
    async ganti(ctx: AuthContext, id: number, def: DefinisiAturan): Promise<AturanRespons> {
        return withTransaction(ctx, async (scope) => {
            const repo = createRuleRepository(scope.tx);
            const sebelum = await this.muat(scope, repo, id);
            if (!(await repo.ganti(scope.ctx, id, await this.solusikan(scope, repo, def)))) throw new NotFoundError("Aturan persetujuan tidak ditemukan.");
            return this.catat(scope, repo, id, "APPROVAL_RULE_UPDATED", sebelum);
        }, this.db);
    }

    /** `PATCH /approval-rules/{id}/status` — nonaktif: DEACTIVATED; aktif kembali: UPDATED. */
    async ubahStatus(ctx: AuthContext, id: number, aktif: boolean, alasan?: string): Promise<AturanRespons> {
        return withTransaction(ctx, async (scope) => {
            const repo = createRuleRepository(scope.tx);
            const sebelum = await this.muat(scope, repo, id);
            if (sebelum.status_aktif === aktif) return sebelum; // idempoten, tanpa entri log
            await repo.setStatus(scope.ctx, id, aktif);
            // UX-04: alasan penonaktifan tercatat pada entri log (PR-02-34).
            return this.catat(scope, repo, id, aktif ? "APPROVAL_RULE_UPDATED" : "APPROVAL_RULE_DEACTIVATED", sebelum, alasan);
        }, this.db);
    }

    /** `POST /approval-rules/preview` (RE-07) — tanpa efek samping. */
    async pratinjau(ctx: AuthContext, input: InputPratinjau): Promise<HasilPratinjau> {
        return withTransaction(ctx, async (scope) => {
            const repo = createRuleRepository(scope.tx);
            const roles = await repo.roles(scope.ctx);
            const kandidat: Kandidat[] = (await repo.daftar(scope.ctx))
                .filter((a) => a.statusAktif && a.jenis === input.jenis_pengajuan && a.id !== input.aturan_draf?.id)
                .map((a) => ({ id: a.id, prioritas: a.prioritas, kondisi: a.kondisi, aturan: a, draf: false, versi: a.versi }));
            if (input.aturan_draf !== undefined) {
                if (input.aturan_draf.jenis_pengajuan !== input.jenis_pengajuan) {
                    throw new DomainError("INVALID_RULE_DEFINITION", PESAN_TIDAK_VALID, {
                        errors: [{ field: "aturan_draf.jenis_pengajuan", message: "Jenis pengajuan draf harus sama dengan skenario pratinjau." }],
                    });
                }
                const aturan = await this.solusikan(scope, repo, input.aturan_draf, "aturan_draf.");
                // RE-04: draf baru akan ber-id terbesar → kalah seri dari seluruh aturan tersimpan.
                kandidat.push({ id: input.aturan_draf.id ?? Number.MAX_SAFE_INTEGER, prioritas: aturan.prioritas, kondisi: aturan.kondisi, aturan, draf: true, versi: null });
            }
            const { terpilih, cocok } = selectRule(kandidat, input.fakta);
            const bawaan = terpilih === null;
            const aturan = terpilih?.aturan ?? this.aturanBawaan(roles, input.jenis_pengajuan);
            return {
                terpilih: {
                    rule_id: terpilih === null || (terpilih.draf && input.aturan_draf?.id === undefined) ? null : terpilih.id,
                    draf: terpilih?.draf ?? false,
                    bawaan,
                    prioritas: terpilih?.prioritas ?? null,
                    versi: terpilih?.versi ?? null,
                },
                cocok: cocok.map((c) => ({ rule_id: c.draf && input.aturan_draf?.id === undefined ? null : c.id, draf: c.draf, prioritas: c.prioritas })),
                langkah: await this.langkahPratinjau(scope, repo, roles, aturan, input.pemohon_id),
            };
        }, this.db);
    }

    /**
     * Jalur yang AKAN terbentuk bagi pengajuan pemohon ini (P-29 langkah 3, RE-07; keputusan 14f
     * log phase-03): pemilih aturan & resolusi pemutus yang sama dengan `createInstance`, di
     * transaksi pemanggil, tanpa efek samping dan tanpa aturan draf.
     */
    async jalurPemohon(scope: TransactionScope, jenis: JenisPengajuan, fakta: KamusFakta, pemohonId: number): Promise<readonly LangkahPratinjau[]> {
        const repo = createRuleRepository(scope.tx);
        const roles = await repo.roles(scope.ctx);
        const kandidat: Kandidat[] = (await repo.daftar(scope.ctx))
            .filter((a) => a.statusAktif && a.jenis === jenis)
            .map((a) => ({ id: a.id, prioritas: a.prioritas, kondisi: a.kondisi, aturan: a, draf: false, versi: a.versi }));
        const { terpilih } = selectRule(kandidat, fakta);
        return this.langkahPratinjau(scope, repo, roles, terpilih?.aturan ?? this.aturanBawaan(roles, jenis), pemohonId);
    }

    /** SDD-APR-02 lapis makna: seluruh pelanggaran dikumpulkan lalu dilempar sekaligus (RE-08). */
    private async solusikan(scope: TransactionScope, repo: RuleRepository, def: DefinisiAturan, awalan = ""): Promise<AturanTersolusi> {
        const errors: PelanggaranAturan[] = [];
        let kondisi: AturanTersolusi["kondisi"] = {};
        try {
            kondisi = validateCondition(def.kondisi, def.jenis_pengajuan);
        } catch (e) {
            if (!(e instanceof DomainError) || e.kode !== "INVALID_RULE_DEFINITION") throw e;
            for (const p of (e.detail?.["errors"] as readonly PelanggaranAturan[] | undefined) ?? []) errors.push({ field: awalan + p.field, message: p.message });
        }
        const roles = new Map((await repo.roles(scope.ctx)).map((r) => [r.kode, r.id]));
        const idPengguna = [
            ...def.steps.flatMap((l) => [l.approver_user_id, l.escalate_to_user_id]),
            def.fallback_approver?.approver_user_id,
        ].filter((x): x is number => x !== undefined);
        const pengguna = await repo.pengguna(scope.ctx, [...new Set(idPengguna)]);
        const role = (kode: string, field: string): number | null => {
            const id = roles.get(kode);
            if (id === undefined) errors.push({ field: awalan + field, message: `Role \`${kode}\` tidak dikenal.` });
            return id ?? null;
        };
        const user = (id: number, field: string): number => {
            const u = pengguna.get(id);
            if (u === undefined || !u.aktif || !u.bolehMemutus) {
                errors.push({ field: awalan + field, message: "Pengguna harus ada, aktif, dan berwenang memutus persetujuan (approval.decide)." });
            }
            return id;
        };
        const langkah: LangkahAturan[] = def.steps.map((l, i) => ({
            urutan: l.order,
            approverType: l.approver_type,
            roleId: l.approver_type === "role" ? role(l.approver_role ?? "", `steps.${String(i)}.approver_role`) : null,
            userId: l.approver_type === "user" ? user(l.approver_user_id ?? 0, `steps.${String(i)}.approver_user_id`) : null,
            slaJam: l.sla_hours,
            onSlaBreach: l.on_sla_breach,
            eskalasiKe: l.escalate_to_user_id === undefined ? null : user(l.escalate_to_user_id, `steps.${String(i)}.escalate_to_user_id`),
        }));
        const f = def.fallback_approver;
        const fallback: Target | null =
            f === null
                ? null
                : f.approver_type === "role"
                  ? { approverType: "role", roleId: role(f.approver_role ?? "", "fallback_approver.approver_role"), userId: null }
                  : { approverType: "user", roleId: null, userId: user(f.approver_user_id ?? 0, "fallback_approver.approver_user_id") };
        if (errors.length > 0) throw new DomainError("INVALID_RULE_DEFINITION", PESAN_TIDAK_VALID, { errors });
        return { jenis: def.jenis_pengajuan, prioritas: def.prioritas, kondisi, langkah, fallback, terminal: def.terminal_on_exhausted_escalation };
    }

    private async muat(scope: TransactionScope, repo: RuleRepository, id: number): Promise<AturanRespons> {
        const [a] = await repo.daftar(scope.ctx, id);
        if (a === undefined) throw new NotFoundError("Aturan persetujuan tidak ditemukan.");
        return keRespons(a, await repo.roles(scope.ctx));
    }

    private async catat(scope: TransactionScope, repo: RuleRepository, id: number, aksi: string, sebelum: AturanRespons | undefined, keterangan?: string): Promise<AturanRespons> {
        const sesudah = await this.muat(scope, repo, id);
        await this.audit.write(scope, { modul: MODUL, aksi, entitas: "approval_rules", entitasId: id, nilaiSebelum: sebelum, nilaiSesudah: sesudah, ...(keterangan === undefined ? {} : { keterangan }) });
        return sesudah;
    }

    /** RE-06: aturan bawaan dalam bentuk tersolusi (role kode → id). */
    private aturanBawaan(roles: readonly Role[], jenis: JenisPengajuan): AturanTersolusi {
        const [l] = ATURAN_BAWAAN.steps;
        const roleId = roles.find((r) => r.kode === l.approver_role)?.id ?? null;
        return {
            jenis,
            prioritas: 0,
            kondisi: {},
            langkah: [{ urutan: l.order, approverType: "role", roleId, userId: null, slaJam: l.sla_hours, onSlaBreach: l.on_sla_breach, eskalasiKe: null }],
            fallback: null,
            terminal: ATURAN_BAWAAN.terminal_on_exhausted_escalation,
        };
    }

    /** Langkah yang akan terbentuk (SDD-02 §4.3–4.4): dilewati RE-10/RE-13 lalu fallback RE-11 bila habis. */
    private async langkahPratinjau(scope: TransactionScope, repo: RuleRepository, roles: readonly Role[], a: AturanTersolusi, pemohonId: number | undefined): Promise<LangkahPratinjau[]> {
        const ids = [...a.langkah.flatMap((l) => [l.userId, l.eskalasiKe]), a.fallback?.userId].filter((x): x is number => x !== null && x !== undefined);
        const pengguna = await repo.pengguna(scope.ctx, [...new Set(ids)]);
        const nama = (id: number | null): Nama | null => (id === null ? null : { id, nama: pengguna.get(id)?.nama ?? null });
        const bentuk = (t: Target, dasar: { urutan: number; sla_jam: number; on_sla_breach: "remind" | "escalate"; eskalasi_ke: Nama | null; fallback: boolean }, akan: string | null): LangkahPratinjau => {
            const r = t.roleId === null ? undefined : roles.find((x) => x.id === t.roleId);
            return { ...dasar, approver: { tipe: t.approverType, role: t.roleId === null ? null : { kode: r?.kode ?? null, nama: r?.nama ?? null }, user: nama(t.userId) }, akan_dilewati: akan };
        };
        const hasil: LangkahPratinjau[] = [];
        for (const l of a.langkah) {
            const akan =
                pemohonId === undefined
                    ? null
                    : await this.approval.pemutusSah(scope, l, pemohonId).then((h) => (h.pemutus.length > 0 ? null : ALASAN_DILEWATI[h.sebabKosong ?? "APPROVER_NONAKTIF"]));
            hasil.push(bentuk(l, { urutan: l.urutan, sla_jam: l.slaJam, on_sla_breach: l.onSlaBreach, eskalasi_ke: nama(l.eskalasiKe), fallback: false }, akan));
        }
        if (pemohonId !== undefined && hasil.every((l) => l.akan_dilewati !== null)) {
            // RE-11 / SDD-APR-13: fallback aturan, atau role Administrator; SLA = aturan bawaan.
            const target: Target = a.fallback ?? { approverType: "role", roleId: roles.find((r) => r.kode === KODE_ROLE_ADMINISTRATOR)?.id ?? null, userId: null };
            const [bawaan] = ATURAN_BAWAAN.steps;
            hasil.push(bentuk(target, { urutan: hasil.length + 1, sla_jam: bawaan.sla_hours, on_sla_breach: bawaan.on_sla_breach, eskalasi_ke: null, fallback: true }, null));
        }
        return hasil;
    }
}

function keRespons(a: AturanBaris, roles: readonly Role[]): AturanRespons {
    const kode = (id: number | null) => roles.find((r) => r.id === id)?.kode ?? "";
    return {
        id: a.id,
        jenis_pengajuan: a.jenis,
        prioritas: a.prioritas,
        status_aktif: a.statusAktif,
        versi: a.versi,
        kondisi: a.kondisi,
        steps: a.langkah.map((l) => ({
            order: l.urutan,
            approver_type: l.approverType,
            ...(l.approverType === "role" ? { approver_role: kode(l.roleId) } : { approver_user_id: l.userId }),
            sla_hours: l.slaJam,
            on_sla_breach: l.onSlaBreach,
            ...(l.eskalasiKe === null ? {} : { escalate_to_user_id: l.eskalasiKe }),
        })),
        fallback_approver:
            a.fallback === null
                ? null
                : a.fallback.approverType === "role"
                  ? { approver_type: "role", approver_role: kode(a.fallback.roleId) }
                  : { approver_type: "user", approver_user_id: a.fallback.userId },
        terminal_on_exhausted_escalation: a.terminal,
        created_at: a.createdAt,
        updated_at: a.updatedAt,
    };
}
