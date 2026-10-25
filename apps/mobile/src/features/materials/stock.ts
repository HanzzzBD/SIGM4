// Manajemen bahan mobile (FR-22.1…22.3, 22.5; MS-40…43, penyerahan MS-58) — kontrak dan aturan sama dengan web
// P-80…P-83/P-87. Setiap perubahan saldo lewat ledger server; ponsel tidak menyunting saldo langsung.
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { MaterialAdjustmentBodySchema, MaterialBodySchema, MaterialCategoriesResponseSchema, MaterialCategoryBodySchema, MaterialDetailResponseSchema, MaterialIssueBodySchema, MaterialListResponseSchema, MaterialOperationResponseSchema, MaterialPatchSchema, MaterialReceiptBodySchema, MaterialReceiptHistoryResponseSchema, MaterialRequestDetailResponseSchema, MaterialTransactionsResponseSchema } from "@sigm4/schemas";
import type { MaterialDetail, MaterialRequestDetail } from "@sigm4/schemas";
import type { StatusTone } from "../../shared/ui/status";

const headers = (key: string) => ({ headers: { "Idempotency-Key": key } });
export const loadMaterials = async (api: AxiosInstance, q: { q?: string; category_id?: string; stok?: "MENIPIS"; status?: "AKTIF" | "NONAKTIF"; page: number }, signal: AbortSignal) => MaterialListResponseSchema.parse((await api.get("/materials", { params: { ...q, q: q.q || undefined, category_id: q.category_id || undefined, per_page: 20 }, signal })).data);
export const loadCategories = async (api: AxiosInstance, signal: AbortSignal) => MaterialCategoriesResponseSchema.parse((await api.get("/material-categories", { signal })).data).data;
export const saveMaterial = async (api: AxiosInstance, id: string | undefined, body: unknown, key: string) => MaterialDetailResponseSchema.parse((await api[id ? "patch" : "post"](id ? `/materials/${id}` : "/materials", body, headers(key))).data).data;
export const loadTransactions = async (api: AxiosInstance, id: string, page: number, room: string, signal: AbortSignal) => MaterialTransactionsResponseSchema.parse((await api.get(`/materials/${id}/transactions`, { params: { page, per_page: 20, room_id: room || undefined }, signal })).data);
export const loadReceipts = async (api: AxiosInstance, id: string, signal: AbortSignal) => MaterialReceiptHistoryResponseSchema.parse((await api.get(`/materials/${id}/receipts`, { params: { page: 1, per_page: 20 }, signal })).data);
export const operate = async (api: AxiosInstance, id: string, mode: "receipts" | "adjustments", body: unknown, key: string) => MaterialOperationResponseSchema.parse((await api.post(`/materials/${id}/${mode}`, body, headers(key))).data).data;
const Threshold = z.object({ data: z.object({ default_qty: z.number().nullable(), batas_khusus: z.number().nullable(), batas_efektif: z.number().nullable() }) });
export const loadThreshold = async (api: AxiosInstance, id: string, signal: AbortSignal) => Threshold.parse((await api.get(`/materials/${id}/request-threshold`, { signal })).data).data;
export const setThreshold = async (api: AxiosInstance, id: string, batas: number | null, key: string) => Threshold.parse((batas === null ? await api.delete(`/materials/${id}/request-threshold`, { data: {}, ...headers(key) }) : await api.put(`/materials/${id}/request-threshold`, { batas }, headers(key))).data).data;
export const saveCategory = async (api: AxiosInstance, id: string | null, body: unknown, key: string) => { await api.request({ url: id ? `/material-categories/${id}` : "/material-categories", method: id ? "PUT" : "POST", data: body, ...headers(key) }); };
export const deleteCategory = async (api: AxiosInstance, id: string, key: string) => { await api.delete(`/material-categories/${id}`, { data: {}, ...headers(key) }); };
export const issueRequest = async (api: AxiosInstance, id: string, body: unknown, key: string) => MaterialRequestDetailResponseSchema.parse((await api.post(`/material-requests/${id}/issue`, body, headers(key))).data).data;
export const closeRequest = async (api: AxiosInstance, id: string, alasan: string, key: string) => MaterialRequestDetailResponseSchema.parse((await api.post(`/material-requests/${id}/close`, { alasan }, headers(key))).data).data;

export const TX_LABEL = { PENERIMAAN: "Penerimaan", PENGELUARAN: "Penyerahan", PENYESUAIAN: "Penyesuaian", OPNAME: "Opname" } as const;
export const TX_TONE: Readonly<Record<keyof typeof TX_LABEL, StatusTone>> = { PENERIMAAN: "success", PENGELUARAN: "info", PENYESUAIAN: "warning", OPNAME: "pending" };

export interface MaterialForm { nama: string; category: string; unit: string; minimum: string; room: string; note: string; active: boolean }
export const formFromMaterial = (m: MaterialDetail): MaterialForm => ({ nama: m.nama, category: m.kategori.id, unit: m.satuan.id, minimum: String(m.stok_minimum), room: m.lokasi_bawaan.id, note: m.keterangan ?? "", active: m.status === "AKTIF" });
/** FR-22.1: master bahan tanpa saldo; satuan terkunci setelah ada transaksi (tidak dikirim). */
export function materialBody(f: MaterialForm, edit: { lockedUnit: boolean } | null): { body: unknown } | { error: string } {
    const body = { nama: f.nama, material_category_id: Number(f.category), ...(edit?.lockedUnit ? {} : { satuan_id: Number(f.unit) }), stok_minimum: Number(f.minimum), room_id_default: Number(f.room), keterangan: f.note.trim() || null, status: f.active ? "AKTIF" : "NONAKTIF" };
    const parsed = edit ? MaterialPatchSchema.safeParse(body) : MaterialBodySchema.safeParse(body);
    return parsed.success ? { body: parsed.data } : { error: parsed.error.issues[0]?.message ?? "Lengkapi data bahan." };
}
/** FR-22.2 penerimaan langsung berdokumen; FR-22.3 penyesuaian beralasan — dicek skema bersama. */
export function receiptBody(i: { room: string; qty: string; date: string; doc: string; note: string; files: readonly { file_id: number; nama_berkas: string; scan_status: string }[] }): { body: unknown } | { error: string } {
    if (i.files.length === 0) return { error: "Lampirkan minimal satu dokumen penerimaan." };
    if (i.files.some((f) => f.scan_status !== "CLEAN")) return { error: "Tunggu semua dokumen lolos pemeriksaan sebelum menyimpan." };
    const p = MaterialReceiptBodySchema.safeParse({ room_id: Number(i.room), jumlah: Number(i.qty), tanggal_terima: i.date, nomor_dokumen: i.doc, catatan: i.note, dokumen: i.files.map(({ file_id, nama_berkas }) => ({ file_id, nama_berkas })) });
    return p.success ? { body: p.data } : { error: p.error.issues[0]?.message ?? "Lengkapi penerimaan." };
}
export function adjustmentBody(i: { room: string; direction: "TAMBAH" | "KURANG"; qty: string; reason: string }, balance: number | undefined): { body: unknown } | { error: string } {
    if (i.direction === "KURANG" && balance !== undefined && Number(i.qty) > balance) return { error: "Pengurangan melebihi saldo lokasi." };
    const p = MaterialAdjustmentBodySchema.safeParse({ room_id: Number(i.room), arah: i.direction, jumlah: Number(i.qty), alasan: i.reason });
    return p.success ? { body: p.data } : { error: p.error.issues[0]?.message ?? "Lengkapi penyesuaian." };
}
export const categoryBody = (f: { nama: string; kode: string; note: string; active: boolean }): { body: unknown } | { error: string } => { const p = MaterialCategoryBodySchema.safeParse({ nama: f.nama, kode: f.kode, keterangan: f.note.trim() || null, status: f.active ? "AKTIF" : "NONAKTIF" }); return p.success ? { body: p.data } : { error: p.error.issues[0]?.message ?? "Lengkapi kategori." }; };

/** FR-22.5: hanya baris dengan sisa disetujui; jumlah ≤ min(sisa, saldo kini); baris nol tidak dikirim. */
export const issuable = (d: MaterialRequestDetail) => d.items.filter((i) => (i.jumlah_disetujui ?? 0) > i.jumlah_diserahkan);
export const issueLimit = (i: MaterialRequestDetail["items"][number]) => Math.min((i.jumlah_disetujui ?? 0) - i.jumlah_diserahkan, i.saldo_terkini);
export function issueBody(d: MaterialRequestDetail, input: { name: string; date: string; note: string; qty: Readonly<Record<string, string>> }): { body: unknown } | { error: string } {
    const rows = issuable(d).filter((i) => Number(input.qty[i.id] ?? 0) > 0);
    const over = rows.find((i) => Number(input.qty[i.id]) > issueLimit(i));
    if (over) return { error: `${over.nama}: paling banyak ${issueLimit(over)} ${over.satuan}.` };
    const p = MaterialIssueBodySchema.safeParse({ nama_penerima: input.name, tanggal_serah: input.date, catatan: input.note, items: rows.map((i) => ({ item_id: Number(i.id), jumlah: Number(input.qty[i.id]) })) });
    return p.success ? { body: p.data } : { error: rows.length === 0 ? "Isi jumlah yang diserahkan sekarang." : p.error.issues[0]?.message ?? "Lengkapi penyerahan." };
}
export const canIssue = (d: Pick<MaterialRequestDetail, "status">, perms: Readonly<Record<string, string>>) => Object.hasOwn(perms, "material.issue") && ["DISETUJUI", "DISETUJUI_SEBAGIAN", "DISERAHKAN_SEBAGIAN"].includes(d.status);
export const canClose = (d: Pick<MaterialRequestDetail, "status">, perms: Readonly<Record<string, string>>) => Object.hasOwn(perms, "material.issue") && d.status === "DISERAHKAN_SEBAGIAN";
