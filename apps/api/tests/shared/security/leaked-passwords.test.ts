// SDD-SESS-18 (keputusan 84a): daftar password bocor luring — isi, provenans, pencocokan.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPasswordPolicy } from "../../../src/shared/security/index.js";
import { isLeakedPassword, muatDaftarBocor } from "../../../src/shared/security/leaked-passwords.js";

const IDENTITAS = { nama: "Budi Santoso", email: "budi@sekolah.sch.id", nipNis: "198701012010011001" };
const berkas = readFileSync(new URL("../../../data/password-bocor.txt", import.meta.url), "utf8");

describe("daftar password bocor (NFR-S-03a)", () => {
    it("berkas mencatat sumber & lisensinya dan memuat puluhan ribu entri", () => {
        expect(berkas).toMatch(/^# Sumber: SecLists \(MIT/m);
        expect(muatDaftarBocor(berkas).size).toBeGreaterThan(20_000);
    });

    it("setiap entri ≥ 12 karakter dan huruf kecil — yang lebih pendek sudah ditolak aturan panjang", () => {
        const pendek = [...muatDaftarBocor(berkas)].filter((p) => p.length < 12 || p !== p.toLowerCase());
        expect(pendek).toEqual([]);
    });

    it("pencocokan tanpa membedakan huruf besar-kecil; komentar & baris kosong diabaikan", () => {
        expect(isLeakedPassword("Qwertyuiop123")).toBe(true);
        expect(isLeakedPassword("QWERTYUIOP123")).toBe(true);
        expect(isLeakedPassword("Tiga-Kucing-Melompat-91")).toBe(false);
        expect([...muatDaftarBocor("# komentar\n\nAbcDef123456\r\n")]).toEqual(["abcdef123456"]);
    });

    it("password yang lolos aturan dasar tetapi bocor → LEAKED (satu-satunya pelanggaran)", () => {
        expect(checkPasswordPolicy("Qwertyuiop123", IDENTITAS)).toEqual(["LEAKED"]);
        expect(checkPasswordPolicy("Tiga-Kucing-Melompat-91", IDENTITAS)).toEqual([]);
    });
});
