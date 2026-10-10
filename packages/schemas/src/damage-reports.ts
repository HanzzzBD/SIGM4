// Kontrak laporan kerusakan (FR-11.1; PR-03-14, keputusan 20 log phase-03). Satu definisi bagi API,
// layar P-40 web, dan MS-15 mobile (SDD-FE-05, SDD-MOB-01).
import { z } from "zod";

/** Bab 11.3 "Urgensi Kerusakan". */
export const URGENSI_KERUSAKAN = ["RENDAH", "SEDANG", "TINGGI", "KRITIS"] as const;
/** Bab 11.3 "Status Laporan Kerusakan". */
export const STATUS_LAPORAN_KERUSAKAN = ["DILAPORKAN", "DIVERIFIKASI", "DALAM_PERBAIKAN", "SELESAI", "DITOLAK"] as const;

const ID = z.number().int().positive();
const OBJEK_TUNGGAL = { error: "Pilih tepat satu objek: aset atau ruangan.", path: ["asset_id"] };
const satuObjek = (v: { asset_id?: number | undefined; room_id?: number | undefined }) => (v.asset_id === undefined) !== (v.room_id === undefined);

/**
 * `POST /damage-reports`. Foto = `file_id` hasil `POST /files/presign` jenis `DAMAGE_PHOTO` (SDD-MOB-04);
 * BR-044 menuntut minimal satu, dan unggahannya boleh masih tertunda (A2, keputusan 20b).
 */
export const DamageReportCreateSchema = z
    .object({
        asset_id: ID.optional(),
        /** FR-11.1 A4: ruangan, bukan aset. */
        room_id: ID.optional(),
        deskripsi: z.string({ error: "Deskripsi kerusakan wajib diisi." }).trim().min(1, { error: "Deskripsi kerusakan wajib diisi." }).max(2000, { error: "Deskripsi paling panjang 2000 karakter." }),
        urgensi: z.enum(URGENSI_KERUSAKAN, { error: "Urgensi harus Rendah, Sedang, Tinggi, atau Kritis." }),
        foto_file_ids: z
            .array(ID, { error: "Unggah minimal satu foto kerusakan." })
            .min(1, { error: "Unggah minimal satu foto kerusakan." })
            .max(5, { error: "Paling banyak 5 foto." })
            .refine((f) => new Set(f).size === f.length, { error: "Foto tidak boleh berulang." }),
    })
    .strict()
    .refine(satuObjek, OBJEK_TUNGGAL);
export type DamageReportCreate = z.input<typeof DamageReportCreateSchema>;

export const DamageReportCreatedSchema = z.object({
    id: z.string(),
    /** SEQ-04: `KRS-YYYY-NNNN`. */
    nomor: z.string(),
    status: z.enum(STATUS_LAPORAN_KERUSAKAN),
    /** MOB-OFF-04: foto yang unggahannya belum dikonfirmasi. */
    foto_tertunda: z.number().int(),
});
export type DamageReportCreated = z.infer<typeof DamageReportCreatedSchema>;
export const DamageReportCreatedResponseSchema = z.object({ success: z.literal(true), data: DamageReportCreatedSchema, meta: z.null() });

/** `GET /damage-reports/open` — FR-11.1 A1. */
export const DamageReportOpenQuerySchema = z
    .object({ asset_id: z.coerce.number().int().positive().optional(), room_id: z.coerce.number().int().positive().optional() })
    .strict()
    .refine(satuObjek, OBJEK_TUNGGAL);

/** Ringkasan tanpa identitas pelapor maupun isi laporan — terlihat pula oleh scope `own` (keputusan 20e). */
export const DamageReportOpenSchema = z.object({
    id: z.string(),
    nomor: z.string(),
    status: z.enum(STATUS_LAPORAN_KERUSAKAN),
    urgensi: z.enum(URGENSI_KERUSAKAN),
    dilaporkan_pada: z.iso.datetime({ offset: true }),
    milik_sendiri: z.boolean(),
});
export type DamageReportOpen = z.infer<typeof DamageReportOpenSchema>;
export const DamageReportOpenResponseSchema = z.object({ success: z.literal(true), data: DamageReportOpenSchema.nullable(), meta: z.null() });
