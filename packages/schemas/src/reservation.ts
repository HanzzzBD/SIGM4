// Kontrak pengajuan reservasi ruangan `POST /reservations` dan `POST /reservations/preview`
// (FR-07.2, BR-017 … BR-024a; PR-03-10, keputusan 14 log phase-03). Satu definisi Zod bagi API
// (validasi + OpenAPI) dan wizard P-29 (formulir + parse respons).
import { z } from "zod";

const WAKTU = { offset: true, error: "Waktu harus berformat ISO-8601 dengan zona waktu." } as const;
const TANGGAL = { error: "Tanggal harus berformat YYYY-MM-DD." } as const;
const teks = (maks: number, nama: string) =>
    z.string({ error: `${nama} wajib diisi.` }).trim().min(1, { error: `${nama} wajib diisi.` }).max(maks, { error: `${nama} paling panjang ${String(maks)} karakter.` });
const opsional = (maks: number, nama: string) =>
    z.string().trim().max(maks, { error: `${nama} paling panjang ${String(maks)} karakter.` }).nullish().transform((v) => (v === undefined || v === null || v === "" ? null : v));

/**
 * BR-024a A4 (keputusan 14g): pola MINGGUAN — hari ISO 1 = Senin … 7 = Minggu, dari tanggal
 * `waktu_mulai` sampai `sampai` (inklusif, WIB). Jam yang sama di setiap tanggal.
 */
export const PolaPengulanganSchema = z.object({
    hari: z
        .array(z.number().int().min(1, { error: "Hari harus 1 (Senin) sampai 7 (Minggu)." }).max(7, { error: "Hari harus 1 (Senin) sampai 7 (Minggu)." }))
        .min(1, { error: "Pilih minimal satu hari." })
        .refine((h) => new Set(h).size === h.length, { error: "Hari tidak boleh berulang." }),
    sampai: z.iso.date(TANGGAL),
});

export const RoomReservationBodySchema = z
    .object({
        room_id: z.number({ error: "Ruangan wajib dipilih." }).int().positive().safe(),
        waktu_mulai: z.iso.datetime(WAKTU),
        waktu_selesai: z.iso.datetime(WAKTU),
        nama_kegiatan: teks(200, "Nama kegiatan"),
        jenis_kegiatan: teks(100, "Jenis kegiatan"),
        jumlah_peserta: z.number({ error: "Jumlah peserta wajib diisi." }).int({ error: "Jumlah peserta harus bilangan bulat." }).positive({ error: "Jumlah peserta minimal 1." }).safe(),
        keperluan: opsional(1000, "Keperluan"),
        kebutuhan_tambahan: opsional(1000, "Kebutuhan tambahan"),
        keterangan: opsional(1000, "Keterangan"),
        /** FR-07.2 langkah 3 — ditolak sampai `reservation_items` lahir (`PR-04-02`, keputusan 11c). */
        aset_pendukung: z.array(z.unknown()).optional(),
        pengulangan: PolaPengulanganSchema.optional(),
        /** Tanggal turunan yang dilewati (BR-024a A4: "disesuaikan atau dilewati"). */
        lewati: z.array(z.iso.date(TANGGAL)).max(400).optional(),
    })
    .strict()
    .superRefine((b, ctx) => {
        if (!(Date.parse(b.waktu_selesai) > Date.parse(b.waktu_mulai)))
            ctx.addIssue({ code: "custom", path: ["waktu_selesai"], message: "Waktu selesai harus sesudah waktu mulai." });
        if (b.aset_pendukung !== undefined && b.aset_pendukung.length > 0)
            ctx.addIssue({ code: "custom", path: ["aset_pendukung"], message: "Aset pendukung belum dapat diajukan bersama reservasi ruangan." });
        if (b.lewati !== undefined && b.lewati.length > 0 && b.pengulangan === undefined)
            ctx.addIssue({ code: "custom", path: ["lewati"], message: "Tanggal yang dilewati hanya berlaku bagi reservasi berulang." });
    });

export type RoomReservationBody = z.input<typeof RoomReservationBodySchema>;

/**
 * Keadaan satu tanggal pengajuan (P-29 langkah 3): `TERSEDIA` akan dipesan; `BENTROK` beririsan
 * slot aktif (BR-017); `TIDAK_SAH` melanggar hari/jam operasional, libur, H-1, horizon, atau
 * granularitas; `DILEWATI` ada di `lewati`.
 */
export const KEADAAN_TANGGAL = ["TERSEDIA", "BENTROK", "TIDAK_SAH", "DILEWATI"] as const;
export type KeadaanTanggal = (typeof KEADAAN_TANGGAL)[number];

const TanggalPengajuan = z.object({
    tanggal: z.iso.date(),
    mulai: z.iso.datetime({ offset: true }),
    selesai: z.iso.datetime({ offset: true }),
    keadaan: z.enum(KEADAAN_TANGGAL),
    alasan: z.string().nullable(),
});

const LangkahJalur = z.object({
    urutan: z.number().int(),
    /** Nama role atau pengguna pemutus langkah. */
    approver: z.string(),
    sla_jam: z.number(),
    fallback: z.boolean(),
    /** RE-10/RE-13: alasan bila langkah akan dilewati bagi pemohon ini. */
    akan_dilewati: z.string().nullable(),
});

export const RoomReservationPreviewSchema = z.object({
    tanggal: z.array(TanggalPengajuan),
    /** RE-07: langkah persetujuan yang akan terbentuk bagi pemohon ini. */
    jalur_persetujuan: z.array(LangkahJalur),
    /** BR-023a: pengajuan menunggu persetujuan yang sedang berjalan dan batasnya. */
    kuota: z.object({ berjalan: z.number().int(), batas: z.number().int() }),
});

export const RoomReservationPreviewResponseSchema = z.object({ success: z.literal(true), data: RoomReservationPreviewSchema, meta: z.null() });

export const RoomReservationCreatedSchema = z.object({
    id: z.string(),
    nomor: z.string(),
    status: z.literal("MENUNGGU_PERSETUJUAN"),
    /** Satu baris bagi reservasi tunggal; baris turunan `.NN` bagi berulang (BR-024a). */
    tanggal: z.array(z.object({ id: z.string(), nomor: z.string(), mulai: z.iso.datetime({ offset: true }), selesai: z.iso.datetime({ offset: true }) })),
    approval: z.object({ instance_id: z.number().int(), langkah_aktif: z.number().int() }),
});

export const RoomReservationCreatedResponseSchema = z.object({ success: z.literal(true), data: RoomReservationCreatedSchema, meta: z.null() });

export type RoomReservationPreview = z.infer<typeof RoomReservationPreviewSchema>;
export type RoomReservationCreated = z.infer<typeof RoomReservationCreatedSchema>;
export type TanggalPengajuanRuangan = z.infer<typeof TanggalPengajuan>;

/** `POST /reservations/{id}/cancel` (FR-07.3, BR-025): alasan wajib — tampil pada riwayat dan NT-08. */
export const CancelReservationBodySchema = z
    .object({
        alasan: teks(1000, "Alasan pembatalan"),
    })
    .strict();

export type CancelReservationBody = z.input<typeof CancelReservationBodySchema>;

export const ReservationIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * Hasil pembatalan (keputusan 15c log phase-03): `dibatalkan` = baris yang benar-benar dibatalkan —
 * satu tanggal, seluruh tanggal yang belum dimulai bila `id` adalah induk berulang, atau reservasi
 * tunggal itu sendiri. `status` = status baris `id` sesudahnya (induk berulang tetap berstatus
 * semula selama masih ada tanggal yang berjalan).
 */
export const ReservationCancelledSchema = z.object({
    id: z.string(),
    nomor: z.string(),
    status: z.string(),
    dibatalkan: z.array(z.object({ id: z.string(), nomor: z.string() })),
});

export const ReservationCancelledResponseSchema = z.object({ success: z.literal(true), data: ReservationCancelledSchema, meta: z.null() });

export type ReservationCancelled = z.infer<typeof ReservationCancelledSchema>;

/**
 * `POST /reservations/{id}/usage` (FR-07.4 langkah 3 + A1, keputusan 16 log phase-03): sekali per
 * tanggal. `TIDAK_DIGUNAKAN` dari `Berlangsung` atau `Selesai`; `BAIK`/`PERLU_PERHATIAN` hanya `Selesai`.
 */
export const HASIL_PENGGUNAAN = ["BAIK", "PERLU_PERHATIAN", "TIDAK_DIGUNAKAN"] as const;
export type HasilPenggunaan = (typeof HASIL_PENGGUNAAN)[number];

export const RecordUsageBodySchema = z
    .object({
        hasil: z.enum(HASIL_PENGGUNAAN, { error: "Pilih hasil penggunaan: Baik, Perlu Perhatian, atau Tidak Digunakan." }),
        catatan: opsional(1000, "Catatan"),
    })
    .strict();

export type RecordUsageBody = z.input<typeof RecordUsageBodySchema>;

export const ReservationUsageSchema = z.object({
    id: z.string(),
    nomor: z.string(),
    status: z.enum(["SELESAI", "TIDAK_DIGUNAKAN"]),
    kondisi_ruangan: z.enum(["BAIK", "PERLU_PERHATIAN"]).nullable(),
    catatan: z.string().nullable(),
});

export const ReservationUsageResponseSchema = z.object({ success: z.literal(true), data: ReservationUsageSchema, meta: z.null() });

export type ReservationUsage = z.infer<typeof ReservationUsageSchema>;
