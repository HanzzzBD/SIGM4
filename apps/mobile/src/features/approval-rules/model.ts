// Approval rule mobile (FR-10.1, Lampiran D.1–D.5, RE-02…RE-13; MS-83, MS-84) — kontrak sama dengan web P-68/P-69.
// Kondisi disunting sebagai pohon dengan grup akar selalu ada; grup akar kosong dikirim `{}` = selalu cocok (BR-036).
// Galat memakai JALUR yang sama dengan `error.details[].field` server sehingga jatuh pada node yang sama (RE-08).
// Evaluasi dan validasi makna tetap milik server (SDD-APR-10); klien hanya memeriksa struktur.
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { FIELD_DSL, JENIS_PENGAJUAN, OPERATOR_PER_TIPE } from "@sigm4/schemas";
import type { JenisPengajuan, Operator } from "@sigm4/schemas";
import { MobileApiError } from "../../shared/api/client";

export type ApproverType = "role" | "user";
export type Breach = "remind" | "escalate";
/** BR-039a: `auto_approve` tidak pernah ada di klien. */
export type Terminal = "hold_and_alert" | "auto_reject";
export interface ApproverD5 { approver_type: ApproverType; approver_role?: string | undefined; approver_user_id?: number | undefined }
export interface Definition { jenis_pengajuan: JenisPengajuan; prioritas: number; kondisi: unknown; steps: (ApproverD5 & { order: number; sla_hours: number; on_sla_breach: Breach; escalate_to_user_id?: number | undefined })[]; fallback_approver: ApproverD5 | null; terminal_on_exhausted_escalation: Terminal }
const Approver = z.object({ approver_type: z.enum(["role", "user"]), approver_role: z.string().optional(), approver_user_id: z.number().optional() });
const Rule = z.object({ id: z.number(), jenis_pengajuan: z.enum(JENIS_PENGAJUAN), prioritas: z.number(), kondisi: z.unknown(), steps: z.array(Approver.extend({ order: z.number(), sla_hours: z.number(), on_sla_breach: z.enum(["remind", "escalate"]), escalate_to_user_id: z.number().optional() })), fallback_approver: Approver.nullable(), terminal_on_exhausted_escalation: z.enum(["hold_and_alert", "auto_reject"]), status_aktif: z.boolean(), versi: z.number(), updated_at: z.string() });
export type SavedRule = z.infer<typeof Rule>;
const Named = z.object({ id: z.number(), nama: z.string().nullable() }).nullable();
const Preview = z.object({ terpilih: z.object({ rule_id: z.number().nullable(), draf: z.boolean(), bawaan: z.boolean(), prioritas: z.number().nullable(), versi: z.number().nullable() }), cocok: z.array(z.object({ rule_id: z.number().nullable(), draf: z.boolean(), prioritas: z.number() })), langkah: z.array(z.object({ urutan: z.number(), approver: z.object({ tipe: z.enum(["role", "user"]), role: z.object({ kode: z.string().nullable(), nama: z.string().nullable() }).nullable(), user: Named }), sla_jam: z.number(), on_sla_breach: z.enum(["remind", "escalate"]), eskalasi_ke: Named, fallback: z.boolean(), akan_dilewati: z.string().nullable() })) });
export type PreviewResult = z.infer<typeof Preview>;
export const loadRules = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(Rule) }).parse((await api.get("/approval-rules", { signal })).data).data;
export const loadApproverRoles = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(z.object({ id: z.string(), kode: z.string(), nama: z.string(), permissions: z.array(z.object({ kode: z.string() })) })) }).parse((await api.get("/roles", { signal })).data).data;
export const loadRoleUsers = async (api: AxiosInstance, roleId: string, signal: AbortSignal) => z.object({ data: z.array(z.object({ id: z.string(), nama: z.string(), role_id: z.string(), status: z.string() })) }).parse((await api.get("/users", { params: { "filter[role_id]": roleId, "filter[status]": "AKTIF", per_page: 100 }, signal })).data).data;
export const loadUserBrief = async (api: AxiosInstance, id: number, signal: AbortSignal) => z.object({ data: z.object({ id: z.string(), nama: z.string(), role_id: z.string(), status: z.string() }) }).parse((await api.get(`/users/${id}`, { signal })).data).data;
export const saveRule = async (api: AxiosInstance, id: number | null, d: Definition) => z.object({ data: Rule }).parse((await (id === null ? api.post("/approval-rules", d) : api.put(`/approval-rules/${id}`, d))).data).data;
/** FR-10.1 A4: menonaktifkan wajib beralasan (UX-04). */
export const setRuleStatus = async (api: AxiosInstance, id: number, active: boolean, reason?: string) => z.object({ data: Rule }).parse((await api.patch(`/approval-rules/${id}/status`, { status_aktif: active, ...(reason === undefined ? {} : { alasan: reason }) })).data).data;
/** RE-07: evaluator dan pemilih yang sama dengan pengajuan sungguhan; tanpa efek samping. */
export const runPreview = async (api: AxiosInstance, body: unknown) => z.object({ data: Preview }).parse((await api.post("/approval-rules/preview", body)).data).data;

export interface Predicate { kind: "predikat"; key: string; field: string; op: Operator; value?: unknown }
export interface Group { kind: "grup"; key: string; operator: "AND" | "OR"; children: Node[] }
export type Node = Predicate | Group;
export interface ApproverModel { type: ApproverType; role: string; user: number | null }
export interface StepModel { key: string; approver: ApproverModel; sla: string; breach: Breach; escalate: number | null }
export interface RuleModel { jenis: JenisPengajuan; prioritas: string; kondisi: Group; steps: StepModel[]; fallback: ApproverModel | null; terminal: Terminal }
export type Errors = Readonly<Record<string, string>>;

let seq = 0;
export const newKey = () => `n${++seq}`;
export const emptyGroup = (operator: "AND" | "OR" = "AND"): Group => ({ kind: "grup", key: newKey(), operator, children: [] });
export const emptyApprover = (): ApproverModel => ({ type: "role", role: "", user: null });
export const newStep = (): StepModel => ({ key: newKey(), approver: emptyApprover(), sla: "24", breach: "remind", escalate: null });
/** Operator pertama yang sah bagi field (D.3). */
export const firstOperator = (field: string): Operator => { const d = FIELD_DSL[field]; return d === undefined ? "eq" : OPERATOR_PER_TIPE[d.tipe][0] ?? "eq"; };
export const newPredicate = (field: string): Predicate => ({ kind: "predikat", key: newKey(), field, op: firstOperator(field) });

function toNode(k: unknown): Node | null {
    if (typeof k !== "object" || k === null) return null;
    const o = k as Record<string, unknown>;
    if (Array.isArray(o["conditions"])) return { kind: "grup", key: newKey(), operator: o["operator"] === "OR" ? "OR" : "AND", children: o["conditions"].map(toNode).filter((n): n is Node => n !== null) };
    return typeof o["field"] === "string" ? { kind: "predikat", key: newKey(), field: o["field"], op: o["op"] as Operator, ...("value" in o ? { value: o["value"] } : {}) } : null;
}
/** D.1 → pohon: `{}` → grup AND kosong; predikat tunggal dibungkus grup AND. */
export function toTree(kondisi: unknown): Group { const n = toNode(kondisi); return n === null ? emptyGroup() : n.kind === "grup" ? n : { ...emptyGroup(), children: [n] }; }
function toD1(n: Node): unknown { return n.kind === "grup" ? { operator: n.operator, conditions: n.children.map(toD1) } : n.value === undefined ? { field: n.field, op: n.op } : { field: n.field, op: n.op, value: n.value }; }
const toApprover = (a: ApproverD5 | null | undefined): ApproverModel => a ? { type: a.approver_type, role: a.approver_role ?? "", user: a.approver_user_id ?? null } : emptyApprover();
export function modelFrom(a: SavedRule | null, jenis: JenisPengajuan = "RESERVASI_RUANGAN"): RuleModel {
    if (!a) return { jenis, prioritas: "10", kondisi: emptyGroup(), steps: [newStep()], fallback: null, terminal: "hold_and_alert" };
    return { jenis: a.jenis_pengajuan, prioritas: String(a.prioritas), kondisi: toTree(a.kondisi), steps: [...a.steps].sort((x, y) => x.order - y.order).map((l) => ({ key: newKey(), approver: toApprover(l), sla: String(l.sla_hours), breach: l.on_sla_breach, escalate: l.escalate_to_user_id ?? null })), fallback: a.fallback_approver === null ? null : toApprover(a.fallback_approver), terminal: a.terminal_on_exhausted_escalation };
}
const approverD5 = (a: ApproverModel): ApproverD5 => a.type === "role" ? { approver_type: "role", approver_role: a.role } : { approver_type: "user", ...(a.user === null ? {} : { approver_user_id: a.user }) };
export function toDefinition(m: RuleModel): Definition {
    return { jenis_pengajuan: m.jenis, prioritas: Number(m.prioritas), kondisi: m.kondisi.children.length === 0 ? {} : toD1(m.kondisi),
        steps: m.steps.map((l, i) => ({ order: i + 1, ...approverD5(l.approver), sla_hours: Number(l.sla), on_sla_breach: l.breach, ...(l.breach === "escalate" && l.escalate !== null ? { escalate_to_user_id: l.escalate } : {}) })),
        fallback_approver: m.fallback === null ? null : approverD5(m.fallback), terminal_on_exhausted_escalation: m.terminal };
}
const int = (s: string, min: number, max: number) => /^\d+$/.test(s.trim()) && Number(s) >= min && Number(s) <= max;
/** Pelanggaran STRUKTUR D.5 yang dapat diketahui tanpa server; makna kondisi tetap diputus server (RE-08). */
export function checkModel(m: RuleModel): Errors {
    const g: Record<string, string> = {};
    if (!int(m.prioritas, 0, 1_000_000)) g["prioritas"] = "Prioritas berupa bilangan bulat 0–1.000.000.";
    if (m.steps.length === 0) g["steps"] = "Aturan wajib memiliki sedikitnya satu langkah.";
    const approver = (a: ApproverModel, at: string) => { if (a.type === "role" && !a.role) g[`${at}approver_role`] = "Pilih role approver."; if (a.type === "user" && a.user === null) g[`${at}approver_user_id`] = "Pilih pengguna approver."; };
    m.steps.forEach((l, i) => { approver(l.approver, `steps.${i}.`); if (!int(l.sla, 1, 720)) g[`steps.${i}.sla_hours`] = "SLA berupa bilangan bulat 1–720 jam."; if (l.breach === "escalate" && l.escalate === null) g[`steps.${i}.escalate_to_user_id`] = "Pilih pengguna tujuan eskalasi."; });
    if (m.fallback !== null) approver(m.fallback, "fallback_approver.");
    return g;
}
/** 422 INVALID_RULE_DEFINITION → peta jalur; awalan pratinjau `aturan_draf.` dilepas. `null` = bukan galat definisi. */
export function definitionErrors(e: unknown): Errors | null {
    if (!(e instanceof MobileApiError) || e.code !== "INVALID_RULE_DEFINITION") return null;
    const out: Record<string, string> = {};
    for (const d of e.details) { const at = d.field.replace(/^aturan_draf\./, ""); out[at] = out[at] === undefined ? d.message : `${out[at]} ${d.message}`; }
    return out;
}
/** Jumlah predikat pada pohon D.1; `{}` = 0 (selalu cocok). */
export function conditionCount(k: unknown): number {
    if (typeof k !== "object" || k === null) return 0;
    const o = k as { conditions?: unknown; field?: unknown };
    return Array.isArray(o.conditions) ? o.conditions.reduce((n: number, a) => n + conditionCount(a), 0) : typeof o.field === "string" ? 1 : 0;
}
/** RE-04 per jenis pengajuan: prioritas terbesar, seri → id terkecil. */
export const sortRules = (a: readonly SavedRule[]) => [...a].sort((x, y) => JENIS_PENGAJUAN.indexOf(x.jenis_pengajuan) - JENIS_PENGAJUAN.indexOf(y.jenis_pengajuan) || y.prioritas - x.prioritas || x.id - y.id);
/** Id pengguna yang dipakai sebagai approver/eskalasi/cadangan — diperiksa statusnya (RE-13). */
export const userIds = (m: RuleModel) => [...new Set([...m.steps.flatMap((l) => [l.approver.type === "user" ? l.approver.user : null, l.breach === "escalate" ? l.escalate : null]), m.fallback?.type === "user" ? m.fallback.user : null].filter((x): x is number => x !== null))];
export const swap = <T>(list: readonly T[], i: number, j: number): T[] => { const n = [...list]; [n[i], n[j]] = [n[j] as T, n[i] as T]; return n; };

export const FIELD_LABEL: Readonly<Record<string, string>> = { requester_role: "Role pemohon", requester_id: "Pemohon", requester_has_overdue: "Pemohon memiliki peminjaman terlambat", total_value: "Total nilai (Rp)", item_count: "Jumlah unit/item", material_category_id: "Kategori bahan", material_qty_total: "Total kuantitas bahan", material_value_total: "Perkiraan nilai total bahan (Rp)", duration_days: "Durasi (hari)", duration_hours: "Durasi (jam)", asset_category_id: "Kategori aset", asset_value_max: "Nilai perolehan tertinggi (Rp)", room_type: "Jenis ruangan", room_id: "Ruangan", participant_count: "Jumlah peserta", is_recurring: "Pengajuan berulang", is_outside_operating_hours: "Di luar jam operasional", lead_time_hours: "Jarak pengajuan ke waktu mulai (jam)", disposal_reason: "Alasan penghapusan", priority: "Prioritas usulan" };
export const OPERATOR_LABEL: Readonly<Record<Operator, string>> = { eq: "sama dengan", neq: "tidak sama dengan", gt: "lebih dari", gte: "paling sedikit", lt: "kurang dari", lte: "paling banyak", in: "salah satu dari", not_in: "bukan salah satu dari", between: "antara (inklusif)", is_true: "ya", is_false: "tidak" };
export const BREACH_LABEL: Readonly<Record<Breach, string>> = { remind: "Kirim pengingat", escalate: "Eskalasi ke pengguna lain" };
export const TERMINAL_LABEL: Readonly<Record<Terminal, string>> = { hold_and_alert: "Tahan dan beri peringatan Administrator (bawaan)", auto_reject: "Tolak otomatis" };
