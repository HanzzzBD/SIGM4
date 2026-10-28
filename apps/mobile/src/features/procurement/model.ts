// Usulan pengadaan mobile (FR-14.1, FR-14.2; MS-67…MS-69) — kontrak sama dengan web P-51…P-53. Selalu daring.
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { ProcurementDetailResponseSchema, ProcurementListResponseSchema, ProcurementOptionsResponseSchema, ProcurementReceiptSchema, ProcurementSaveSchema } from "@sigm4/schemas";
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

/** MS-70 (FR-14.3): penerimaan untuk usulan disetujui; sisa = disetujui − diterima. Penutupan setelah tahun anggaran lewat. */
const RECEIVABLE = ["DISETUJUI", "DISETUJUI_SEBAGIAN", "DITERIMA_SEBAGIAN"];
export const canReceive = (d: Pick<ProcurementDetail, "status">, perms: Readonly<Record<string, string>>) => Object.hasOwn(perms, "procurement.receive") && RECEIVABLE.includes(d.status);
export const canClose = (d: Pick<ProcurementDetail, "status" | "tahun_anggaran">, perms: Readonly<Record<string, string>>, year: number) => canReceive(d, perms) && year > d.tahun_anggaran;
export const remaining = (i: Pick<ProcurementDetail["items"][number], "jumlah_disetujui" | "jumlah_diterima">) => (i.jumlah_disetujui ?? 0) - i.jumlah_diterima;
export interface ReceivedRow { selected: boolean; jumlah: string; status: "DITERIMA" | "DITOLAK_SAAT_PENERIMAAN"; alasan: string; foto: Attached[]; room: string; kondisi: "BAIK" | "RUSAK_RINGAN"; merek: string; model: string; nilai: string; seri: string; pinjam: boolean }
export const receivedRow = (i: Pick<ProcurementDetail["items"][number], "jenis" | "jumlah_disetujui" | "jumlah_diterima">): ReceivedRow => ({ selected: false, jumlah: String(Math.max(0, Math.min(i.jenis === "BAHAN" ? 100000 : 500, remaining(i)))), status: "DITERIMA", alasan: "", foto: [], room: "", kondisi: "BAIK", merek: "", model: "", nilai: "", seri: "", pinjam: true });
export interface ReceiptForm { tanggal: string; nomor: string; catatan: string; dokumen: (Attached & { jenis: "FAKTUR" | "BERITA_ACARA" | "LAINNYA" })[]; rows: Readonly<Record<string, ReceivedRow>> }
/** Aset → didaftarkan per unit (merek, nomor seri per baris); Bahan → menambah stok di ruangan; ditolak → alasan + foto. */
export function receiptBody(d: Pick<ProcurementDetail, "items">, f: ReceiptForm): { body: unknown } | { error: string } {
    const picked = d.items.filter((i) => f.rows[i.id]?.selected);
    if (!picked.length) return { error: "Pilih minimal satu barang yang tiba." };
    const over = picked.find((i) => Number(f.rows[i.id]!.jumlah) > remaining(i));
    if (over) return { error: `${over.nama_barang}: jumlah melebihi sisa ${remaining(over)} ${over.satuan}.` };
    const unready = picked.find((i) => f.rows[i.id]!.status === "DITERIMA" && !f.rows[i.id]!.room);
    if (unready) return { error: `${unready.nama_barang}: pilih lokasi penempatan.` };
    const p = ProcurementReceiptSchema.safeParse({ tanggal_terima: f.tanggal, nomor_dokumen: f.nomor, ...(f.catatan.trim() ? { catatan: f.catatan.trim() } : {}), dokumen: f.dokumen.map(({ file_id, nama_berkas, jenis }) => ({ file_id, nama_berkas, jenis })),
        items: picked.map((i) => { const r = f.rows[i.id]!; return { item_id: Number(i.id), jumlah: Number(r.jumlah), status: r.status, ...(r.status === "DITOLAK_SAAT_PENERIMAAN" ? { alasan: r.alasan.trim(), foto_file_ids: r.foto.map((x) => x.file_id) } : i.jenis === "BAHAN" ? { room_id: Number(r.room) } : { kondisi: r.kondisi, room_id: Number(r.room), ...(r.merek.trim() ? { merek: r.merek.trim() } : {}), ...(r.model.trim() ? { model: r.model.trim() } : {}), ...(r.nilai.trim() ? { nilai_perolehan: Number(r.nilai) } : {}), nomor_seri: r.seri.trim() ? r.seri.split("\n").map((v) => v.trim() || null) : [], dapat_dipinjam: r.pinjam }) }; }) });
    if (p.success) return { body: p.data };
    const at = p.error.issues[0]?.path[0];
    return { error: at === "dokumen" ? "Lampirkan minimal satu dokumen penerimaan." : at === "nomor_dokumen" ? "Isi nomor dokumen penerimaan/faktur." : at === "tanggal_terima" ? "Isi tanggal penerimaan." : "Periksa jumlah dan isian setiap barang." };
}
