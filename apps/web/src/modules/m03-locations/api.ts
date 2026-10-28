import { queryOptions } from "@tanstack/react-query";
import { z } from "zod/mini";
import { api } from "../../shared/api";

export const JENIS = ["KELAS", "LABORATORIUM", "AULA", "PERPUSTAKAAN", "KANTOR", "GUDANG", "LAPANGAN", "LAINNYA"] as const;
export const KONDISI = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"] as const;
export const STATUS = ["TERSEDIA", "DIRESERVASI", "DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"] as const;
export const label = (s: string) => s.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const RoomSchema = z.object({ id: z.string(), area_id: z.string(), nama: z.string(), kode: z.string(), jenis: z.enum(JENIS), kapasitas: z.nullable(z.number()), penanggung_jawab_id: z.nullable(z.string()), dapat_direservasi: z.boolean(), boleh_direservasi_siswa: z.boolean(), status: z.enum(["AKTIF", "NONAKTIF"]) });
const TreeSchema = z.object({ data: z.array(z.object({ id: z.string(), nama: z.string(), kode: z.string(), status: z.enum(["AKTIF", "NONAKTIF"]), jumlah_aset: z.number(), areas: z.array(z.object({ id: z.string(), nama: z.string(), kode: z.string(), jumlah_aset: z.number(), rooms: z.array(z.extend(RoomSchema, { jumlah_aset: z.number() })) })) })) });
export type Room = z.infer<typeof RoomSchema>;
export type Building = z.infer<typeof TreeSchema>["data"][number];
export const treeQuery = queryOptions({ queryKey: ["locations", "tree"], queryFn: async () => TreeSchema.parse((await api.get("/locations/tree")).data).data });
export const roomQuery = (id: string) => queryOptions({ queryKey: ["locations", "room", id], queryFn: async () => z.object({ data: RoomSchema }).parse((await api.get(`/rooms/${id}`)).data).data });
export interface Filters { readonly q?: string | undefined; readonly kategori?: string | undefined; readonly kondisi?: string | undefined; readonly status?: string | undefined; readonly page?: number | undefined }
export const filterParams = (f: Filters) => ({ q: f.q || undefined, "filter[kategori_id]": f.kategori || undefined, "filter[kondisi]": f.kondisi || undefined, "filter[status]": f.status || undefined });
const AssetsSchema = z.object({ data: z.object({ assets: z.array(z.object({ kode_barang: z.string(), nama: z.string(), kondisi: z.enum(KONDISI), status: z.enum(STATUS) })), ringkasan: z.object({ total: z.number(), per_kondisi: z.record(z.enum(KONDISI), z.number()), jumlah_dipinjam: z.number(), jumlah_dalam_perbaikan: z.number() }) }), meta: z.object({ page: z.number(), total: z.number(), total_pages: z.number() }) });
export const assetsQuery = (id: string, filters: Filters) => queryOptions({ queryKey: ["locations", "assets", id, filters], queryFn: async () => AssetsSchema.parse((await api.get(`/rooms/${id}/assets`, { params: { ...filterParams(filters), page: filters.page ?? 1 } })).data) });
export const categoriesQuery = queryOptions({ queryKey: ["locations", "categories"], queryFn: async () => z.object({ data: z.array(z.object({ id: z.string(), nama: z.string() })) }).parse((await api.get("/asset-categories")).data).data });
export const responsibleQuery = queryOptions({ queryKey: ["users", "aktif"], staleTime: 5 * 60_000, queryFn: async () => z.object({ data: z.array(z.object({ id: z.string(), nama: z.string() })) }).parse((await api.get("/users", { params: { "filter[status]": "AKTIF", per_page: 100 } })).data).data });
export async function downloadInventory(id: string, filters: Filters, format: "xlsx" | "pdf") {
    const response = await api.get<Blob>(`/rooms/${id}/assets/export`, { params: { ...filterParams(filters), format }, responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a"); link.href = url; link.download = `inventaris-ruangan-${id}.${format}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
