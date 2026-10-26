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
    "MS-33": "/aset", "MS-34": "/aset/baru", "MS-35": "/aset/mutasi", "MS-36": "/kategori-aset", "MS-39": "/dokumen-aset",
    "MS-37": "/lokasi", "MS-38": "/lokasi/ruangan/[id]",
    "MS-40": "/bahan", "MS-41": "/bahan/baru", "MS-42": "/bahan/[id]", "MS-43": "/kategori-bahan",
    "MS-59": "/kerusakan", "MS-60": "/kerusakan/[id]", "MS-61": "/work-order", "MS-62": "/work-order/baru",
    "MS-63": "/jadwal-pemeliharaan", "MS-64": "/jadwal-pemeliharaan/[id]", "MS-65": "/opname/baru", "MS-66": "/opname/[id]/rekonsiliasi",
    "MS-67": "/pengadaan", "MS-68": "/pengadaan/baru", "MS-69": "/pengadaan/[id]", "MS-70": "/pengadaan/[id]/penerimaan",
    "MS-71": "/penghapusan", "MS-72": "/penghapusan/baru", "MS-73": "/penghapusan/[id]",
    "MS-74": "/analitik", "MS-75": "/analitik/[jenis]",
    "MS-76": "/pengguna", "MS-77": "/pengguna/baru", "MS-78": "/pengguna/[id]", "MS-79": "/pengguna/kenaikan-kelas", "MS-82": "/permintaan-reset-password",
    "MS-80": "/role", "MS-81": "/role/[id]", "MS-83": "/approval-rules", "MS-84": "/approval-rules/[id]",
    "MS-85": "/pengaturan", "MS-86": "/pengaturan/kalender-akademik", "MS-87": "/pengaturan/unit-kerja",
    "MS-44": "/kalender-ruangan", "MS-45": "/katalog-aset", "MS-46": "/reservasi/baru", "MS-47": "/reservasi", "MS-48": "/reservasi/[id]",
};
