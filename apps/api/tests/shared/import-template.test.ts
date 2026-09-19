// Template impor pengguna (Lampiran E.5.2, IMPT-05, IMP-02): berkas di
// docs/IMPLEMENTATION/templates/impor/ dibangkitkan `scripts/gen_template_pengguna.mjs`
// dari tabel E.5.2 di PRD. Uji ini menjaga tiga hal yang membuat templat berbahaya
// bila menyimpang: kolomnya sama persis dengan PRD, contoh isian TIDAK ada di
// sheet/berkas yang diimpor, dan contohnya sendiri lolos validasi impor.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ImportUserRowSchema } from "../../src/modules/m02-users/schemas/user-import.schema.js";
import { AKAR } from "../helpers/bab113.js";

const DIR = new URL("docs/IMPLEMENTATION/templates/impor/", AKAR);
const baca = (nama: string) => readFileSync(new URL(nama, DIR), "utf8").replace(/\r\n/g, "\n");

/** Kolom E.5.2 dibaca dari PRD saat uji berjalan, bukan disalin ke sini. */
function kolomPrd(): { nama: string; wajib: string }[] {
    const teks = readFileSync(new URL("docs/PRD/00-foundation/conventions.md", AKAR), "utf8").replace(/\r\n/g, "\n");
    const bagian = teks.split("**E.5.2 Impor Pengguna**")[1]!.split("**E.5.3")[0]!;
    return [...bagian.matchAll(/^\|\s*`([a-z_]+)`\s*\|\s*([^|]+?)\s*\|/gm)].map((m) => ({ nama: m[1]!, wajib: m[2]! }));
}

describe("template impor pengguna (E.5.2, IMPT-05)", () => {
    const prd = kolomPrd();

    it("membaca kolom dari PRD, bukan dari daftar di dalam uji ini", () => {
        expect(prd.map((k) => k.nama)).toEqual(["nama_lengkap", "email", "nip_nis", "kode_role", "kode_unit_kerja", "kelas", "telepon", "consent_wali"]);
    });

    it("template_pengguna.csv: HANYA header, kolomnya persis E.5.2 dan berurutan", () => {
        expect(baca("template_pengguna.csv")).toBe(prd.map((k) => k.nama).join(",") + "\n");
    });

    it("template_pengguna.xlsx: sheet pertama (yang dibaca impor) HANYA header E.5.2; contoh ada di sheet lain", async () => {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(fileURLToPath(new URL("template_pengguna.xlsx", DIR)));

        const pertama = wb.worksheets[0]!;
        expect(pertama.name).toBe("Pengguna");
        expect(pertama.rowCount).toBe(1);
        expect((pertama.getRow(1).values as unknown[]).slice(1)).toEqual(prd.map((k) => k.nama));
        expect(wb.worksheets.map((s) => s.name)).toEqual(["Pengguna", "Petunjuk", "Contoh"]);
        expect(wb.getWorksheet("Contoh")!.rowCount).toBe(4);
    });

    it("contoh_pengguna.csv: header E.5.2 + baris contoh yang lolos ImportUserRowSchema; berkas ini bukan berkas yang diserahkan untuk diisi", () => {
        const baris = baca("contoh_pengguna.csv").trimEnd().split("\n").map((l) => l.split(","));
        const [header, ...isi] = baris;
        expect(header).toEqual(prd.map((k) => k.nama));
        expect(isi).toHaveLength(3);
        for (const sel of isi) {
            const data = Object.fromEntries(header!.map((k, i) => [k, sel[i] === "" ? undefined : sel[i]]));
            expect(ImportUserRowSchema.safeParse(data).success, sel[0]).toBe(true);
        }
    });

    it("kolom wajib pada PRD (✅) semuanya wajib pada skema impor; kolom kondisional/opsional tidak menolak baris tanpanya", () => {
        const dasar = { nama_lengkap: "A", email: "a@sekolah.example", nip_nis: "1", kode_role: "R-05", kode_unit_kerja: "TU-01" };
        for (const k of prd.filter((c) => c.wajib.includes("✅"))) {
            const tanpa = Object.fromEntries(Object.entries(dasar).filter(([nama]) => nama !== k.nama));
            expect(ImportUserRowSchema.safeParse(tanpa).success, `tanpa ${k.nama}`).toBe(false);
        }
        expect(ImportUserRowSchema.safeParse(dasar).success).toBe(true);
    });

    it("contoh isian memakai domain fiktif .example — tidak dapat menjadi email nyata jika terimpor tanpa sengaja", () => {
        for (const email of baca("contoh_pengguna.csv").match(/[\w.]+@[\w.]+/g) ?? []) {
            expect(email.endsWith(".example")).toBe(true);
        }
    });
});
