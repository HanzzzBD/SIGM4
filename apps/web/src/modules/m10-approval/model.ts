// Model formulir P-69 ↔ body Lampiran D.5. Kondisi disunting sebagai pohon dengan grup akar
// selalu ada (D.1); grup akar kosong dikirim `{}` = selalu cocok (BR-036). Galat memakai
// JALUR yang sama dengan `error.details[].field` server (`kondisi.conditions.0.op`,
// `steps.1.sla_hours`) sehingga galat server dan pemeriksaan klien jatuh pada node yang sama (RE-08).

import { FIELD_DSL, OPERATOR_PER_TIPE } from "@sigm4/schemas";
import type { JenisPengajuan, Operator } from "@sigm4/schemas";
import { ApiError } from "../../shared/api";
import type { ApproverD5, AturanTersimpan, DefinisiAturan, PerilakuSla, Terminal, TipeApprover } from "./api";

export interface NodePredikat {
    readonly jenis: "predikat";
    readonly kunci: string;
    readonly field: string;
    readonly op: Operator;
    readonly value?: unknown;
}

export interface NodeGrup {
    readonly jenis: "grup";
    readonly kunci: string;
    readonly operator: "AND" | "OR";
    readonly anak: readonly NodeKondisi[];
}

export type NodeKondisi = NodePredikat | NodeGrup;

export interface ModelApprover {
    readonly tipe: TipeApprover;
    readonly role: string;
    readonly user: number | null;
}

export interface ModelLangkah {
    readonly kunci: string;
    readonly approver: ModelApprover;
    readonly sla: string;
    readonly perilaku: PerilakuSla;
    readonly eskalasi: number | null;
}

export interface ModelAturan {
    readonly jenis: JenisPengajuan;
    readonly prioritas: string;
    readonly kondisi: NodeGrup;
    readonly langkah: readonly ModelLangkah[];
    /** `null` = bawaan Administrator (RE-11, UXD-09). */
    readonly fallback: ModelApprover | null;
    readonly terminal: Terminal;
}

/** Jalur → pesan galat. */
export type PetaGalat = Readonly<Record<string, string>>;

let urut = 0;
export const kunciBaru = (): string => `n${String(++urut)}`;

export const grupKosong = (operator: "AND" | "OR" = "AND"): NodeGrup => ({ jenis: "grup", kunci: kunciBaru(), operator, anak: [] });
export const approverKosong = (): ModelApprover => ({ tipe: "role", role: "", user: null });
export const langkahBaru = (): ModelLangkah => ({ kunci: kunciBaru(), approver: approverKosong(), sla: "24", perilaku: "remind", eskalasi: null });

/** Operator pertama yang sah bagi field (D.3). */
export function operatorAwal(field: string): Operator {
    const def = FIELD_DSL[field];
    return def === undefined ? "eq" : (OPERATOR_PER_TIPE[def.tipe][0] ?? "eq");
}

function keNode(k: unknown): NodeKondisi | null {
    if (typeof k !== "object" || k === null) return null;
    const o = k as Record<string, unknown>;
    if (Array.isArray(o["conditions"])) {
        return { jenis: "grup", kunci: kunciBaru(), operator: o["operator"] === "OR" ? "OR" : "AND", anak: o["conditions"].map(keNode).filter((n): n is NodeKondisi => n !== null) };
    }
    if (typeof o["field"] === "string") {
        return { jenis: "predikat", kunci: kunciBaru(), field: o["field"], op: o["op"] as Operator, ...("value" in o ? { value: o["value"] } : {}) };
    }
    return null;
}

/** D.1 → pohon: `{}` → grup AND kosong; predikat tunggal dibungkus grup AND. */
export function keModelKondisi(kondisi: unknown): NodeGrup {
    const n = keNode(kondisi);
    if (n === null) return grupKosong();
    return n.jenis === "grup" ? n : { ...grupKosong(), anak: [n] };
}

function keD1(n: NodeKondisi): unknown {
    if (n.jenis === "grup") return { operator: n.operator, conditions: n.anak.map(keD1) };
    return n.value === undefined ? { field: n.field, op: n.op } : { field: n.field, op: n.op, value: n.value };
}

const keApprover = (a: ApproverD5 | null | undefined): ModelApprover =>
    a === null || a === undefined ? approverKosong() : { tipe: a.approver_type, role: a.approver_role ?? "", user: a.approver_user_id ?? null };

export function modelDari(a: AturanTersimpan | null, jenis: JenisPengajuan = "RESERVASI_RUANGAN"): ModelAturan {
    if (a === null) return { jenis, prioritas: "10", kondisi: grupKosong(), langkah: [langkahBaru()], fallback: null, terminal: "hold_and_alert" };
    return {
        jenis: a.jenis_pengajuan,
        prioritas: String(a.prioritas),
        kondisi: keModelKondisi(a.kondisi),
        langkah: a.steps.map((l) => ({ kunci: kunciBaru(), approver: keApprover(l), sla: String(l.sla_hours), perilaku: l.on_sla_breach, eskalasi: l.escalate_to_user_id ?? null })),
        fallback: a.fallback_approver === null ? null : keApprover(a.fallback_approver),
        terminal: a.terminal_on_exhausted_escalation,
    };
}

const approverD5 = (a: ModelApprover): ApproverD5 =>
    a.tipe === "role" ? { approver_type: "role", approver_role: a.role } : { approver_type: "user", ...(a.user === null ? {} : { approver_user_id: a.user }) };

export function keDefinisi(m: ModelAturan): DefinisiAturan {
    return {
        jenis_pengajuan: m.jenis,
        prioritas: Number(m.prioritas),
        kondisi: m.kondisi.anak.length === 0 ? {} : keD1(m.kondisi),
        steps: m.langkah.map((l, i) => ({
            order: i + 1,
            ...approverD5(l.approver),
            sla_hours: Number(l.sla),
            on_sla_breach: l.perilaku,
            ...(l.perilaku === "escalate" && l.eskalasi !== null ? { escalate_to_user_id: l.eskalasi } : {}),
        })),
        fallback_approver: m.fallback === null ? null : approverD5(m.fallback),
        terminal_on_exhausted_escalation: m.terminal,
    };
}

const bulat = (s: string, min: number, max: number): boolean => /^\d+$/.test(s.trim()) && Number(s) >= min && Number(s) <= max;

/**
 * Pelanggaran STRUKTUR D.5 yang dapat diketahui tanpa server — tanpanya server menjawab 400
 * generik tanpa node. Makna kondisi (D.2/D.3) tetap diputus server (RE-08).
 */
export function periksaModel(m: ModelAturan): PetaGalat {
    const g: Record<string, string> = {};
    if (!bulat(m.prioritas, 0, 1_000_000)) g["prioritas"] = "Prioritas berupa bilangan bulat 0–1.000.000.";
    if (m.langkah.length === 0) g["steps"] = "Aturan wajib memiliki sedikitnya satu langkah.";
    const approver = (a: ModelApprover, awal: string) => {
        if (a.tipe === "role" && a.role === "") g[`${awal}approver_role`] = "Pilih role approver.";
        if (a.tipe === "user" && a.user === null) g[`${awal}approver_user_id`] = "Pilih pengguna approver.";
    };
    m.langkah.forEach((l, i) => {
        approver(l.approver, `steps.${String(i)}.`);
        if (!bulat(l.sla, 1, 720)) g[`steps.${String(i)}.sla_hours`] = "SLA berupa bilangan bulat 1–720 jam.";
        if (l.perilaku === "escalate" && l.eskalasi === null) g[`steps.${String(i)}.escalate_to_user_id`] = "Pilih pengguna tujuan eskalasi.";
    });
    if (m.fallback !== null) approver(m.fallback, "fallback_approver.");
    return g;
}

/** `error.details` 422 → peta jalur; `awalan` pratinjau (`aturan_draf.`) dilepas. `null` = bukan galat definisi. */
export function galatDefinisi(g: unknown): PetaGalat | null {
    if (!(g instanceof ApiError) || g.kode !== "INVALID_RULE_DEFINITION") return null;
    const peta: Record<string, string> = {};
    for (const d of g.details) {
        const jalur = d.field.replace(/^aturan_draf\./, "");
        peta[jalur] = peta[jalur] === undefined ? d.message : `${peta[jalur]} ${d.message}`;
    }
    return peta;
}

/** Label kamus D.2 — diturunkan dari kolom "Sumber nilai" (UX-06: tanpa istilah teknis). */
export const LABEL_FIELD: Readonly<Record<string, string>> = {
    requester_role: "Role pemohon",
    requester_id: "ID pengguna pemohon",
    requester_has_overdue: "Pemohon memiliki peminjaman terlambat",
    total_value: "Total nilai (Rp)",
    item_count: "Jumlah unit/item",
    material_category_id: "Kategori bahan (ID)",
    material_qty_total: "Total kuantitas bahan",
    material_value_total: "Perkiraan nilai total bahan (Rp)",
    duration_days: "Durasi (hari)",
    duration_hours: "Durasi (jam)",
    asset_category_id: "Kategori aset (ID)",
    asset_value_max: "Nilai perolehan tertinggi (Rp)",
    room_type: "Jenis ruangan",
    room_id: "Ruangan (ID)",
    participant_count: "Jumlah peserta",
    is_recurring: "Pengajuan berulang",
    is_outside_operating_hours: "Di luar jam operasional",
    lead_time_hours: "Jarak pengajuan ke waktu mulai (jam)",
    disposal_reason: "Alasan penghapusan",
    priority: "Prioritas usulan",
};

/** D.3 kolom "Semantik". */
export const LABEL_OPERATOR: Readonly<Record<Operator, string>> = {
    eq: "sama dengan",
    neq: "tidak sama dengan",
    gt: "lebih dari",
    gte: "paling sedikit",
    lt: "kurang dari",
    lte: "paling banyak",
    in: "salah satu dari",
    not_in: "bukan salah satu dari",
    between: "antara (inklusif)",
    is_true: "ya",
    is_false: "tidak",
};

export const LABEL_PERILAKU_SLA: Readonly<Record<PerilakuSla, string>> = { remind: "Kirim pengingat", escalate: "Eskalasi ke pengguna lain" };

export const LABEL_TERMINAL: Readonly<Record<Terminal, string>> = {
    hold_and_alert: "Tahan dan beri peringatan Administrator (bawaan)",
    auto_reject: "Tolak otomatis",
};
