/**
 * Layar mobile yang route-nya ada di build ini: ID UX §6.11 → path (pola HALAMAN_TERDAFTAR web).
 * Menu (MS-31) dan Aksi Cepat Beranda hanya merender entri yang layarnya terdaftar di sini; paket paritas
 * berikutnya cukup mendaftarkan ID-nya (UXD-20, keputusan paket 1 log phase-07). Dijaga sama dengan rute (diuji).
 */
export const REGISTERED_SCREENS: Readonly<Record<string, string>> = {
    "MS-05": "/", "MS-06": "/tugas", "MS-07": "/scan", "MS-15": "/kerusakan/lapor", "MS-16": "/work-order", "MS-18": "/opname", "MS-20": "/persetujuan", "MS-21": "/chat",
    "MS-29": "/notifikasi", "MS-30": "/profil", "MS-31": "/menu", "MS-32": "/chat/riwayat", "MS-54": "/persetujuan/[id]",
};
