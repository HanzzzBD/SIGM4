// HTML label QR (FR-05.1 langkah 3; PR-03-02): pembagian lembar per preset, payload QR per label,
// elemen opsional, dan escape teks pengguna sebelum dibuka Chromium.

import { describe, expect, it } from "vitest";
import { htmlLabel, TATA_LETAK } from "../../../src/modules/m05-qr/services/label-html.js";
import { svgQr } from "../../../src/shared/qr/index.js";

const DASAR = "https://sigm4.sekolah.test";
const label = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ uuid: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, kodeAset: `LAB-KOM-${String(i).padStart(4, "0")}`, nama: `Proyektor ${String(i)}` }));
const hitung = (html: string, kelas: string) => html.split(`class="${kelas}"`).length - 1;

describe("htmlLabel", () => {
    it.each([
        ["A4_3X8", 24, 200, 9],
        ["A4_4X10", 40, 200, 5],
        ["A4_2X5", 10, 25, 3],
    ] as const)("%s: %i label per lembar A4 → %i label jadi %i lembar", (kode, perLembar, n, lembar) => {
        const t = TATA_LETAK[kode];
        expect(t.kolom * t.baris).toBe(perLembar);
        // Preset memenuhi A4 tanpa margin; QR tidak pernah di bawah 2 cm (AC FR-05.1).
        expect(t.kolom * t.lebarMm).toBeCloseTo(210);
        expect(t.baris * t.tinggiMm).toBeCloseTo(297);
        expect(t.qrMm).toBeGreaterThanOrEqual(20);
        const html = htmlLabel(DASAR, label(n), kode, { kodeAset: true, nama: true });
        expect(hitung(html, "lembar")).toBe(lembar);
        expect(hitung(html, "label")).toBe(n);
    });

    it("tiap label memuat QR URL permanen asetnya sendiri, urut sesuai masukan (FR-05.1 langkah 1)", () => {
        const isi = label(3);
        const html = htmlLabel(DASAR, isi, "A4_3X8", { kodeAset: true, nama: true });
        const posisi = isi.map((l) => html.indexOf(svgQr(`${DASAR}/a/${l.uuid}`)));
        expect(posisi.every((p) => p > 0)).toBe(true);
        expect([...posisi].sort((a, b) => a - b)).toEqual(posisi);
    });

    it("elemen opsional: kode aset dan nama dapat dimatikan masing-masing", () => {
        const [l] = label(1);
        const keduanya = htmlLabel(DASAR, [l!], "A4_3X8", { kodeAset: true, nama: true });
        expect(keduanya).toContain(l!.kodeAset);
        expect(keduanya).toContain(l!.nama);
        const tanpaNama = htmlLabel(DASAR, [l!], "A4_3X8", { kodeAset: true, nama: false });
        expect(tanpaNama).toContain(l!.kodeAset);
        expect(tanpaNama).not.toContain(l!.nama);
        const qrSaja = htmlLabel(DASAR, [l!], "A4_3X8", { kodeAset: false, nama: false });
        expect(qrSaja).not.toContain(l!.kodeAset);
        expect(hitung(qrSaja, "teks")).toBe(0);
    });

    it("teks pengguna di-escape — nama aset tidak dapat menyisipkan markup ke halaman Chromium", () => {
        const html = htmlLabel(DASAR, [{ uuid: "00000000-0000-4000-8000-000000000001", kodeAset: "K&1", nama: `<img src=x onerror="a()">'` }], "A4_3X8", { kodeAset: true, nama: true });
        expect(html).not.toContain("<img");
        expect(html).toContain("&lt;img src=x onerror=&quot;a()&quot;&gt;&#39;");
        expect(html).toContain("K&amp;1");
    });
});
