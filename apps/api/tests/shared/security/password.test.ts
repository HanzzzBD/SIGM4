// Acceptance PR-01-16: "Parameter Argon2id sesuai `SDD-SESS-01`" (NFR-S-02,
// NFR-S-03a, FR-01.4 langkah 3).
//
// Parameternya dibaca LANGSUNG dari SDD dan dibandingkan dengan konstanta kode,
// bukan disalin ke dalam berkas ini: salinan akan ikut disunting bersama kodenya
// dan berhenti menguji apa pun. Bentuk hash yang benar-benar dihasilkan juga
// diperiksa, sebab konstanta yang benar tidak membuktikan ia dipakai.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    ARGON2ID_PARAMETERS,
    PASSWORD_MIN_LENGTH,
    checkPasswordPolicy,
    hashPassword,
    verifyPassword,
} from "../../../src/shared/security/index.js";
import { AKAR } from "../../helpers/bab113.js";

const IDENTITAS = {
    nama: "Budi Santoso",
    email: "budi.santoso@sekolah.sch.id",
    nipNis: "198001012005011001",
};
const SAH = "Perpustakaan9Biru";

/** `m=19456 KiB, t=2, p=1` dari baris SDD-SESS-01. */
function parameterSdd(): { m: number; t: number; p: number } {
    const teks = readFileSync(
        new URL("docs/SDD/04-authentication-session.md", AKAR),
        "utf8",
    );
    const baris = teks
        .split("\n")
        .find((l) => l.includes("**SDD-SESS-01**") && l.includes("m="));
    const cocok = /m=(\d+) KiB, t=(\d+), p=(\d+)/.exec(baris ?? "");
    if (cocok === null)
        throw new Error("Parameter SDD-SESS-01 tidak ditemukan pada SDD-04");
    return {
        m: Number(cocok[1]),
        t: Number(cocok[2]),
        p: Number(cocok[3]),
    };
}

describe("parameter Argon2id terhadap SDD-SESS-01", () => {
    it("konstanta kode identik dengan angka di SDD", () => {
        const sdd = parameterSdd();
        expect({
            m: ARGON2ID_PARAMETERS.memoryCost,
            t: ARGON2ID_PARAMETERS.timeCost,
            p: ARGON2ID_PARAMETERS.parallelism,
        }).toEqual(sdd);
    });

    it("hash yang dihasilkan memuat argon2id beserta parameter itu", async () => {
        const sdd = parameterSdd();
        const encoded = await hashPassword(SAH);
        expect(encoded.startsWith("$argon2id$")).toBe(true);
        expect(encoded).toContain(`m=${sdd.m},t=${sdd.t},p=${sdd.p}`);
    });

    it("dua hash password yang sama berbeda — salt acak", async () => {
        const [a, b] = await Promise.all([
            hashPassword(SAH),
            hashPassword(SAH),
        ]);
        expect(a).not.toBe(b);
    });
});

describe("verifikasi password", () => {
    it("menerima password yang benar dan menolak yang salah", async () => {
        const encoded = await hashPassword(SAH);
        await expect(verifyPassword(encoded, SAH)).resolves.toBe(true);
        await expect(verifyPassword(encoded, `${SAH}x`)).resolves.toBe(false);
    });

    it("hash rusak dijawab false, bukan dilempar", async () => {
        await expect(verifyPassword("bukan-hash", SAH)).resolves.toBe(false);
    });
});

describe("kebijakan kata sandi (NFR-S-03a, FR-01.4 langkah 3)", () => {
    it("password yang memenuhi seluruh aturan diterima", () => {
        expect(checkPasswordPolicy(SAH, IDENTITAS)).toEqual([]);
    });

    it("panjang minimal 12 karakter — batasnya diuji dari dua sisi", () => {
        expect(PASSWORD_MIN_LENGTH).toBe(12);
        expect(checkPasswordPolicy("Pendek9Abcd", IDENTITAS)).toContain(
            "TOO_SHORT",
        );
        expect(checkPasswordPolicy("Pendek9Abcde", IDENTITAS)).toEqual([]);
    });

    it.each([
        ["perpustakaan9biru", "MISSING_UPPERCASE"],
        ["PERPUSTAKAAN9BIRU", "MISSING_LOWERCASE"],
        ["PerpustakaanBiru", "MISSING_DIGIT"],
    ])("%s ditolak karena %s", (password, pelanggaran) => {
        expect(checkPasswordPolicy(password, IDENTITAS)).toContain(pelanggaran);
    });

    it.each([
        ["nama depan", "Budi9Perpustakaan"],
        ["nama belakang", "Santoso9Perpustakaan"],
        ["bagian lokal email", "Budi.Santoso9Sekolah"],
        ["NIP/NIS", "Arsip198001012005011001A"],
        ["beda huruf besar", "bUdI9Perpustakaan"],
    ])("password yang memuat %s ditolak", (_, password) => {
        expect(checkPasswordPolicy(password, IDENTITAS)).toContain(
            "CONTAINS_IDENTITY",
        );
    });

    it("potongan identitas yang terlalu pendek tidak menolak password", () => {
        // "Ani" tetap diperiksa, tetapi inisial satu-dua huruf akan menolak
        // hampir semua password bila ikut dihitung.
        const identitas = { nama: "A B Ani", email: "ab@x.id", nipNis: "12" };
        expect(checkPasswordPolicy("Perpustakaan9Biru", identitas)).toEqual([]);
        expect(checkPasswordPolicy("Perpustakaan9Ani", identitas)).toContain(
            "CONTAINS_IDENTITY",
        );
    });

    it("mengumpulkan seluruh pelanggaran sekaligus, bukan berhenti di yang pertama", () => {
        expect(checkPasswordPolicy("budi", IDENTITAS).sort()).toEqual([
            "CONTAINS_IDENTITY",
            "MISSING_DIGIT",
            "MISSING_UPPERCASE",
            "TOO_SHORT",
        ]);
    });
});
