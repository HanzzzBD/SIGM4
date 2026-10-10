// Logika murni wizard P-29 (FR-07.2, UX §7.6.2; PR-03-10): isian → body kontrak bersama,
// saran slot alternatif terdekat (FR-07.2 A1) dan ruangan berkapasitas cukup (A2) dari data
// ketersediaan yang SAMA dengan kalender P-27. Seluruh waktu WIB.
import type { RoomAvailability, RoomReservationBody, RuanganKetersediaan } from "@sigm4/schemas";
import { keadaanHari, kolomHarian, slotBeririsan, tanggalWib, tengahMalamWib } from "./kalender";

const MENIT_MS = 60_000;

export interface IsianWizard {
    readonly ruangan: string;
    readonly tanggal: string;
    /** Jam WIB `HH:MM`. */
    readonly mulai: string;
    readonly selesai: string;
    readonly nama_kegiatan: string;
    readonly jenis_kegiatan: string;
    readonly jumlah_peserta: string;
    readonly keperluan: string;
    readonly kebutuhan_tambahan: string;
    readonly keterangan: string;
    readonly berulang: boolean;
    /** ISO 1 = Senin … 7 = Minggu. */
    readonly hari: readonly number[];
    readonly sampai: string;
    readonly lewati: readonly string[];
}

export const ISIAN_KOSONG: IsianWizard = {
    ruangan: "",
    tanggal: "",
    mulai: "",
    selesai: "",
    nama_kegiatan: "",
    jenis_kegiatan: "",
    jumlah_peserta: "",
    keperluan: "",
    kebutuhan_tambahan: "",
    keterangan: "",
    berulang: false,
    hari: [],
    sampai: "",
    lewati: [],
};

export const NAMA_HARI: readonly (readonly [number, string])[] = [
    [1, "Senin"],
    [2, "Selasa"],
    [3, "Rabu"],
    [4, "Kamis"],
    [5, "Jumat"],
    [6, "Sabtu"],
    [7, "Minggu"],
];

/** `HH:MM` WIB tanggal itu → instan. */
export const waktuWib = (tanggal: string, jam: string): Date => new Date(tengahMalamWib(tanggal).getTime() + (Number(jam.slice(0, 2)) * 60 + Number(jam.slice(3, 5))) * MENIT_MS);

/** `HH:MM` WIB dari instan. */
export const jamDari = (d: Date): string => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(11, 16);

/** Isian awal dari slot terpilih kalender (UX F-09 "slot terisi otomatis"). */
export function isianDariSlot(ruangan: string | undefined, mulai: string | undefined, selesai: string | undefined): IsianWizard {
    const m = mulai === undefined ? undefined : new Date(mulai);
    const s = selesai === undefined ? undefined : new Date(selesai);
    const sah = (d: Date | undefined): d is Date => d !== undefined && !Number.isNaN(d.getTime());
    return {
        ...ISIAN_KOSONG,
        ruangan: ruangan ?? "",
        tanggal: sah(m) ? tanggalWib(m) : "",
        mulai: sah(m) ? jamDari(m) : "",
        selesai: sah(s) ? jamDari(s) : "",
    };
}

/** Body `POST /reservations` (+ `/preview`). Validasi tetap milik skema bersama (SDD-FE-05). */
export function bodyDari(i: IsianWizard): RoomReservationBody {
    const teks = (v: string) => (v.trim() === "" ? null : v.trim());
    return {
        room_id: Number(i.ruangan),
        waktu_mulai: waktuWib(i.tanggal, i.mulai).toISOString(),
        waktu_selesai: waktuWib(i.tanggal, i.selesai).toISOString(),
        nama_kegiatan: i.nama_kegiatan,
        jenis_kegiatan: i.jenis_kegiatan,
        jumlah_peserta: i.jumlah_peserta.trim() === "" ? Number.NaN : Number(i.jumlah_peserta),
        keperluan: teks(i.keperluan),
        kebutuhan_tambahan: teks(i.kebutuhan_tambahan),
        keterangan: teks(i.keterangan),
        ...(i.berulang ? { pengulangan: { hari: [...i.hari].sort((a, b) => a - b), sampai: i.sampai }, lewati: [...i.lewati].sort() } : {}),
    };
}

/** Pilihan jam mulai & selesai: batas kolom granularitas di dalam jam operasional (CAL-UI-02). */
export function opsiJam(tanggal: string, data: Pick<RoomAvailability, "granularitas_menit" | "jam_operasional">): { readonly mulai: readonly string[]; readonly selesai: readonly string[] } {
    const kolom = kolomHarian(tanggal, data);
    return { mulai: kolom.map((k) => jamDari(k.mulai)), selesai: kolom.map((k) => jamDari(k.selesai)) };
}

/**
 * Pemeriksaan langkah 1 yang dapat dijawab data kalender: hari libur/bukan hari kerja dan bentrok.
 * Aturan lain (H-1, horizon) diputus server lewat pratinjau — klien tak menebak parameternya.
 */
export function masalahWaktu(data: RoomAvailability, i: IsianWizard): string | null {
    const hari = keadaanHari(i.tanggal, data);
    if (hari !== null) return hari.keadaan === "LIBUR" ? `Tanggal ini hari libur: ${hari.label}.` : "Tanggal ini bukan hari kerja sekolah.";
    if (slotBeririsan(data.slot, i.ruangan, waktuWib(i.tanggal, i.mulai), waktuWib(i.tanggal, i.selesai)).length > 0) return "Ruangan sudah terpakai pada rentang ini.";
    return null;
}

/**
 * FR-07.2 A1: slot kosong TERDEKAT berdurasi sama di ruangan yang sama dan hari yang sama —
 * kandidat mulai pada tiap batas granularitas, diurutkan menurut jarak dari mulai yang diminta.
 */
export function saranSlot(data: RoomAvailability, ruangan: string, tanggal: string, mulai: string, selesai: string): { readonly mulai: string; readonly selesai: string } | null {
    if (keadaanHari(tanggal, data) !== null) return null;
    const diminta = waktuWib(tanggal, mulai).getTime();
    const durasi = waktuWib(tanggal, selesai).getTime() - diminta;
    const tutup = waktuWib(tanggal, data.jam_operasional.selesai).getTime();
    const kandidat = kolomHarian(tanggal, data)
        .map((k) => k.mulai.getTime())
        .filter((m) => m !== diminta && m + durasi <= tutup && slotBeririsan(data.slot, ruangan, new Date(m), new Date(m + durasi)).length === 0)
        .sort((a, b) => Math.abs(a - diminta) - Math.abs(b - diminta) || a - b);
    const [terbaik] = kandidat;
    return terbaik === undefined ? null : { mulai: jamDari(new Date(terbaik)), selesai: jamDari(new Date(terbaik + durasi)) };
}

/** FR-07.2 A2: ruangan lain yang menampung peserta dan kosong pada rentang yang sama. */
export function ruanganCukup(data: RoomAvailability, i: IsianWizard, peserta: number): readonly RuanganKetersediaan[] {
    const m = waktuWib(i.tanggal, i.mulai);
    const s = waktuWib(i.tanggal, i.selesai);
    return data.ruangan
        .filter((r) => r.id !== i.ruangan && r.kapasitas !== null && r.kapasitas >= peserta && slotBeririsan(data.slot, r.id, m, s).length === 0)
        .sort((a, b) => (a.kapasitas ?? 0) - (b.kapasitas ?? 0))
        .slice(0, 3);
}
