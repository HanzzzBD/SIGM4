// Logika murni blokade ruangan (FR-07.5; PR-03-13, keputusan 19 log phase-03): validasi isian dan
// penjabaran aturan mingguan menjadi kemunculan dalam horizon. Tanpa basis data — efeknya milik
// BlockService. Seluruh waktu WIB (UTC+7).

import { hariIso, tambahHari, tengahMalamWib } from "./schedule.js";

const MENIT_MS = 60_000;

export interface AturanMingguan {
    /** ISO 1 = Senin … 7 = Minggu. */
    readonly hari: readonly number[];
    /** `HH:MM` WIB. */
    readonly jamMulai: string;
    readonly jamSelesai: string;
    /** `YYYY-MM-DD`, inklusif. */
    readonly berlakuMulai: string;
    readonly berlakuSampai: string;
}

export interface KemunculanBlokade {
    readonly tanggal: string;
    readonly hari: number;
    readonly mulai: Date;
    readonly selesai: Date;
}

export const menitDariJam = (jam: string): number => Number(jam.slice(0, 2)) * 60 + Number(jam.slice(3, 5));
const instanWib = (tanggal: string, jam: string): Date => new Date(tengahMalamWib(tanggal).getTime() + menitDariJam(jam) * MENIT_MS);

/**
 * Kemunculan aturan pada `[dari, sampai]` (tanggal WIB inklusif) yang beririsan masa berlakunya.
 * Hari libur dilewati dan dilaporkan (FR-07.5 A4) — tak pernah menjadi slot.
 */
export function jabarkanAturan(a: AturanMingguan, dari: string, sampai: string, libur: ReadonlyMap<string, string>): { readonly kemunculan: readonly KemunculanBlokade[]; readonly dilewati: readonly { readonly tanggal: string; readonly alasan: string }[] } {
    const awal = a.berlakuMulai > dari ? a.berlakuMulai : dari;
    const akhir = a.berlakuSampai < sampai ? a.berlakuSampai : sampai;
    const kemunculan: KemunculanBlokade[] = [];
    const dilewati: { tanggal: string; alasan: string }[] = [];
    for (let t = awal; t <= akhir; t = tambahHari(t, 1)) {
        const h = hariIso(t);
        if (!a.hari.includes(h)) continue;
        const namaLibur = libur.get(t);
        if (namaLibur !== undefined) {
            dilewati.push({ tanggal: t, alasan: `Hari libur: ${namaLibur}.` });
            continue;
        }
        kemunculan.push({ tanggal: t, hari: h, mulai: instanWib(t, a.jamMulai), selesai: instanWib(t, a.jamSelesai) });
    }
    return { kemunculan, dilewati };
}

export interface KonteksValidasi {
    readonly hariIni: string;
    readonly sekarang: Date;
    readonly horizonHari: number;
    readonly granularitasMenit: number;
    /** Menit sejak 00.00 WIB. */
    readonly jamOperasional: { readonly mulai: number; readonly selesai: number };
    readonly hariKerja: ReadonlySet<number>;
    /** Tahun ajaran aktif (E.5.3: masa berlaku di dalamnya); `null` bila belum ditetapkan. */
    readonly tahunAjaran: { readonly mulai: string; readonly akhir: string } | null;
}

export interface GalatIsian {
    readonly field: string;
    readonly message: string;
}

const jamTeks = (menit: number) => `${String(Math.floor(menit / 60)).padStart(2, "0")}.${String(menit % 60).padStart(2, "0")}`;

/** Keputusan 19g: jadwal tetap di jam operasional, sejajar granularitas, hari kerja, di dalam tahun ajaran aktif. */
export function galatAturanMingguan(a: AturanMingguan, k: KonteksValidasi): readonly GalatIsian[] {
    const galat: GalatIsian[] = [];
    const m = menitDariJam(a.jamMulai);
    const s = menitDariJam(a.jamSelesai);
    if (!(m < s)) galat.push({ field: "jam_selesai", message: "Jam selesai harus sesudah jam mulai." });
    if (m < k.jamOperasional.mulai || s > k.jamOperasional.selesai)
        galat.push({ field: "jam_mulai", message: `Jadwal tetap harus di dalam jam operasional sekolah (${jamTeks(k.jamOperasional.mulai)}–${jamTeks(k.jamOperasional.selesai)} WIB).` });
    if (m % k.granularitasMenit !== 0 || s % k.granularitasMenit !== 0) galat.push({ field: "jam_mulai", message: `Jam harus kelipatan ${String(k.granularitasMenit)} menit.` });
    const bukanKerja = a.hari.filter((h) => !k.hariKerja.has(h));
    if (bukanKerja.length > 0) galat.push({ field: "hari", message: "Hari yang dipilih harus hari kerja sekolah." });
    if (a.berlakuSampai < a.berlakuMulai) galat.push({ field: "berlaku_sampai", message: "Tanggal akhir berlaku harus sama atau sesudah tanggal mulai." });
    else if (a.berlakuSampai < k.hariIni) galat.push({ field: "berlaku_sampai", message: "Masa berlaku sudah lewat." });
    if (k.tahunAjaran === null) galat.push({ field: "berlaku_mulai", message: "Tahun ajaran aktif belum ditetapkan; jadwal tetap berlaku di dalam tahun ajaran aktif." });
    else if (a.berlakuMulai < k.tahunAjaran.mulai || a.berlakuSampai > k.tahunAjaran.akhir)
        galat.push({ field: "berlaku_mulai", message: `Masa berlaku harus di dalam tahun ajaran aktif (${k.tahunAjaran.mulai} s.d. ${k.tahunAjaran.akhir}).` });
    return galat;
}

/** Keputusan 19g: blokade manual rentang bebas, belum berakhir, paling panjang sepanjang horizon. */
export function galatBlokadeManual(mulai: Date, selesai: Date, k: KonteksValidasi): readonly GalatIsian[] {
    const galat: GalatIsian[] = [];
    if (!(mulai < selesai)) galat.push({ field: "selesai", message: "Waktu selesai harus sesudah waktu mulai." });
    else if (selesai <= k.sekarang) galat.push({ field: "selesai", message: "Rentang blokade sudah lewat." });
    if (selesai.getTime() - mulai.getTime() > k.horizonHari * 86_400_000) galat.push({ field: "selesai", message: `Blokade manual paling panjang ${String(k.horizonHari)} hari (horizon pemesanan).` });
    return galat;
}
