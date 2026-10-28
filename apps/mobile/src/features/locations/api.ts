// Kontrak M-03 + blokade M-07 di klien mobile — endpoint dan skema sama dengan web P-22/P-23 (SDD-MOB-13).
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { BlockDeactivatedResponseSchema, RoomBlockCreatedResponseSchema, RoomBlockListResponseSchema, RoomBlockPreviewResponseSchema } from "@sigm4/schemas";
import type { RoomBlockCreate } from "@sigm4/schemas";

const Room = z.object({ id: z.string(), area_id: z.string(), nama: z.string(), kode: z.string(), jenis: z.string(), kapasitas: z.number().nullable(), penanggung_jawab_id: z.string().nullable(), dapat_direservasi: z.boolean(), boleh_direservasi_siswa: z.boolean(), status: z.enum(["AKTIF", "NONAKTIF"]) });
export type Room = z.infer<typeof Room>;
const Tree = z.object({ data: z.array(z.object({ id: z.string(), nama: z.string(), kode: z.string(), status: z.enum(["AKTIF", "NONAKTIF"]), jumlah_aset: z.number(), areas: z.array(z.object({ id: z.string(), nama: z.string(), kode: z.string(), jumlah_aset: z.number(), rooms: z.array(Room.extend({ jumlah_aset: z.number() })) })) })) });
export type Building = z.infer<typeof Tree>["data"][number];
export const loadTree = async (api: AxiosInstance, signal: AbortSignal) => Tree.parse((await api.get("/locations/tree", { signal })).data).data;
export const loadRoom = async (api: AxiosInstance, id: string, signal: AbortSignal) => z.object({ data: Room }).parse((await api.get(`/rooms/${encodeURIComponent(id)}`, { signal })).data).data;
export const saveLocation = async (api: AxiosInstance, kind: "buildings" | "areas" | "rooms", body: Record<string, unknown>, roomId?: string) => { if (roomId) await api.put(`/rooms/${roomId}`, body); else await api.post(`/${kind}`, body); };
const KONDISI = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"] as const, STATUS = ["TERSEDIA", "DIRESERVASI", "DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"] as const;
const Assets = z.object({ data: z.object({ assets: z.array(z.object({ id: z.string().optional(), kode_barang: z.string(), nama: z.string(), kondisi: z.enum(KONDISI), status: z.enum(STATUS) })), ringkasan: z.object({ total: z.number(), per_kondisi: z.record(z.enum(KONDISI), z.number()), jumlah_dipinjam: z.number(), jumlah_dalam_perbaikan: z.number() }) }), meta: z.object({ page: z.number(), total: z.number(), total_pages: z.number() }) });
/** FR-03.3: inventaris per ruangan + ringkasan kondisi. */
export const loadRoomAssets = async (api: AxiosInstance, id: string, f: { q?: string; kondisi?: string; page: number }, signal: AbortSignal) => Assets.parse((await api.get(`/rooms/${id}/assets`, { params: { q: f.q || undefined, "filter[kondisi]": f.kondisi || undefined, page: f.page }, signal })).data);
export const loadUsers = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(z.object({ id: z.string(), nama: z.string() })) }).parse((await api.get("/users", { params: { "filter[status]": "AKTIF", per_page: 100 }, signal })).data).data;

export const loadBlocks = async (api: AxiosInstance, id: string, signal: AbortSignal) => RoomBlockListResponseSchema.parse((await api.get(`/rooms/${id}/blocks`, { signal })).data).data;
/** A1/A4: kemunculan, libur dilewati, dan bentrok — tanpa efek. */
export const previewBlock = async (api: AxiosInstance, id: string, body: RoomBlockCreate) => RoomBlockPreviewResponseSchema.parse((await api.post(`/rooms/${id}/blocks/preview`, body)).data).data;
export const createBlock = async (api: AxiosInstance, id: string, body: RoomBlockCreate) => RoomBlockCreatedResponseSchema.parse((await api.post(`/rooms/${id}/blocks`, body)).data).data;
/** A3: hanya penonaktifan; slot mendatang dilepas. */
export const deactivateBlock = async (api: AxiosInstance, jenis: "JADWAL_TETAP" | "BLOKADE_MANUAL", id: string) => BlockDeactivatedResponseSchema.parse((await api.patch(jenis === "JADWAL_TETAP" ? `/room-fixed-schedules/${id}/status` : `/room-manual-blocks/${id}/status`, { status: "NONAKTIF" })).data).data;
