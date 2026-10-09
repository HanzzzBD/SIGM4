// Kontrak `GET /rooms/availability` (FR-07.1, AV-01…AV-05, CAL-UI-01…09; PR-03-09, keputusan 12
// log phase-03). Satu definisi Zod bagi API (validasi + OpenAPI) dan web (parse respons).
import { z } from "zod";

/** Keputusan 12d: satu permintaan mencakup grid bulanan 6 minggu. */
export const RENTANG_KETERSEDIAAN_MAKS_HARI = 42;

const HARI_MS = 86_400_000;
const id = z.coerce.number({ error: "Harus bilangan bulat positif." }).int({ error: "Harus bilangan bulat positif." }).positive({ error: "Harus bilangan bulat positif." }).safe();
const WAKTU = { offset: true, error: "Waktu harus berformat ISO-8601 dengan zona waktu." } as const;

export const RoomAvailabilityQuerySchema = z
    .object({
        dari: z.iso.datetime(WAKTU),
        sampai: z.iso.datetime(WAKTU),
        gedung_id: id.optional(),
        jenis: z.enum(["KELAS", "LABORATORIUM", "AULA", "PERPUSTAKAAN", "KANTOR", "GUDANG", "LAPANGAN", "LAINNYA"], { error: "Jenis ruangan tidak dikenal." }).optional(),
        kapasitas_min: id.optional(),
    })
    .superRefine((q, ctx) => {
        const rentang = Date.parse(q.sampai) - Date.parse(q.dari);
        if (!(rentang > 0)) ctx.addIssue({ code: "custom", path: ["sampai"], message: "Waktu akhir harus sesudah waktu awal." });
        else if (rentang > RENTANG_KETERSEDIAAN_MAKS_HARI * HARI_MS)
            ctx.addIssue({ code: "custom", path: ["sampai"], message: `Rentang paling lama ${RENTANG_KETERSEDIAAN_MAKS_HARI} hari.` });
    });

/**
 * Lima keadaan slot (CAL-UI-05) tanpa "Kosong" — kosong adalah ketiadaan slot. Libur dan di luar
 * jam operasional tidak dikirim per slot: klien menurunkannya dari `hari_libur` dan `jam_operasional`.
 */
export const KEADAAN_SLOT = ["MENUNGGU_PERSETUJUAN", "DISETUJUI", "JADWAL_TETAP", "PEMELIHARAAN"] as const;
export type KeadaanSlot = (typeof KEADAAN_SLOT)[number];

export const LABEL_KEADAAN_SLOT: Readonly<Record<KeadaanSlot | "KOSONG" | "LIBUR" | "TUTUP" | "TERPAKAI", string>> = {
    KOSONG: "Kosong",
    MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan",
    DISETUJUI: "Disetujui",
    JADWAL_TETAP: "Jadwal Tetap",
    PEMELIHARAAN: "Dalam Pemeliharaan",
    LIBUR: "Libur",
    TUTUP: "Di luar jam operasional",
    TERPAKAI: "Terpakai",
};

const Ruangan = z.object({
    id: z.string(),
    kode: z.string(),
    nama: z.string(),
    jenis: z.string(),
    kapasitas: z.number().int().nullable(),
    gedung: z.object({ id: z.string(), nama: z.string() }),
});

const Slot = z.object({
    ruangan_id: z.string(),
    mulai: z.iso.datetime({ offset: true }),
    selesai: z.iso.datetime({ offset: true }),
    keadaan: z.enum(KEADAAN_SLOT),
    /** Nama kegiatan; `null` bagi scope `restricted` (FR-07.1 A1) dan blokade tanpa label. */
    label: z.string().nullable(),
    /** Rincian pengajuan; `null` bagi scope `restricted` dan slot non-reservasi. */
    reservasi: z.object({ id: z.string(), nomor: z.string(), pemohon: z.string() }).nullable(),
});

export const RoomAvailabilitySchema = z.object({
    dari: z.iso.datetime({ offset: true }),
    sampai: z.iso.datetime({ offset: true }),
    zona_waktu: z.literal("Asia/Jakarta"),
    granularitas_menit: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    /** `hari` ISO 1 = Senin … 7 = Minggu; jam WIB `HH:MM` (FR-07.1 A3). */
    jam_operasional: z.object({ hari: z.array(z.number().int().min(1).max(7)), mulai: z.string(), selesai: z.string() }),
    hari_libur: z.array(z.object({ tanggal: z.iso.date(), nama: z.string() })),
    ruangan: z.array(Ruangan),
    slot: z.array(Slot),
});

export const RoomAvailabilityResponseSchema = z.object({ success: z.literal(true), data: RoomAvailabilitySchema, meta: z.null() });

export type RoomAvailability = z.infer<typeof RoomAvailabilitySchema>;
export type SlotKetersediaan = z.infer<typeof Slot>;
export type RuanganKetersediaan = z.infer<typeof Ruangan>;
