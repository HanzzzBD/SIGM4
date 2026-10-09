import { z } from "zod";

export const MoveAssetsBodySchema = z.object({
    asset_ids: z.array(z.coerce.number().int().positive().safe()).min(1).max(50),
    room_tujuan_id: z.coerce.number().int().positive().safe(),
    tanggal_mutasi: z.iso.date(),
    alasan: z.string().trim().min(1).max(500),
    penanggung_jawab_baru_id: z.coerce.number().int().positive().safe().nullable().optional(),
});
const Identitas = z.object({ id: z.string(), nama: z.string() });
const Lokasi = Identitas.extend({ kode: z.string(), gedung: z.string(), area: z.string() });
export const AssetMovementSnapshotSchema = z.object({
    versi: z.literal(1), tanggal_mutasi: z.iso.date(), dicatat_pada: z.iso.datetime(),
    pelaku: Identitas, alasan: z.string(), tujuan: Lokasi,
    aset: z.array(z.object({
        id: z.string(), kode_barang: z.string(), nama: z.string(), nomor_seri: z.string().nullable(), asal: Lokasi,
        penanggung_jawab_lama: Identitas.nullable(), penanggung_jawab_baru: Identitas.nullable(),
    })).min(1).max(50),
});
export const AssetMovementReceiptSchema = z.object({ id: z.string(), status: z.literal("MENUNGGU") });
export const AssetMovementDocumentSchema = z.object({
    id: z.string(), status: z.enum(["MENUNGGU", "BERJALAN", "SIAP", "GAGAL"]),
    snapshot: AssetMovementSnapshotSchema, pesan_galat: z.string().nullable(), selesai_pada: z.iso.datetime().nullable(),
});
export const AssetMovementDocumentResponseSchema = z.object({ success: z.literal(true), data: AssetMovementDocumentSchema, meta: z.null() });
export const AssetMovementDownloadResponseSchema = z.object({ success: z.literal(true),
    data: z.object({ url: z.url(), expires_at: z.iso.datetime(), nama_berkas: z.string() }), meta: z.null() });
export type AssetMovementSnapshot = z.infer<typeof AssetMovementSnapshotSchema>;
export type AssetMovementDocument = z.infer<typeof AssetMovementDocumentSchema>;
