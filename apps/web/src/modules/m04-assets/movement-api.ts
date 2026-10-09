import { z } from "zod";
import { queryOptions } from "@tanstack/react-query";
import { AssetMovementDocumentResponseSchema, AssetMovementDownloadResponseSchema, AssetMovementReceiptSchema, MoveAssetsBodySchema } from "@sigm4/schemas";
import type { AssetMovementDocument } from "@sigm4/schemas";
import { api } from "../../shared/api";

const Asset = z.object({ id: z.string(), kode_barang: z.string(), nama: z.string(), status: z.string() });
export type MovementAsset = z.infer<typeof Asset>;
const Pagination = z.object({ page: z.number(), total: z.number(), total_pages: z.number() });
const Catalog = z.object({ data: z.array(Asset), meta: Pagination });
const Room = z.object({ id: z.string(), nama: z.string(), kode: z.string(), status: z.string() });
const Tree = z.object({ data: z.array(z.object({ nama: z.string(), areas: z.array(z.object({ nama: z.string(), rooms: z.array(Room) })) })) });
const Users = z.object({ data: z.array(z.object({ id: z.string(), nama: z.string() })), meta: Pagination });
export const movementAssetsQuery = (q: string, page: number, enabled: boolean) => queryOptions({ queryKey: ["assets", "movement", q, page], enabled,
    queryFn: async () => Catalog.parse((await api.get("/assets", { params: { q, page, per_page: 25 } })).data) });
export const movementRoomsQuery = (enabled: boolean) => queryOptions({ queryKey: ["locations", "movement"], enabled,
    queryFn: async () => Tree.parse((await api.get("/locations/tree")).data).data.flatMap((building) => building.areas.flatMap((area) => area.rooms.filter((room) => room.status === "AKTIF").map((room) => ({ nilai: room.id, label: `${building.nama} / ${area.nama} / ${room.nama} (${room.kode})` })))) });
export const movementUsersQuery = (page: number, enabled: boolean) => queryOptions({ queryKey: ["users", "movement", page], enabled,
    queryFn: async () => Users.parse((await api.get("/users", { params: { page, per_page: 100, "filter[status]": "AKTIF" } })).data) });
export const pendingMovementDocument = (doc: AssetMovementDocument | undefined) => doc?.status === "MENUNGGU" || doc?.status === "BERJALAN";
export const movementDocumentQuery = (id: number | null, enabled: boolean) => queryOptions({ queryKey: ["asset-movement-document", id], enabled: enabled && id !== null,
    queryFn: async () => AssetMovementDocumentResponseSchema.parse((await api.get(`/assets/movements/${id}/document`)).data).data,
    refetchInterval: (query) => pendingMovementDocument(query.state.data) ? 1500 : false });
export async function moveAssets(body: z.input<typeof MoveAssetsBodySchema>) {
    const response = await api.post("/assets/move", MoveAssetsBodySchema.parse(body));
    return z.object({ meta: z.object({ berita_acara: AssetMovementReceiptSchema }) }).parse(response.data).meta.berita_acara;
}
export async function downloadMovementDocument(id: number): Promise<void> {
    const result = AssetMovementDownloadResponseSchema.parse((await api.get(`/assets/movements/${id}/document/download`)).data).data;
    const link = document.createElement("a");
    link.href = result.url; link.download = result.nama_berkas; link.target = "_blank"; link.rel = "noopener noreferrer"; link.click();
}
