// Kontrak M-03/M-04/M-06 di klien mobile — endpoint dan bentuk respons sama dengan web (SDD-MOB-13).
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { AssetDetailResponseSchema, AssetMovementDocumentResponseSchema, AssetMovementDownloadResponseSchema, AssetMovementReceiptSchema, DaftarDokumenAsetResponseSchema, DaftarDokumenLintasAsetResponseSchema, DokumenAsetResponseSchema } from "@sigm4/schemas";
import { CONDITIONS, STATUSES } from "./model";

const Meta = z.object({ page: z.number(), total: z.number(), total_pages: z.number() });
const Item = z.object({ id: z.string(), kode_barang: z.string(), nama: z.string(), merek: z.string().nullable(), tahun_perolehan: z.number(), kondisi: z.enum(CONDITIONS), status: z.enum(STATUSES), dapat_dipinjam: z.boolean(), kategori_nama: z.string(), lokasi: z.object({ ruang: z.string(), gedung: z.string() }) });
export type InventoryItem = z.infer<typeof Item>;
export interface InventoryFilter { q?: string; kategori?: string; lokasi?: string; kondisi?: string; status?: string; page: number }
/** FR-04.2 langkah 2–4: saringan dikirim sebagai `filter[...]`. */
export const loadInventory = async (api: AxiosInstance, f: InventoryFilter, signal: AbortSignal) => z.object({ data: z.array(Item), meta: Meta }).parse((await api.get("/assets", { params: { q: f.q || undefined, sort: "kode_barang", page: f.page, per_page: 25, "filter[kategori_id]": f.kategori || undefined, "filter[lokasi_id]": f.lokasi || undefined, "filter[kondisi]": f.kondisi || undefined, "filter[status]": f.status || undefined }, signal })).data);
export const loadAsset = async (api: AxiosInstance, id: string, signal: AbortSignal) => AssetDetailResponseSchema.parse((await api.get(`/assets/${encodeURIComponent(id)}`, { signal })).data).data;
const Created = z.object({ data: z.array(z.object({ id: z.string(), kode_barang: z.string(), nama: z.string() })) });
export const createAssets = async (api: AxiosInstance, body: unknown) => Created.parse((await api.post("/assets", body)).data).data;
export const updateAsset = async (api: AxiosInstance, id: string, body: unknown) => { await api.put(`/assets/${id}`, body); };

const Category = z.object({ id: z.string(), parent_id: z.string().nullable(), nama: z.string(), kode: z.string().optional(), umur_teknis_tahun: z.number().nullable().optional(), interval_preventif_hari: z.number().nullable().optional() });
export type Category = z.infer<typeof Category>;
export const loadCategories = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(Category) }).parse((await api.get("/asset-categories", { params: { per_page: 100 }, signal })).data).data;
/** FR-04.5 langkah 2–3, A1–A4. */
export const saveCategory = async (api: AxiosInstance, id: string | null, body: unknown) => { if (id) await api.put(`/asset-categories/${id}`, body); else await api.post("/asset-categories", body); };
export const deleteCategory = async (api: AxiosInstance, id: string) => { await api.delete(`/asset-categories/${id}`); };

const Room = z.object({ id: z.string(), area_id: z.string(), nama: z.string(), kode: z.string(), jenis: z.string(), kapasitas: z.number().nullable(), penanggung_jawab_id: z.string().nullable(), dapat_direservasi: z.boolean(), boleh_direservasi_siswa: z.boolean(), status: z.enum(["AKTIF", "NONAKTIF"]) });
export type Room = z.infer<typeof Room>;
const Tree = z.object({ data: z.array(z.object({ id: z.string(), nama: z.string(), kode: z.string(), status: z.enum(["AKTIF", "NONAKTIF"]), jumlah_aset: z.number(), areas: z.array(z.object({ id: z.string(), nama: z.string(), kode: z.string(), jumlah_aset: z.number(), rooms: z.array(Room.extend({ jumlah_aset: z.number() })) })) })) });
export type Building = z.infer<typeof Tree>["data"][number];
export const loadTree = async (api: AxiosInstance, signal: AbortSignal) => Tree.parse((await api.get("/locations/tree", { signal })).data).data;
/** Pilihan ruangan aktif berlabel "Gedung / Area / Ruangan". */
export const roomChoices = (tree: readonly Building[]) => tree.flatMap((b) => b.areas.flatMap((a) => a.rooms.filter((r) => r.status === "AKTIF").map((r) => ({ value: r.id, label: `${b.nama} / ${a.nama} / ${r.nama}` }))));
export const loadUsers = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(z.object({ id: z.string(), nama: z.string() })) }).parse((await api.get("/users", { params: { "filter[status]": "AKTIF", per_page: 100 }, signal })).data).data;

export const moveAssets = async (api: AxiosInstance, body: unknown) => z.object({ meta: z.object({ berita_acara: AssetMovementReceiptSchema }) }).parse((await api.post("/assets/move", body)).data).meta.berita_acara;
export const loadMovementDocument = async (api: AxiosInstance, id: string, signal: AbortSignal) => AssetMovementDocumentResponseSchema.parse((await api.get(`/assets/movements/${id}/document`, { signal })).data).data;
export const movementDownload = async (api: AxiosInstance, id: string) => AssetMovementDownloadResponseSchema.parse((await api.get(`/assets/movements/${id}/document/download`)).data).data;

export interface DocumentFilter { q?: string; jenis?: string; garansi?: string; page: number }
export const loadAllDocuments = async (api: AxiosInstance, f: DocumentFilter, signal: AbortSignal) => DaftarDokumenLintasAsetResponseSchema.parse((await api.get("/asset-documents", { params: { q: f.q || undefined, "filter[jenis]": f.jenis || undefined, "filter[garansi]": f.garansi || undefined, sort: "-diunggah_pada", page: f.page, per_page: 25 }, signal })).data);
export const loadAssetDocuments = async (api: AxiosInstance, id: string, signal: AbortSignal) => DaftarDokumenAsetResponseSchema.parse((await api.get(`/assets/${id}/documents`, { signal })).data).data;
export const linkDocument = async (api: AxiosInstance, id: string, body: unknown) => DokumenAsetResponseSchema.parse((await api.post(`/assets/${id}/documents`, body)).data).data;
export const detachDocument = async (api: AxiosInstance, id: string, docId: string) => { await api.delete(`/assets/${id}/documents/${docId}`); };
/** URL presign berumur pendek; dibuka di peramban perangkat. */
export const documentUrl = async (api: AxiosInstance, id: string, docId: string) => z.object({ data: z.object({ url: z.url() }) }).parse((await api.get(`/assets/${id}/documents/${docId}/download`)).data).data.url;
