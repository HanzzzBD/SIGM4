import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// DSD-11 / MOB-SCP-04: satu layar mobile tidak memuat paragraf lebih dari dua kalimat; keterangan panjang
// dipindah ke ikon info C-30 → C-36 (`subtitle` Screen), yang sengaja tidak diperiksa di sini.
const src = join(import.meta.dirname, "..", "src");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? files(join(dir, item.name)) : item.name.endsWith(".tsx") ? [join(dir, item.name)] : []);
function sentences(text: string): number { return (text.replace(/\d+\.\d+/g, "0").match(/[.!?](\s|$)/g) ?? []).length; }
const VISIBLE = [/(?:message|description|title)=\{?["`]([^"`]+)["`]/g, /<(?:Label|Text)\b[^>]*>([^<{]+)</g, /set(?:Error|Message|LogoutError|ActionError)\(\s*["`]([^"`]+)["`]/g];

describe("teks layar mobile visual-first (DSD-11)", () => {
    it("counts sentences, ignoring decimal numbers", () => {
        expect(sentences("Satu. Dua! Tiga?")).toBe(3);
        expect(sentences("Kuota kembali pukul 00.00 WIB.")).toBe(1);
    });
    it("no visible text block on a screen exceeds two sentences", () => {
        const offenders = files(src).flatMap((file) => { const text = readFileSync(file, "utf8"); return VISIBLE.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => m[1] ?? "").filter((value) => sentences(value) > 2).map((value) => `${relative(src, file)}: ${value}`)); });
        expect(offenders).toEqual([]);
    });
});
