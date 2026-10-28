// Activity Log mobile (FR-18.x; MS-88, MS-89) — kontrak sama dengan web P-73/P-74. Membaca detail entri tercatat
// `ACTIVITY_LOG_VIEWED` di server (m18 §11); klien tidak menulis log sendiri.
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { LABEL_ALASAN_PENGHAPUSAN, LABEL_JENIS_PENGAJUAN, LABEL_JENIS_RUANGAN, LABEL_KONDISI_ASET, LABEL_PRIORITAS, LABEL_STATUS_ASET, LABEL_STATUS_INSTANCE_APPROVAL } from "@sigm4/schemas";

const Entry = z.object({ id: z.string(), waktu: z.string(), user_id: z.string().nullable(), user_nama: z.string().nullable(), role: z.string().nullable(), ip: z.string().nullable(), user_agent: z.string().nullable(), modul: z.string(), aksi: z.string(), entitas: z.string().nullable(), entitas_id: z.string().nullable(), nilai_sebelum: z.unknown(), nilai_sesudah: z.unknown(), keterangan: z.string().nullable(), hasil: z.enum(["SUKSES", "GAGAL"]), request_id: z.string().nullable() });
export type Entry = z.infer<typeof Entry>;
const Meta = z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() });
export interface LogFilter { dari?: string | undefined; sampai?: string | undefined; user?: string | undefined; modul?: string | undefined; aksi?: string | undefined; entitas?: string | undefined; entitas_id?: string | undefined }
/** Tanggal WIB inklusif → rentang waktu ISO; filter dikirim sebagai `filter[...]`. */
export function filterParams(f: LogFilter): Record<string, string> {
    const p: Record<string, string> = {};
    if (f.dari) p["filter[dari]"] = `${f.dari}T00:00:00.000+07:00`;
    if (f.sampai) p["filter[sampai]"] = `${f.sampai}T23:59:59.999+07:00`;
    for (const [k, v] of [["user_id", f.user], ["modul", f.modul], ["aksi", f.aksi], ["entitas", f.entitas], ["entitas_id", f.entitas_id]] as const) if (v?.trim()) p[`filter[${k}]`] = v.trim();
    return p;
}
export const loadLogs = async (api: AxiosInstance, f: LogFilter, page: number, signal: AbortSignal) => z.object({ data: z.array(Entry), meta: Meta }).parse((await api.get("/activity-logs", { params: { ...filterParams(f), page, per_page: 25 }, signal })).data);
export const loadLog = async (api: AxiosInstance, id: string, signal: AbortSignal) => z.object({ data: Entry }).parse((await api.get(`/activity-logs/${id}`, { signal })).data).data;
export const loadLogUsers = async (api: AxiosInstance, signal: AbortSignal) => { const out: { id: string; nama: string }[] = []; for (let page = 1; ; page++) { const r = z.object({ data: z.array(z.object({ id: z.string(), nama: z.string() })), meta: Meta }).parse((await api.get("/users", { params: { page, per_page: 100 }, signal })).data); out.push(...r.data); if (page >= r.meta.total_pages) return out; } };

const TECHNICAL: Readonly<Record<string, string>> = { SYSTEM: "Sistem", "SYSTEM:CLI": "Sistem (CLI)" };
export const actor = (e: Pick<Entry, "user_nama" | "user_id">) => e.user_nama !== null ? TECHNICAL[e.user_nama] ?? e.user_nama : e.user_id === null ? "Anonim (tanpa sesi)" : `Pengguna #${e.user_id}`;
const ABBR: Readonly<Record<string, string>> = { id: "ID", ip: "IP", npsn: "NPSN", nip_nis: "NIP/NIS", url: "URL", uuid: "UUID", qr: "QR", sla: "SLA" };
/** `tanggal_jatuh_tempo` → "Tanggal jatuh tempo"; `role_id` → "Role (ID)". */
export function fieldLabel(key: string): string {
    const k = key.trim();
    if (ABBR[k] !== undefined) return ABBR[k];
    if (k.endsWith("_id") && k.length > 3) return `${fieldLabel(k.slice(0, -3))} (ID)`;
    const text = k.split(/[_\s]+/).filter(Boolean).map((w) => ABBR[w] ?? w.toLowerCase()).join(" ");
    return text === "" ? key : text.charAt(0).toUpperCase() + text.slice(1);
}
function enumMap(key: string, entity: string | null): Readonly<Record<string, string>> | undefined {
    if (/(^|_)kondisi($|_)/.test(key)) return LABEL_KONDISI_ASET;
    if (key === "jenis_pengajuan") return LABEL_JENIS_PENGAJUAN;
    if (key === "prioritas") return LABEL_PRIORITAS;
    if (key === "alasan_penghapusan") return LABEL_ALASAN_PENGHAPUSAN;
    if (key === "status" && entity === "assets") return LABEL_STATUS_ASET;
    if (key === "status" && entity === "approval_instances") return LABEL_STATUS_INSTANCE_APPROVAL;
    return key === "jenis" && entity === "rooms" ? LABEL_JENIS_RUANGAN : undefined;
}
/** Kode enum tidak pernah tampil bila labelnya ada (SDD-FE-08). */
export function valueLabel(key: string, value: unknown, entity: string | null): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Ya" : "Tidak";
    if (typeof value === "string") return enumMap(key, entity)?.[value] ?? value;
    return typeof value === "number" ? String(value) : JSON.stringify(value);
}
/** Kesetaraan struktural; urutan kunci objek diabaikan. */
export function same(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return (a ?? null) === (b ?? null);
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
const plain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const coded = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every((x) => plain(x) && typeof x["kode"] === "string");
export type CodeStatus = "DITAMBAHKAN" | "DICABUT" | "DIUBAH" | "TETAP";
export const CODE_STATUS: Readonly<Record<CodeStatus, string>> = { DITAMBAHKAN: "Ditambahkan", DICABUT: "Dicabut", DIUBAH: "Diubah", TETAP: "Tetap" };
export type Comparison = { kind: "empty" } | { kind: "object"; rows: { key: string; label: string; before: unknown; after: unknown; changed: boolean }[] } | { kind: "code"; rows: { code: string; before: Record<string, unknown> | undefined; after: Record<string, unknown> | undefined; status: CodeStatus }[] } | { kind: "value"; before: unknown; after: unknown; changed: boolean };
/** Sebelum/sesudah: objek per kunci, larik berkode (mis. permission) per kode, selain itu nilai utuh — sama dengan web P-74. */
export function compare(before: unknown, after: unknown): Comparison {
    const has = (v: unknown) => v !== null && v !== undefined;
    if (!has(before) && !has(after)) return { kind: "empty" };
    if ((plain(before) || !has(before)) && (plain(after) || !has(after))) {
        const a = plain(before) ? before : {}, b = plain(after) ? after : {};
        return { kind: "object", rows: [...Object.keys(a), ...Object.keys(b).filter((k) => !(k in a))].map((k) => ({ key: k, label: fieldLabel(k), before: a[k], after: b[k], changed: !same(a[k], b[k]) })) };
    }
    if ((coded(before) || !has(before)) && (coded(after) || !has(after))) {
        const a = new Map((coded(before) ? before : []).map((x) => [x["kode"] as string, x])), b = new Map((coded(after) ? after : []).map((x) => [x["kode"] as string, x]));
        return { kind: "code", rows: [...new Set([...a.keys(), ...b.keys()])].sort().map((code) => { const x = a.get(code), y = b.get(code); return { code, before: x, after: y, status: x === undefined ? "DITAMBAHKAN" : y === undefined ? "DICABUT" : same(x, y) ? "TETAP" : "DIUBAH" }; }) };
    }
    return { kind: "value", before, after, changed: !same(before, after) };
}
