// NFR-AC-01/02, SDD-11 §4.6, DS-01: token warna lolos kontras WCAG dan CSS = TS = FOUNDATIONS.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PASANGAN_KONTRAS, SERI_GRAFIK, WARNA, rasioKontras } from "../../src/shared/ui/tokens/tokens";

const css = readFileSync(resolve(process.cwd(), "src/shared/ui/tokens/tokens.css"), "utf8");
const foundations = readFileSync(resolve(process.cwd(), "../../docs/DESIGN/FOUNDATIONS.md"), "utf8");

describe("token warna", () => {
    it("setiap pasangan depan/latar yang dipakai komponen memenuhi ambang WCAG (gagal = CI merah)", () => {
        const gagal = PASANGAN_KONTRAS.filter((p) => rasioKontras(WARNA[p.depan], WARNA[p.latar]) < p.min).map((p) => `${p.guna}: ${rasioKontras(WARNA[p.depan], WARNA[p.latar]).toFixed(2)} < ${String(p.min)}`);
        expect(gagal).toEqual([]);
    });

    it("rumus kontras sesuai angka FOUNDATIONS (teal.600 vs putih 4,98; neutral.400 vs putih 2,54)", () => {
        expect(rasioKontras(WARNA["teal-600"], WARNA.white)).toBeCloseTo(4.98, 1);
        expect(rasioKontras(WARNA["neutral-400"], WARNA.white)).toBeCloseTo(2.54, 1);
    });

    it("nilai CSS custom property identik dengan tokens.ts — dua salinan tidak boleh menyimpang", () => {
        for (const [nama, hex] of Object.entries(WARNA)) {
            const cocok = new RegExp(`--color-${nama}: (#[0-9A-Fa-f]{6});`).exec(css);
            expect(cocok?.[1]?.toUpperCase(), nama).toBe(hex.toUpperCase());
        }
    });

    it("setiap hex token tercantum di FOUNDATIONS.md (sumber kebenaran nilai)", () => {
        const tidakAda = Object.entries(WARNA).filter(([, hex]) => hex !== "#FFFFFF" && !foundations.includes(hex));
        expect(tidakAda).toEqual([]);
    });

    it("tema bawaan Tailwind dimatikan — hanya token yang menjadi utilitas (DS-P-07)", () => {
        expect(css).toMatch(/@theme \{\s*--\*: initial;/);
    });

    it("urutan seri grafik tetap: biru, hijau, kuning, merah, abu, ungu (FOUNDATIONS §1.2)", () => {
        expect(SERI_GRAFIK).toEqual(["accent-blue", "accent-green", "accent-yellow", "accent-red", "accent-gray", "accent-purple"]);
    });
});
