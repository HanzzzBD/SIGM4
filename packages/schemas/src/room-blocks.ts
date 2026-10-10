// Kontrak blokade ruangan (FR-07.5; PR-03-13, keputusan 19 log phase-03): jadwal tetap mingguan dan
// blokade manual rentang tunggal. Satu definisi bagi API dan layar kelola dari P-27 (SDD-FE-05).
import { z } from "zod";

const TANGGAL = { error: "Tanggal harus berformat YYYY-MM-DD." } as const;
const WAKTU = { offset: true, error: "Waktu harus berformat ISO-8601 dengan zona waktu." } as const;
const JAM = z.string({ error: "Jam wajib diisi." }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Jam harus berformat HH:MM, mis. 07:00." });
const LABEL = z.string({ error: "Label kegiatan wajib diisi." }).trim().min(1, { error: "Label kegiatan wajib diisi." }).max(100, { error: "Label kegiatan paling panjang 100 karakter." });

export const JENIS_BLOKADE = ["JADWAL_TETAP", "BLOKADE_MANUAL"] as const;
export type JenisBlokade = (typeof JENIS_BLOKADE)[number];

const JadwalTetap = z.object({
    jenis: z.literal("JADWAL_TETAP"),
    /** ISO 1 = Senin … 7 = Minggu; satu aturan per hari tersimpan (data-model, E.5.3). */
    hari: z
        .array(z.number().int().min(1, { error: "Hari harus 1 (Senin) sampai 7 (Minggu)." }).max(7, { error: "Hari harus 1 (Senin) sampai 7 (Minggu)." }))
        .min(1, { error: "Pilih minimal satu hari." })
        .refine((h) => new Set(h).size === h.length, { error: "Hari tidak boleh berulang." }),
    jam_mulai: JAM,
    jam_selesai: JAM,
    berlaku_mulai: z.iso.date(TANGGAL),
    berlaku_sampai: z.iso.date(TANGGAL),
    label_kegiatan: LABEL,
});

const BlokadeManual = z.object({
    jenis: z.literal("BLOKADE_MANUAL"),
    mulai: z.iso.datetime(WAKTU),
    selesai: z.iso.datetime(WAKTU),
    label_kegiatan: LABEL,
});

/** Isian pratinjau `POST /rooms/{id}/blocks/preview`. */
export const RoomBlockInputSchema = z.discriminatedUnion("jenis", [JadwalTetap.strict(), BlokadeManual.strict()]);
export type RoomBlockInput = z.input<typeof RoomBlockInputSchema>;

/**
 * `POST /rooms/{id}/blocks`. FR-07.5 A1 (keputusan 19c): bila beririsan reservasi, penyimpanan DITOLAK
 * kecuali pengguna memilih eksplisit membatalkan reservasi itu — `batalkan_bentrok.alasan` (BR-025, NT-08).
 */
export const RoomBlockCreateSchema = z.discriminatedUnion("jenis", [
    JadwalTetap.extend({ batalkan_bentrok: z.object({ alasan: z.string().trim().min(1, { error: "Alasan pembatalan wajib diisi." }).max(1000) }).strict().optional() }).strict(),
    BlokadeManual.extend({ batalkan_bentrok: z.object({ alasan: z.string().trim().min(1, { error: "Alasan pembatalan wajib diisi." }).max(1000) }).strict().optional() }).strict(),
]);
export type RoomBlockCreate = z.input<typeof RoomBlockCreateSchema>;

export const RoomIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const BlockIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const BlockStatusBodySchema = z.object({ status: z.literal("NONAKTIF", { error: "Blokade hanya dapat dinonaktifkan; buat aturan baru untuk perubahan." }) }).strict();

const ReservasiBentrok = z.object({
    reservation_id: z.string(),
    nomor: z.string(),
    status: z.string(),
    pemohon: z.string(),
    nama_kegiatan: z.string().nullable(),
    mulai: z.iso.datetime({ offset: true }),
    selesai: z.iso.datetime({ offset: true }),
});

export const RoomBlockPreviewSchema = z.object({
    /** Kemunculan yang akan menjadi slot dalam horizon (jadwal tetap) atau 1 (blokade manual). */
    kemunculan: z.array(z.object({ mulai: z.iso.datetime({ offset: true }), selesai: z.iso.datetime({ offset: true }) })),
    /** FR-07.5 A4: tanggal libur yang dilewati. */
    dilewati: z.array(z.object({ tanggal: z.iso.date(), alasan: z.string() })),
    /** FR-07.5 A1: reservasi menunggu/disetujui yang beririsan — butuh keputusan eksplisit. */
    bentrok_reservasi: z.array(ReservasiBentrok),
    /** Blokade/pemeliharaan lain yang beririsan — tak dapat dibatalkan dari sini; blokade wajib disesuaikan. */
    bentrok_lain: z.array(z.object({ asal: z.string(), label: z.string().nullable(), mulai: z.iso.datetime({ offset: true }), selesai: z.iso.datetime({ offset: true }) })),
});
export const RoomBlockPreviewResponseSchema = z.object({ success: z.literal(true), data: RoomBlockPreviewSchema, meta: z.null() });

export const RoomBlockCreatedSchema = z.object({
    jenis: z.enum(JENIS_BLOKADE),
    /** Jadwal tetap: satu id per hari; blokade manual: satu id. */
    ids: z.array(z.string()),
    slot_dibuat: z.number().int(),
    reservasi_dibatalkan: z.array(z.object({ id: z.string(), nomor: z.string() })),
});
export const RoomBlockCreatedResponseSchema = z.object({ success: z.literal(true), data: RoomBlockCreatedSchema, meta: z.null() });

export const STATUS_BLOKADE = ["AKTIF", "NONAKTIF"] as const;

export const RoomBlockListSchema = z.object({
    jadwal_tetap: z.array(
        z.object({
            id: z.string(),
            hari: z.number().int(),
            jam_mulai: z.string(),
            jam_selesai: z.string(),
            berlaku_mulai: z.iso.date(),
            berlaku_sampai: z.iso.date(),
            label_kegiatan: z.string(),
            status: z.enum(STATUS_BLOKADE),
        }),
    ),
    blokade_manual: z.array(
        z.object({ id: z.string(), mulai: z.iso.datetime({ offset: true }), selesai: z.iso.datetime({ offset: true }), label_kegiatan: z.string(), status: z.enum(STATUS_BLOKADE) }),
    ),
});
export const RoomBlockListResponseSchema = z.object({ success: z.literal(true), data: RoomBlockListSchema, meta: z.null() });

export const BlockDeactivatedSchema = z.object({ id: z.string(), status: z.literal("NONAKTIF"), slot_dilepas: z.number().int() });
export const BlockDeactivatedResponseSchema = z.object({ success: z.literal(true), data: BlockDeactivatedSchema, meta: z.null() });

export type RoomBlockPreview = z.infer<typeof RoomBlockPreviewSchema>;
export type RoomBlockCreated = z.infer<typeof RoomBlockCreatedSchema>;
export type RoomBlockList = z.infer<typeof RoomBlockListSchema>;
export type BlockDeactivated = z.infer<typeof BlockDeactivatedSchema>;
