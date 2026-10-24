import { z } from "zod";
import { AssetReservationSelectionSchema, PolaPengulanganSchema, RoomReservationBodySchema, RoomReservationCreatedSchema, RoomReservationPreviewSchema } from "./reservation.js";
export { AssetReservationSelectionSchema } from "./reservation.js";
export const AssetReservationBodySchema = z.object({
    jenis: z.literal("ASET"),
    aset: z.array(AssetReservationSelectionSchema).min(1),
    waktu_mulai: z.iso.datetime({ offset: true }), waktu_selesai: z.iso.datetime({ offset: true }),
    keperluan: z.string().trim().min(1, "Keperluan wajib diisi.").max(1000, "Keperluan maksimal 1.000 karakter."),
    lokasi_penggunaan: z.string().trim().min(1, "Lokasi penggunaan wajib diisi.").max(200, "Lokasi penggunaan maksimal 200 karakter."),
    room_id: z.number().int().positive().safe().optional(),
    nama_kegiatan: z.string().trim().min(1).max(200).optional(),
    jenis_kegiatan: z.string().trim().min(1).max(100).optional(),
    jumlah_peserta: z.number().int().positive().safe().optional(),
    pengulangan: PolaPengulanganSchema.optional(), lewati: z.array(z.iso.date()).optional(),
}).strict().superRefine((b, ctx) => {
    if (Date.parse(b.waktu_mulai) >= Date.parse(b.waktu_selesai)) ctx.addIssue({ code: "custom", path: ["waktu_selesai"], message: "Waktu selesai harus sesudah waktu mulai." });
    if (b.room_id !== undefined && (b.nama_kegiatan === undefined || b.jenis_kegiatan === undefined || b.jumlah_peserta === undefined)) ctx.addIssue({ code: "custom", path: ["room_id"], message: "Nama/jenis kegiatan dan jumlah peserta wajib bagi reservasi gabungan." });
    if (b.pengulangan === undefined && (b.lewati?.length ?? 0) > 0) ctx.addIssue({ code: "custom", path: ["lewati"], message: "Tanggal dilewati hanya berlaku pada pola berulang." });
    if (new Set(b.aset.map((a) => a.category_id)).size !== b.aset.length) ctx.addIssue({ code: "custom", path: ["aset"], message: "Setiap kategori harus dicantumkan satu kali." });
});
export const AssetReservationCreatedSchema = RoomReservationCreatedSchema;
export const ReservationSubmissionBodySchema = z.union([AssetReservationBodySchema, RoomReservationBodySchema]);
export const AssetReservationPreviewSchema = RoomReservationPreviewSchema;
export type AssetReservationBody = z.infer<typeof AssetReservationBodySchema>;
