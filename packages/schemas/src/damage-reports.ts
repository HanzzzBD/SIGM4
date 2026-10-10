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

export const DamageReportIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** FR-11.2 langkah 3 (keputusan 21b). */
export const KEPUTUSAN_VERIFIKASI_KERUSAKAN = ["TINDAK_LANJUT", "PERBAIKAN_RINGAN", "TOLAK"] as const;

/**
 * `POST /damage-reports/{id}/verify`. TINDAK_LANJUT → `DIVERIFIKASI` (siap work order, BR-045);
 * PERBAIKAN_RINGAN → `SELESAI`; TOLAK → `DITOLAK`. Catatan wajib bagi keduanya yang menutup tiket —
 * alasan penolakan terlihat pelapor (FR-11.2 AC). `kondisi_aset` opsional (langkah 4 / A1, keputusan 21c);
 * `HILANG` tidak dapat ditetapkan dari sini (BR-012 menuntut sesi opname / berita acara).
 */
export const DamageReportVerifySchema = z
    .object({
        keputusan: z.enum(KEPUTUSAN_VERIFIKASI_KERUSAKAN, { error: "Pilih tindak lanjut: Buat Work Order, Perbaikan Ringan, atau Tolak." }),
        catatan: z.string().trim().min(1, { error: "Catatan tidak boleh kosong." }).max(1000, { error: "Catatan paling panjang 1000 karakter." }).optional(),
        kondisi_aset: z
            .object({
                kondisi: z.enum(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT"], { error: "Kondisi aset harus Baik, Rusak Ringan, atau Rusak Berat." }),
                alasan: z.string().trim().min(1).max(500).optional(),
            })
            .strict()
            .optional(),
    })
    .strict()
    .refine((v) => v.keputusan === "TINDAK_LANJUT" || v.catatan !== undefined, {
        error: (i) => ((i.input as { keputusan?: string }).keputusan === "TOLAK" ? "Alasan penolakan wajib diisi." : "Catatan perbaikan wajib diisi."),
        path: ["catatan"],
    });
export type DamageReportVerify = z.input<typeof DamageReportVerifySchema>;

export const DamageReportVerifiedSchema = z.object({
    id: z.string(),
    nomor: z.string(),
    status: z.enum(STATUS_LAPORAN_KERUSAKAN),
    diverifikasi_pada: z.iso.datetime({ offset: true }),
    /** Kondisi aset sesudah verifikasi bila diubah; `null` bila tidak. */
    kondisi_aset: z.string().nullable(),
});
export type DamageReportVerified = z.infer<typeof DamageReportVerifiedSchema>;
export const DamageReportVerifiedResponseSchema = z.object({ success: z.literal(true), data: DamageReportVerifiedSchema, meta: z.null() });

const Pengguna = z.object({ id: z.string(), nama: z.string() });

/** `GET /damage-reports/{id}` — FR-11.2 langkah 1–2, A3 (keputusan 21a). */
export const DamageReportDetailSchema = z.object({
    id: z.string(),
    nomor: z.string(),
    status: z.enum(STATUS_LAPORAN_KERUSAKAN),
    urgensi: z.enum(URGENSI_KERUSAKAN),
    deskripsi: z.string(),
    objek: z.object({ jenis: z.enum(["ASET", "RUANGAN"]), id: z.string(), label: z.string(), lokasi: z.string() }),
    pelapor: Pengguna,
    dilaporkan_pada: z.iso.datetime({ offset: true }),
    diverifikasi_oleh: Pengguna.nullable(),
    diverifikasi_pada: z.iso.datetime({ offset: true }).nullable(),
    catatan_verifikasi: z.string().nullable(),
    /**
     * `BELUM_TERUNGGAH` = pesanan yang unggahannya masih di antrean perangkat (A2, MOB-OFF-04); URL hanya
     * bagi berkas `CLEAN` (SDD-FS-03).
     */
    foto: z.array(z.object({ file_id: z.string(), urutan: z.number().int(), status: z.enum(["BELUM_TERUNGGAH", "PENDING", "CLEAN", "INFECTED", "FAILED"]), url: z.string().nullable() })),
    foto_tertunda: z.number().int(),
    /**
     * BR-052 / A3: garansi aktif atas aset hari ini (WIB). `null` = tidak berlaku (tiket ruangan) atau
     * pemanggil tanpa `asset_document.view`.
     */
    garansi: z.array(z.object({ dokumen_id: z.string(), nama_berkas: z.string(), garansi_selesai: z.iso.date() })).nullable(),
});
export type DamageReportDetail = z.infer<typeof DamageReportDetailSchema>;
export const DamageReportDetailResponseSchema = z.object({ success: z.literal(true), data: DamageReportDetailSchema, meta: z.null() });
