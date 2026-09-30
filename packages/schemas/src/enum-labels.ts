// Peta kode teknis → label Bahasa Indonesia untuk enum PRD Bab 11.3 (SDD-FE-08,
// SDD-REPO-05, SDD-DB-02). Kode tidak pernah ditampilkan mentah; label mengikuti
// `data-model.md` Bab 11.3 kata per kata. Kelompok ditambahkan saat layar pertama
// yang merendernya lahir.

/** Bab 11.3 "Kondisi Aset". */
export const LABEL_KONDISI_ASET = {
    BAIK: "Baik",
    RUSAK_RINGAN: "Rusak Ringan",
    RUSAK_BERAT: "Rusak Berat",
    HILANG: "Hilang",
} as const;

/** Bab 11.3 "Status Aset". */
export const LABEL_STATUS_ASET = {
    TERSEDIA: "Tersedia",
    DIRESERVASI: "Direservasi",
    DIPINJAM: "Dipinjam",
    DALAM_PERBAIKAN: "Dalam Perbaikan",
    TIDAK_TERSEDIA: "Tidak Tersedia",
} as const;

/** Bab 11.3 "Status Instance Approval". */
export const LABEL_STATUS_INSTANCE_APPROVAL = {
    MENUNGGU: "Menunggu",
    DISETUJUI: "Disetujui",
    DITOLAK: "Ditolak",
    PERLU_REVISI: "Perlu Revisi",
    DIBATALKAN: "Dibatalkan",
} as const;

/** Bab 11.3 "Jenis Pengajuan (Approval)". */
export const LABEL_JENIS_PENGAJUAN = {
    RESERVASI_RUANGAN: "Reservasi Ruangan",
    RESERVASI_ASET: "Reservasi Aset",
    PERPANJANGAN_PEMINJAMAN: "Perpanjangan Peminjaman",
    PENGADAAN_BARANG: "Pengadaan Barang",
    PENGHAPUSAN_ASET: "Penghapusan Aset",
    PERMINTAAN_BAHAN: "Permintaan Bahan",
} as const;

/** Label kode enum; kode tak dikenal tidak pernah dirender mentah (SDD-FE-08). */
export function labelEnum(peta: Readonly<Record<string, string>>, kode: string): string {
    return peta[kode] ?? "Tidak diketahui";
}
