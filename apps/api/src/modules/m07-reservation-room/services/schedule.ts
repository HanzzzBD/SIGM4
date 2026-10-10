// Aritmetika jadwal pengajuan reservasi ruangan (FR-07.2; PR-03-10, keputusan 14 log phase-03).
// Fungsi MURNI dalam WIB (CAL-03): penjabaran pola berulang (BR-024a A4), keabsahan tiap tanggal
// (BR-018, BR-020, BR-023c, CAL-UI-02), dan TTL slot tentatif (BR-023b). Waktu "kini" selalu
// diterima dari Clock pemanggil (SDD-SYS-07).

import type { OperatingHours } from "../../../shared/calendar/index.js";

const WIB_MS = 7 * 3_600_000;
const HARI_MS = 86_400_000;
const JAM_MS = 3_600_000;
const MENIT_MS = 60_000;

/** Pagar teknis penjabaran: horizon maksimum 365 hari (seed 0015) × 7 hari seminggu tak melampauinya. */
const KEMUNCULAN_MAKS = 400;

export interface Kemunculan {
    /** Tanggal WIB `YYYY-MM-DD`. */
    readonly tanggal: string;
    readonly mulai: Date;
    readonly selesai: Date;
}

export interface PolaMingguan {
    /** ISO 1 = Senin … 7 = Minggu. */
    readonly hari: readonly number[];
    /** Tanggal WIB terakhir, inklusif. */
    readonly sampai: string;
}

/** Bahan keabsahan satu tanggal — dibaca sekali per pengajuan. */
export interface AturanJadwal {
    readonly sekarang: Date;
    readonly jam: OperatingHours;
    /** ISO 1 = Senin … 7 = Minggu (`work_days`). */
    readonly hariKerja: ReadonlySet<number>;
    /** Tanggal WIB → nama hari libur (Lampiran E). */
    readonly libur: ReadonlyMap<string, string>;
    readonly granularitasMenit: number;
    /** BR-020 dalam hari kalender WIB (keputusan 14c). */
    readonly jarakMinimumHari: number;
    /** Pemegang `reservation.urgent` dibebaskan dari BR-020 — tidak dari aturan lain. */
    readonly mendesak: boolean;
    /** BR-023c / AV-05. */
    readonly horizonHari: number;
}

export function tanggalWib(instan: Date): string {
    return new Date(instan.getTime() + WIB_MS).toISOString().slice(0, 10);
}

/** Tengah malam WIB tanggal itu, sebagai instan UTC. */
export function tengahMalamWib(tanggal: string): Date {
    return new Date(Date.parse(`${tanggal}T00:00:00Z`) - WIB_MS);
}

export function tambahHari(tanggal: string, n: number): string {
    return new Date(Date.parse(`${tanggal}T00:00:00Z`) + n * HARI_MS).toISOString().slice(0, 10);
}

function hariIso(tanggal: string): number {
    const h = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
    return h === 0 ? 7 : h;
}

/** Menit sejak tengah malam WIB tanggal `tanggal` (dapat ≥ 1440 bila melewati hari). */
function menitDari(tanggal: string, instan: Date): number {
    return (instan.getTime() - tengahMalamWib(tanggal).getTime()) / MENIT_MS;
}

export function jamTeks(menit: number): string {
    return `${String(Math.floor(menit / 60)).padStart(2, "0")}:${String(menit % 60).padStart(2, "0")}`;
}

/**
 * BR-024a A4 (keputusan 14g): tanpa pola = satu kemunculan; dengan pola = setiap tanggal WIB dari
 * tanggal `mulai` sampai `pola.sampai` yang harinya ada di `pola.hari`, pada jam yang sama.
 */
export function jabarkan(mulai: Date, selesai: Date, pola?: PolaMingguan): readonly Kemunculan[] {
    const awal = tanggalWib(mulai);
    if (pola === undefined) return [{ tanggal: awal, mulai, selesai }];
    const geser = mulai.getTime() - tengahMalamWib(awal).getTime();
    const durasi = selesai.getTime() - mulai.getTime();
    const hasil: Kemunculan[] = [];
    for (let t = awal; t <= pola.sampai && hasil.length < KEMUNCULAN_MAKS; t = tambahHari(t, 1)) {
        if (!pola.hari.includes(hariIso(t))) continue;
        const m = new Date(tengahMalamWib(t).getTime() + geser);
        hasil.push({ tanggal: t, mulai: m, selesai: new Date(m.getTime() + durasi) });
    }
    return hasil;
}

/** Alasan sebuah tanggal tidak dapat diajukan, atau `null` bila sah. Urutan = urutan yang paling menjelaskan. */
export function alasanTidakSah(k: Kemunculan, a: AturanJadwal): string | null {
    if (k.mulai.getTime() <= a.sekarang.getTime()) return "Waktu mulai sudah lewat.";
    const hariIni = tanggalWib(a.sekarang);
    // BR-023c / AV-05: tanggal terakhir yang boleh dipesan = hari ini + horizon.
    if (k.tanggal > tambahHari(hariIni, a.horizonHari)) return `Melewati horizon pemesanan ${String(a.horizonHari)} hari.`;
    // BR-020 (keputusan 14c): tanggal mulai ≥ hari ini + n hari kalender WIB, kecuali `reservation.urgent`.
    if (!a.mendesak && k.tanggal < tambahHari(hariIni, a.jarakMinimumHari)) return `Pengajuan paling lambat H-${String(a.jarakMinimumHari)}.`;
    const libur = a.libur.get(k.tanggal);
    if (libur !== undefined) return `Hari libur: ${libur}.`;
    if (!a.hariKerja.has(hariIso(k.tanggal))) return "Bukan hari kerja sekolah.";
    // BR-018: seluruh rentang di dalam jam operasional hari itu (tak melewati tengah malam).
    const m = menitDari(k.tanggal, k.mulai);
    const s = menitDari(k.tanggal, k.selesai);
    if (m < a.jam.startMinute || s > a.jam.endMinute) {
        return `Di luar jam operasional (${jamTeks(a.jam.startMinute)}–${jamTeks(a.jam.endMinute)} WIB).`;
    }
    // CAL-UI-02: batas slot sejajar granularitas kalender.
    if (!Number.isInteger(m) || !Number.isInteger(s) || m % a.granularitasMenit !== 0 || s % a.granularitasMenit !== 0) {
        return `Jam mulai dan selesai harus kelipatan ${String(a.granularitasMenit)} menit.`;
    }
    return null;
}

/**
 * BR-023b (keputusan 14i): TTL = yang lebih dulu antara `sekarang + ttlJam` dan akhir H-1 (00.00 WIB
 * tanggal mulai pertama). Pengajuan mendesak hari yang sama — akhir H-1 sudah lewat — dibatasi
 * waktu mulainya sendiri.
 */
export function kedaluwarsaTentatif(sekarang: Date, ttlJam: number, mulaiPertama: Date): Date {
    const ttl = sekarang.getTime() + ttlJam * JAM_MS;
    const akhirH1 = tengahMalamWib(tanggalWib(mulaiPertama)).getTime();
    const batas = akhirH1 > sekarang.getTime() ? akhirH1 : mulaiPertama.getTime();
    return new Date(Math.min(ttl, batas));
}
