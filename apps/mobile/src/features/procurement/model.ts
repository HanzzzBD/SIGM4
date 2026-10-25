// Usulan pengadaan mobile (FR-14.1, FR-14.2; MS-67…MS-69) — kontrak sama dengan web P-51…P-53. Selalu daring.
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { ProcurementDetailResponseSchema, ProcurementListResponseSchema, ProcurementOptionsResponseSchema, ProcurementSaveSchema } from "@sigm4/schemas";
import type { ProcurementDetail } from "@sigm4/schemas";
import type { StatusTone } from "../../shared/ui";
import type { Attached } from "../../shared/upload/AttachmentField";

export const statuses = { DRAF: "Draf", MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan", DISETUJUI: "Disetujui", DISETUJUI_SEBAGIAN: "Disetujui Sebagian", DITOLAK: "Ditolak", PERLU_REVISI: "Perlu Revisi", DITERIMA_SEBAGIAN: "Diterima Sebagian", SELESAI: "Selesai", TIDAK_DIREALISASIKAN: "Tidak Direalisasikan" } as const;
export const statusTones: Readonly<Record<keyof typeof statuses, StatusTone>> = { DRAF: "pending", MENUNGGU_PERSETUJUAN: "warning", DISETUJUI: "info", DISETUJUI_SEBAGIAN: "info", DITOLAK: "error", PERLU_REVISI: "warning", DITERIMA_SEBAGIAN: "info", SELESAI: "success", TIDAK_DIREALISASIKAN: "pending" };
export const priorities = { RENDAH: "Rendah", SEDANG: "Sedang", TINGGI: "Tinggi", MENDESAK: "Mendesak" } as const;
const key = (k: string) => ({ headers: { "Idempotency-Key": k } });

export const loadProcurements = async (api: AxiosInstance, q: { page: number; q: string; status: string }, signal: AbortSignal) => ProcurementListResponseSchema.parse((await api.get("/procurements", { params: { page: q.page, ...(q.q.trim() ? { q: q.q.trim() } : {}), ...(q.status ? { status: q.status } : {}) }, signal })).data);
export const loadProcurement = async (api: AxiosInstance, id: string, signal: AbortSignal) => ProcurementDetailResponseSchema.parse((await api.get(`/procurements/${id}`, { signal })).data).data;
export const loadProcurementOptions = async (api: AxiosInstance, signal: AbortSignal) => ProcurementOptionsResponseSchema.parse((await api.get("/procurements/options", { signal })).data).data;
export const loadSourceAsset = async (api: AxiosInstance, id: string, signal: AbortSignal) => z.object({ data: z.object({ nama: z.string(), kategori: z.object({ id: z.string() }), kondisi: z.string() }) }).parse((await api.get(`/assets/${id}`, { signal })).data).data;
export const saveProcurement = async (api: AxiosInstance, id: string | undefined, body: unknown, k: string) => ProcurementDetailResponseSchema.parse((await (id ? api.put(`/procurements/${id}`, body, key(k)) : api.post("/procurements", body, key(k)))).data).data;
export const procurementAction = async (api: AxiosInstance, id: string, action: string, body: unknown, k: string) => ProcurementDetailResponseSchema.parse((await api.post(`/procurements/${id}/${action}`, body, key(k))).data).data;

export interface ItemForm { jenis: "ASET" | "BAHAN"; nama_barang: string; material_id: string; category_id: string; spesifikasi: string; jumlah: string; satuan: string; harga: string; keterangan: string }
export interface ProcurementForm { judul: string; unit: string; tahun: string; prioritas: keyof typeof priorities; justifikasi: string; items: ItemForm[]; lampiran: Attached[]; source: string }
export const newItem = (): ItemForm => ({ jenis: "ASET", nama_barang: "", material_id: "", category_id: "", spesifikasi: "", jumlah: "1", satuan: "unit", harga: "0", keterangan: "" });
export const emptyForm = (year: string, source = ""): ProcurementForm => ({ judul: "", unit: "", tahun: year, prioritas: "SEDANG", justifikasi: "", items: [newItem()], lampiran: [], source });
export const formFromDetail = (d: ProcurementDetail): ProcurementForm => ({ judul: d.judul, unit: d.work_unit_id ?? "", tahun: String(d.tahun_anggaran), prioritas: d.prioritas, justifikasi: d.justifikasi, source: d.source_asset_id ?? "", lampiran: d.lampiran.map((f) => ({ file_id: Number(f.file_id), nama_berkas: f.nama_berkas, scan_status: f.status as Attached["scan_status"] })), items: d.items.map((i) => ({ jenis: i.jenis, nama_barang: i.nama_barang, material_id: i.material_id ?? "", category_id: i.category_id ?? "", spesifikasi: i.spesifikasi, jumlah: String(i.jumlah_diusulkan), satuan: i.satuan, harga: i.estimasi_harga_satuan, keterangan: i.keterangan ?? "" })) });
/** Prefill rekomendasi penggantian dari Detail Aset (keputusan 23, sama dengan web P-52). */
export const formFromAsset = (f: ProcurementForm, a: { nama: string; kategori: { id: string }; kondisi: string }): ProcurementForm => ({ ...f, judul: `Penggantian ${a.nama}`, justifikasi: `Usulan penggantian ${a.nama}. Kondisi tercatat: ${a.kondisi.toLowerCase().replaceAll("_", " ")}.`, items: [{ ...newItem(), nama_barang: a.nama, category_id: a.kategori.id }] });
export const estimateTotal = (items: readonly ItemForm[]) => items.reduce((sum, i) => sum + (Number(i.jumlah) || 0) * (Number(i.harga) || 0), 0);

/** FR-14.1: draf boleh belum lengkap; pengajuan wajib unit, justifikasi, dan minimal satu barang. Total dihitung server. */
export function procurementBody(f: ProcurementForm, mode: "DRAF" | "AJUKAN"): { body: unknown } | { error: string } {
    if (mode === "AJUKAN" && (!f.unit || !f.justifikasi.trim() || !f.items.length)) return { error: "Pilih unit kerja, isi justifikasi, dan minimal satu barang sebelum mengajukan." };
    const p = ProcurementSaveSchema.safeParse({ mode, judul: f.judul, work_unit_id: f.unit ? Number(f.unit) : null, tahun_anggaran: Number(f.tahun), prioritas: f.prioritas, justifikasi: f.justifikasi, lampiran: f.lampiran.map((a) => ({ file_id: a.file_id, nama_berkas: a.nama_berkas })), source_asset_id: f.source ? Number(f.source) : null,
        items: f.items.filter((i) => mode === "AJUKAN" || i.nama_barang.trim()).map((i) => ({ jenis: i.jenis, nama_barang: i.nama_barang, spesifikasi: i.spesifikasi, jumlah: Number(i.jumlah), satuan: i.satuan, estimasi_harga_satuan: Number(i.harga), keterangan: i.keterangan.trim() || null, ...(i.jenis === "BAHAN" ? { material_id: i.material_id ? Number(i.material_id) : null } : { category_id: i.category_id ? Number(i.category_id) : null }) })) });
    if (p.success) return { body: p.data };
    const issue = p.error.issues[0], at = issue?.path[0] === "items" ? `Barang ${Number(issue.path[1]) + 1}: ` : "";
    return { error: issue?.code === "custom" ? `${at}${issue.message}` : `${at}Periksa ${issue?.path.at(-1) === "judul" ? "judul usulan" : "isian"}; nilai harus lengkap dan sesuai batas.` };
}
/** Hanya pengusul yang menyunting draf atau usulan Perlu Revisi miliknya (sama dengan web). */
export const canEdit = (d: Pick<ProcurementDetail, "status" | "pengusul">, user: string, perms: Readonly<Record<string, string>>) => Object.hasOwn(perms, "procurement.create") && d.pengusul.id === user && (d.status === "DRAF" || d.status === "PERLU_REVISI");
