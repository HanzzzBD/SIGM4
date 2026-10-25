/**
 * Layar mobile yang route-nya ada di build ini: ID UX §6.11 → path (pola HALAMAN_TERDAFTAR web).
 * Menu (MS-31) dan Aksi Cepat Beranda hanya merender entri yang layarnya terdaftar di sini; paket paritas
 * berikutnya cukup mendaftarkan ID-nya (UXD-20, keputusan paket 1 log phase-07). Dijaga sama dengan rute (diuji).
 */
export const REGISTERED_SCREENS: Readonly<Record<string, string>> = {
    "MS-05": "/", "MS-06": "/tugas", "MS-07": "/scan", "MS-15": "/kerusakan/lapor", "MS-16": "/work-order", "MS-18": "/opname", "MS-20": "/persetujuan", "MS-21": "/chat",
    "MS-29": "/notifikasi", "MS-30": "/profil", "MS-31": "/menu", "MS-32": "/chat/riwayat", "MS-54": "/persetujuan/[id]",
    "MS-24": "/profil/keamanan/aktivasi", "MS-27": "/profil/keamanan", "MS-28": "/profil/notifikasi",
    "MS-12": "/peminjaman", "MS-13": "/peminjaman/[id]/perpanjang", "MS-14": "/denda", "MS-51": "/peminjaman/[id]", "MS-53": "/denda/[id]",
    "MS-10": "/peminjaman/serah-terima/[id]", "MS-11": "/peminjaman/[id]/kembali", "MS-49": "/peminjaman", "MS-50": "/peminjaman/serah-terima", "MS-52": "/denda",
    "MS-55": "/katalog-bahan", "MS-56": "/permintaan-bahan/baru", "MS-57": "/permintaan-bahan", "MS-58": "/permintaan-bahan/[id]",
    "MS-44": "/kalender-ruangan", "MS-45": "/katalog-aset", "MS-46": "/reservasi/baru", "MS-47": "/reservasi", "MS-48": "/reservasi/[id]",
};
