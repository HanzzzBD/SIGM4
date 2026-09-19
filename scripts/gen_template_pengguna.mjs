// Membangkitkan template impor pengguna (Lampiran E.5.2, IMPT-05, IMP-02) ke
// docs/IMPLEMENTATION/templates/impor/. Kolomnya DIBACA dari tabel E.5.2 di
// docs/PRD/00-foundation/conventions.md — bukan ditulis ulang di sini — sehingga
// templat tidak dapat menyimpang dari PRD; tests/shared/import-template.test.ts
// menjaga keduanya tetap sinkron.
//
// Pakai:  node scripts/gen_template_pengguna.mjs
//
// Keluaran:
//   template_pengguna.xlsx  sheet 1 "Pengguna" = HANYA header (yang dibaca impor: sheet pertama);
//                           sheet "Petunjuk" = aturan per kolom; sheet "Contoh" = contoh isian
//   template_pengguna.csv   HANYA header, pemisah koma
//   contoh_pengguna.csv     header + contoh isian (terpisah agar contoh tidak ikut terimpor)
// Contoh isian fiktif dan sengaja tidak berada di sheet/berkas yang diimpor.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const AKAR = join(dirname(fileURLToPath(import.meta.url)), "..");
const KELUAR = join(AKAR, "docs", "IMPLEMENTATION", "templates", "impor");

/** Membaca tabel E.5.2: baris `| \`kolom\` | wajib | validasi |`. */
export function bacaKolom() {
    const teks = readFileSync(join(AKAR, "docs/PRD/00-foundation/conventions.md"), "utf8").replace(/\r\n/g, "\n");
    const bagian = teks.split("**E.5.2 Impor Pengguna**")[1]?.split("**E.5.3")[0];
    if (bagian === undefined) throw new Error("Tabel E.5.2 tidak ditemukan di conventions.md");
    const kolom = [];
    for (const baris of bagian.split("\n")) {
        const m = /^\|\s*`([a-z_]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/.exec(baris);
        if (m !== null) kolom.push({ nama: m[1], wajib: m[2], aturan: m[3] });
    }
    if (kolom.length === 0) throw new Error("Tidak ada kolom terbaca dari tabel E.5.2");
    return kolom;
}

const CONTOH = [
    { nama_lengkap: "Contoh Guru", email: "guru.contoh@sekolah.example", nip_nis: "198001012005011001", kode_role: "R-05", kode_unit_kerja: "MAPEL-MTK", kelas: "", telepon: "081234567890", consent_wali: "" },
    { nama_lengkap: "Contoh Staf TU", email: "staf.contoh@sekolah.example", nip_nis: "199002022015012002", kode_role: "R-06", kode_unit_kerja: "TU-01", kelas: "", telepon: "", consent_wali: "" },
    { nama_lengkap: "Contoh Siswa", email: "siswa.contoh@sekolah.example", nip_nis: "0012345678", kode_role: "R-07", kode_unit_kerja: "KELAS-X1", kelas: "X-1", telepon: "", consent_wali: "true" },
];

function csv(kolom, baris) {
    const sel = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
    return [kolom.map((k) => k.nama).join(","), ...baris.map((b) => kolom.map((k) => sel(b[k.nama] ?? "")).join(","))].join("\n") + "\n";
}

async function main() {
    const kolom = bacaKolom();
    mkdirSync(KELUAR, { recursive: true });
    writeFileSync(join(KELUAR, "template_pengguna.csv"), csv(kolom, []), "utf8");
    writeFileSync(join(KELUAR, "contoh_pengguna.csv"), csv(kolom, CONTOH), "utf8");

    const wb = new ExcelJS.Workbook();
    // Sheet pertama = yang dibaca impor: HANYA header. Semua sel bertipe teks (@) agar
    // NIP/NIS ber-angka nol tidak diubah Excel menjadi angka.
    const pengguna = wb.addWorksheet("Pengguna");
    pengguna.addRow(kolom.map((k) => k.nama));
    pengguna.getRow(1).font = { bold: true };
    kolom.forEach((_k, i) => {
        const c = pengguna.getColumn(i + 1);
        c.numFmt = "@";
        c.width = 22;
    });

    const petunjuk = wb.addWorksheet("Petunjuk");
    petunjuk.addRow(["Kolom", "Wajib", "Aturan"]).font = { bold: true };
    for (const k of kolom) petunjuk.addRow([k.nama, k.wajib, k.aturan]);
    petunjuk.addRow([]);
    for (const baris of [
        "Isi HANYA sheet \"Pengguna\" (sheet pertama). Sheet \"Petunjuk\" dan \"Contoh\" tidak diimpor.",
        "kode_unit_kerja dan kode_role harus sudah ada di master sebelum impor.",
        "Kolom kelas belum dibaca impor pada rilis ini; kelas siswa diatur lewat kenaikan kelas.",
        "Berkas lebih dari 200 baris diproses di latar belakang; hasilnya dapat dilihat pada laporan impor.",
        "Bila memakai CSV, simpan dengan pemisah KOMA (bukan titik koma) dan sandi UTF-8.",
    ]) petunjuk.addRow([baris]);
    petunjuk.columns = [{ width: 22 }, { width: 14 }, { width: 70 }];

    const contoh = wb.addWorksheet("Contoh");
    contoh.addRow(kolom.map((k) => k.nama)).font = { bold: true };
    for (const b of CONTOH) contoh.addRow(kolom.map((k) => b[k.nama] ?? ""));
    contoh.columns = kolom.map(() => ({ width: 22 }));
    contoh.getColumn(3).numFmt = "@";

    await wb.xlsx.writeFile(join(KELUAR, "template_pengguna.xlsx"));
    console.log(`Template ditulis ke ${KELUAR} (${String(kolom.length)} kolom: ${kolom.map((k) => k.nama).join(", ")})`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
    await main();
}
