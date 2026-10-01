// shared/qr (FR-05.1, PR-03-01): payload QR permanen + matriks koreksi galat M.

import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { JALUR_PUBLIK_ASET, matriksQr, svgQr, urlQrAset } from "../../src/shared/qr/index.js";

const UUID = "3f6a1c2e-9b7d-4e21-8a55-0c1d2e3f4a5b";
const URL_QR = `https://sigm4.sekolah.example/a/${UUID}`;

describe("payload QR (FR-05.1 langkah 1, FR-05.2 A3)", () => {
    it("URL permanen https://{domain}/a/{asset_uuid} — tanpa tanda tangan maupun kedaluwarsa", () => {
        expect(urlQrAset("https://sigm4.sekolah.example", UUID)).toBe(URL_QR);
        expect(JALUR_PUBLIK_ASET).toBe("/a/");
    });

    it("payload hanya memuat UUID aset — tidak ada data pribadi/finansial maupun parameter lain", () => {
        const u = new URL(urlQrAset("https://sigm4.sekolah.example", UUID));
        expect([u.search, u.hash, u.username]).toEqual(["", "", ""]);
        expect(u.pathname).toBe(`/a/${UUID}`);
    });
});

describe("matriks QR (AC FR-05.1: terbaca 2×2 cm dengan koreksi galat M)", () => {
    it("tingkat koreksi galat TEPAT M — tidak diturunkan, tidak dinaikkan otomatis", () => {
        const m = matriksQr(URL_QR);
        expect(m.data).toEqual(encode(URL_QR, { ecc: "M", boostEcc: false, border: 4 }).data);
        // Pembanding: tingkat lain menghasilkan matriks berbeda — uji ini memang membedakan tingkat.
        expect(m.data).not.toEqual(encode(URL_QR, { ecc: "L", border: 4 }).data);
        expect(m.data).not.toEqual(encode(URL_QR, { ecc: "Q", border: 4 }).data);
    });

    it("zona tenang 4 modul di setiap sisi (ISO/IEC 18004)", () => {
        const { ukuran, data } = matriksQr(URL_QR);
        expect(ukuran).toBe(data.length);
        for (let i = 0; i < 4; i += 1) {
            expect(data[i]!.every((x) => !x), `baris ${String(i)}`).toBe(true);
            expect(data[ukuran - 1 - i]!.every((x) => !x), `baris akhir-${String(i)}`).toBe(true);
            expect(data.every((baris) => !baris[i] && !baris[ukuran - 1 - i]), `kolom ${String(i)}`).toBe(true);
        }
        // Pola pencari kiri-atas dimulai tepat sesudah zona tenang.
        expect(data[4]![4]).toBe(true);
    });

    it("SVG berdiri sendiri: viewBox = ukuran matriks, latar putih, satu path hitam berisi seluruh modul gelap", () => {
        const { ukuran, data } = matriksQr(URL_QR);
        const svg = svgQr(URL_QR);
        expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(ukuran)} ${String(ukuran)}"`)).toBe(true);
        expect(svg).toContain('fill="#fff"');
        const modulGelap = data.flat().filter(Boolean).length;
        expect(svg.match(/h1v1h-1z/g)?.length).toBe(modulGelap);
        expect(svg).not.toContain("<script");
    });
});
