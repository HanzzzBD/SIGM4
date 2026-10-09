// Logika murni P-27 / C-24 (FR-07.1, CAL-UI-01/02/05/06/09): rentang tiap tampilan, kolom slot, dan
// keadaan sel. Seluruh aritmetika tanggal di WIB (UTC+7, tanpa DST) — tidak pernah zona perangkat.

import type { KeadaanSlot, RoomAvailability, SlotKetersediaan } from "@sigm4/schemas";

export type Tampilan = "harian" | "mingguan" | "bulanan";
export const TAMPILAN: readonly Tampilan[] = ["harian", "mingguan", "bulanan"];

const WIB_MS = 7 * 3_600_000;
const HARI_MS = 86_400_000;
const MENIT_MS = 60_000;

/** `YYYY-MM-DD` WIB → instan tengah malam WIB. */
export const tengahMalamWib = (tanggal: string): Date => new Date(Date.parse(`${tanggal}T00:00:00Z`) - WIB_MS);
/** Instan → tanggal WIB `YYYY-MM-DD`. */
export const tanggalWib = (t: Date | number): string => new Date((typeof t === "number" ? t : t.getTime()) + WIB_MS).toISOString().slice(0, 10);
/** Tanggal WIB hari ini — satu-satunya pembacaan jam perangkat di kalender (CAL-UI-09). */
export const hariIniWib = (): string => tanggalWib(Date.now());
export const geserHari = (tanggal: string, n: number): string => tanggalWib(tengahMalamWib(tanggal).getTime() + n * HARI_MS);
/** ISO 1 = Senin … 7 = Minggu. */
export const hariIso = (tanggal: string): number => {
    const h = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
    return h === 0 ? 7 : h;
};
const awalMinggu = (tanggal: string) => geserHari(tanggal, 1 - hariIso(tanggal));

/**
 * Rentang permintaan per tampilan (CAL-UI-01): harian satu hari, mingguan Senin–Minggu, bulanan
 * grid 6 minggu mulai Senin (42 hari = batas API, keputusan 12d).
 */
export function rentangTampilan(tampilan: Tampilan, tanggal: string): { readonly dari: string; readonly sampai: string; readonly hari: readonly string[] } {
    const mulai = tampilan === "harian" ? tanggal : tampilan === "mingguan" ? awalMinggu(tanggal) : awalMinggu(`${tanggal.slice(0, 8)}01`);
    const jumlah = tampilan === "harian" ? 1 : tampilan === "mingguan" ? 7 : 42;
    const hari = Array.from({ length: jumlah }, (_, i) => geserHari(mulai, i));
    return { dari: tengahMalamWib(mulai).toISOString(), sampai: tengahMalamWib(geserHari(mulai, jumlah)).toISOString(), hari };
}

/** Langkah navigasi Sebelumnya/Berikutnya. */
export function geserTampilan(tampilan: Tampilan, tanggal: string, arah: -1 | 1): string {
    if (tampilan === "harian") return geserHari(tanggal, arah);
    if (tampilan === "mingguan") return geserHari(tanggal, 7 * arah);
    const [th, bl] = tanggal.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(th, bl - 1 + arah, 1));
    return d.toISOString().slice(0, 10);
}

const keMenit = (jam: string) => Number(jam.slice(0, 2)) * 60 + Number(jam.slice(3, 5));
const jamTeks = (menit: number) => `${String(Math.floor(menit / 60)).padStart(2, "0")}.${String(menit % 60).padStart(2, "0")}`;

export interface Kolom {
    readonly mulai: Date;
    readonly selesai: Date;
    /** `HH.MM` WIB. */
    readonly label: string;
    /** Batas jam penuh — border lebih tegas (C-24). */
    readonly awalJam: boolean;
}

/** Kolom slot satu hari pada jam operasional, selebar granularitas (CAL-UI-02, FR-07.1 A3). */
export function kolomHarian(tanggal: string, data: Pick<RoomAvailability, "granularitas_menit" | "jam_operasional">): readonly Kolom[] {
    const awal = tengahMalamWib(tanggal).getTime();
    const kolom: Kolom[] = [];
    for (let m = keMenit(data.jam_operasional.mulai); m + data.granularitas_menit <= keMenit(data.jam_operasional.selesai); m += data.granularitas_menit) {
        kolom.push({ mulai: new Date(awal + m * MENIT_MS), selesai: new Date(awal + (m + data.granularitas_menit) * MENIT_MS), label: jamTeks(m), awalJam: m % 60 === 0 });
    }
    return kolom;
}

export type KeadaanSel = KeadaanSlot | "KOSONG" | "LIBUR" | "TUTUP";

export interface Sel {
    readonly keadaan: KeadaanSel;
    readonly label: string | null;
    readonly slot: SlotKetersediaan | null;
}

/** Hari libur (FR-07.1 A5) atau bukan hari kerja (A3) — berlaku seharian. */
export function keadaanHari(tanggal: string, data: Pick<RoomAvailability, "hari_libur" | "jam_operasional">): { readonly keadaan: "LIBUR" | "TUTUP"; readonly label: string } | null {
    const libur = data.hari_libur.find((h) => h.tanggal === tanggal);
    if (libur !== undefined) return { keadaan: "LIBUR", label: libur.nama };
    if (!data.jam_operasional.hari.includes(hariIso(tanggal))) return { keadaan: "TUTUP", label: "Bukan hari kerja" };
    return null;
}

/** Slot ruangan yang beririsan `[mulai, selesai)` (SDD-AVL-02). */
export const slotBeririsan = (slot: readonly SlotKetersediaan[], ruanganId: string, mulai: Date, selesai: Date): readonly SlotKetersediaan[] =>
    slot.filter((s) => s.ruangan_id === ruanganId && Date.parse(s.mulai) < selesai.getTime() && Date.parse(s.selesai) > mulai.getTime());

/** Keadaan satu sel (CAL-UI-05): slot terpakai mengalahkan libur — ia tetap tercatat. */
export function keadaanSel(data: RoomAvailability, ruanganId: string, kolom: Kolom): Sel {
    const [slot] = slotBeririsan(data.slot, ruanganId, kolom.mulai, kolom.selesai);
    if (slot !== undefined) return { keadaan: slot.keadaan, label: slot.label, slot };
    const hari = keadaanHari(tanggalWib(kolom.mulai), data);
    if (hari !== null) return { keadaan: hari.keadaan, label: hari.label, slot: null };
    return { keadaan: "KOSONG", label: null, slot: null };
}

/** Kepadatan satu hari (tampilan Bulanan): menit terpakai ÷ menit operasional seluruh ruangan. */
export function kepadatanHari(data: RoomAvailability, tanggal: string): number | null {
    if (keadaanHari(tanggal, data) !== null || data.ruangan.length === 0) return null;
    const awal = tengahMalamWib(tanggal).getTime();
    const buka = awal + keMenit(data.jam_operasional.mulai) * MENIT_MS;
    const tutup = awal + keMenit(data.jam_operasional.selesai) * MENIT_MS;
    let terpakai = 0;
    for (const s of data.slot) {
        terpakai += Math.max(0, Math.min(Date.parse(s.selesai), tutup) - Math.max(Date.parse(s.mulai), buka));
    }
    return Math.min(1, terpakai / ((tutup - buka) * data.ruangan.length));
}

/** `HH.MM` WIB sebuah instan ISO. */
export const jamWib = (iso: string): string => jamTeks(Math.round(((Date.parse(iso) + WIB_MS) % HARI_MS) / MENIT_MS));

const FORMAT_TANGGAL = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const FORMAT_PENDEK = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short" });
const FORMAT_BULAN = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", month: "long", year: "numeric" });
export const tanggalPanjang = (tanggal: string) => FORMAT_TANGGAL.format(tengahMalamWib(tanggal));
export const tanggalPendek = (tanggal: string) => FORMAT_PENDEK.format(tengahMalamWib(tanggal));
export const namaBulan = (tanggal: string) => FORMAT_BULAN.format(tengahMalamWib(tanggal));
