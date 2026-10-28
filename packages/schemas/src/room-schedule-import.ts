import { z } from "zod";

export const ROOM_SCHEDULE_IMPORT_COLUMNS = ["kode_ruangan", "hari", "jam_mulai", "jam_selesai", "label_kegiatan", "berlaku_mulai", "berlaku_sampai"] as const;
export const ROOM_SCHEDULE_IMPORT_SYNC_LIMIT = 200;
export const ROOM_SCHEDULE_IMPORT_MAX_BYTES = 6_000_000;
export const ImportRoomScheduleBodySchema = z.object({
    filename: z.string().trim().min(1).max(255).regex(/\.csv$/i, "Pilih berkas CSV."),
    content_base64: z.string().min(1).max(4 * Math.ceil(ROOM_SCHEDULE_IMPORT_MAX_BYTES / 3)).regex(/^[A-Za-z0-9+/]*={0,2}$/, "Isi berkas base64 tidak valid.").refine(s => s.length % 4 === 0, "Panjang base64 tidak valid."),
}).strict();
const hari = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"];
export const RoomScheduleImportRowSchema = z.object({
    kode_ruangan: z.string().trim().min(1, "Kode ruangan wajib diisi.").max(100),
    hari: z.string().trim().transform(s => hari.indexOf(s.toLocaleLowerCase("id-ID")) + 1).pipe(z.number().min(1, "Hari harus nama Senin sampai Minggu.")),
    jam_mulai: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam mulai harus HH:MM."),
    jam_selesai: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam selesai harus HH:MM."),
    label_kegiatan: z.string().trim().min(1, "Label kegiatan wajib diisi.").max(100),
    berlaku_mulai: z.iso.date({ error: "Berlaku mulai harus YYYY-MM-DD." }),
    berlaku_sampai: z.iso.date({ error: "Berlaku sampai harus YYYY-MM-DD." }),
});
export const RoomScheduleImportFailureSchema = z.object({ baris: z.number().int(), kode_ruangan: z.string().nullable(), pesan: z.string(), data: z.record(z.string(), z.string()) });
export const RoomScheduleImportJobSchema = z.object({
    id: z.string(), nama_berkas: z.string(), status: z.enum(["MENUNGGU", "BERJALAN", "SELESAI", "GAGAL"]),
    total: z.number().int(), terproses: z.number().int(), sukses: z.number().int(), gagal: z.number().int(),
    laporan_gagal: z.array(RoomScheduleImportFailureSchema), pesan_galat: z.string().nullable(), selesai_pada: z.string().nullable(), dibuat_pada: z.string(),
    report_expires_at: z.string().nullable(), report_expired: z.boolean(),
});
export const RoomScheduleImportResponseSchema = z.object({ success: z.literal(true), data: RoomScheduleImportJobSchema, meta: z.object({ idempotent_replay: z.boolean() }).nullable() });
export type RoomScheduleImportJob = z.infer<typeof RoomScheduleImportJobSchema>;
export type RoomScheduleImportFailure = z.infer<typeof RoomScheduleImportFailureSchema>;
