// Template impor pengguna yang diunduh dari P-62 (Lampiran E.5.2, IMPT-05). Dibangkitkan di
// proses API agar tidak bergantung pada berkas docs/ di image produksi. Urutan kolom dijaga
// sama dengan tabel E.5.2 PRD oleh uji; sheet pertama — yang dibaca impor — HANYA header.

import ExcelJS from "exceljs";

/** Kolom E.5.2 berurutan; uji membandingkannya dengan tabel PRD. */
export const KOLOM_TEMPLAT_PENGGUNA = [
    "nama_lengkap",
    "email",
    "nip_nis",
    "kode_role",
    "kode_unit_kerja",
    "kelas",
    "telepon",
    "consent_wali",
] as const;

type Kolom = (typeof KOLOM_TEMPLAT_PENGGUNA)[number];

/** Contoh fiktif berdomain `.example`, sengaja di sheet yang TIDAK diimpor. */
const CONTOH: readonly Readonly<Record<Kolom, string>>[] = [
    { nama_lengkap: "Contoh Guru", email: "guru.contoh@sekolah.example", nip_nis: "198001012005011001", kode_role: "R-05", kode_unit_kerja: "MAPEL-MTK", kelas: "", telepon: "081234567890", consent_wali: "" },
    { nama_lengkap: "Contoh Staf TU", email: "staf.contoh@sekolah.example", nip_nis: "199002022015012002", kode_role: "R-06", kode_unit_kerja: "TU-01", kelas: "", telepon: "", consent_wali: "" },
    { nama_lengkap: "Contoh Siswa", email: "siswa.contoh@sekolah.example", nip_nis: "0012345678", kode_role: "R-07", kode_unit_kerja: "KELAS-X1", kelas: "X-1", telepon: "", consent_wali: "true" },
];

const PETUNJUK = [
    "Isi HANYA sheet \"Pengguna\" (sheet pertama). Sheet \"Petunjuk\" dan \"Contoh\" tidak diimpor.",
    "Aturan tiap kolom mengikuti Lampiran E.5.2; kode_role dan kode_unit_kerja harus sudah ada di master.",
    "Siswa/OSIS wajib consent_wali = true (persetujuan wali sudah dikumpulkan sekolah).",
    "Kolom kelas belum dibaca impor; kelas siswa diatur lewat Kenaikan Kelas Massal.",
    "Berkas lebih dari 200 baris diproses di latar belakang; hasilnya tampil pada laporan impor.",
];

export async function userImportTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const pengguna = wb.addWorksheet("Pengguna");
    pengguna.addRow([...KOLOM_TEMPLAT_PENGGUNA]).font = { bold: true };
    // Sel teks (@): NIP/NIS ber-nol di depan tidak diubah Excel menjadi angka.
    pengguna.columns.forEach((c) => {
        c.numFmt = "@";
        c.width = 22;
    });
    const petunjuk = wb.addWorksheet("Petunjuk");
    for (const baris of PETUNJUK) petunjuk.addRow([baris]);
    petunjuk.getColumn(1).width = 100;
    const contoh = wb.addWorksheet("Contoh");
    contoh.addRow([...KOLOM_TEMPLAT_PENGGUNA]).font = { bold: true };
    for (const b of CONTOH) contoh.addRow(KOLOM_TEMPLAT_PENGGUNA.map((k) => b[k]));
    contoh.columns.forEach((c) => {
        c.numFmt = "@";
        c.width = 22;
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
}
