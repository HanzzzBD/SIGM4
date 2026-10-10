// Rencana pembatalan reservasi (FR-07.3, BR-024a; PR-03-11, keputusan 15 log phase-03) — logika
// murni atas kelompok pengajuan yang sudah dikunci: baris mana yang dibatalkan dan apakah akarnya
// ikut tertutup. Efeknya (slot, status, instance approval, log, event) milik CancellationService.

import type { StatusReservasi } from "../../../shared/db/index.js";
import type { BarisPengajuan } from "../repositories/reservation.repository.js";

/** FR-07.3 Preconditions: hanya `Menunggu Persetujuan` atau `Disetujui`. */
export const DAPAT_DIBATALKAN: ReadonlySet<StatusReservasi> = new Set(["MENUNGGU_PERSETUJUAN", "DISETUJUI"]);

/** Tanggal turunan yang masih hidup — selama ada satu, induk berulang tidak ikut tertutup. */
const MASIH_BERJALAN: ReadonlySet<StatusReservasi> = new Set(["MENUNGGU_PERSETUJUAN", "DISETUJUI", "BERLANGSUNG"]);

export type RencanaPembatalan =
    | {
          readonly sah: true;
          /** Baris yang berpindah ke `DIBATALKAN` (termasuk akar bila ikut tertutup). */
          readonly dibatalkan: readonly BarisPengajuan[];
          /** Akar pengajuan ikut `DIBATALKAN` — instance approval yang masih berjalan ditutup. */
          readonly akarTertutup: boolean;
      }
    | { readonly sah: false; readonly alasan: string };

/**
 * `targetId` = baris yang diminta: tanggal turunan → tanggal itu saja; induk berulang → seluruh
 * tanggal yang belum dimulai (keputusan 15c); reservasi tunggal → dirinya. Tanggal yang sudah
 * dimulai tak pernah ikut (FR-07.3 A1).
 */
export function rencanakanPembatalan(kelompok: readonly BarisPengajuan[], akarId: string, targetId: string, sekarang: Date): RencanaPembatalan {
    const akar = kelompok.find((b) => b.id === akarId);
    const target = kelompok.find((b) => b.id === targetId);
    if (akar === undefined || target === undefined) return { sah: false, alasan: "Reservasi tidak ditemukan." };
    const turunan = kelompok.filter((b) => b.parent_id !== null);
    const indukBerulang = target.id === akar.id && turunan.length > 0;
    const kandidat = indukBerulang ? turunan : [target];
    const dapat = (b: BarisPengajuan) => DAPAT_DIBATALKAN.has(b.status) && b.waktu_mulai.getTime() > sekarang.getTime();
    const terpilih = kandidat.filter(dapat);

    if (terpilih.length === 0) {
        if (indukBerulang) return { sah: false, alasan: "Tidak ada tanggal reservasi ini yang masih dapat dibatalkan." };
        if (!DAPAT_DIBATALKAN.has(target.status)) return { sah: false, alasan: "Hanya reservasi yang menunggu persetujuan atau sudah disetujui yang dapat dibatalkan." };
        return { sah: false, alasan: "Kegiatan sudah dimulai; reservasi tidak dapat dibatalkan. Petugas dapat menandainya Selesai atau Tidak Digunakan." };
    }

    // Reservasi tunggal: dirinya adalah akarnya. Berulang: akar tertutup bila tak ada tanggal yang tersisa hidup.
    if (turunan.length === 0) return { sah: true, dibatalkan: terpilih, akarTertutup: true };
    const batal = new Set(terpilih.map((b) => b.id));
    const sisa = turunan.filter((b) => !batal.has(b.id) && MASIH_BERJALAN.has(b.status));
    const akarTertutup = sisa.length === 0 && DAPAT_DIBATALKAN.has(akar.status);
    return { sah: true, dibatalkan: akarTertutup ? [akar, ...terpilih] : terpilih, akarTertutup };
}
