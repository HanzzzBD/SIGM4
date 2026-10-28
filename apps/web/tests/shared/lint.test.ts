// DS-P-07, DSD-07, SDD-11 §4.1a: aturan lint web benar-benar MENOLAK pelanggarannya (uji negatif,
// pola apps/api clock-lint) — aturan yang tak pernah menolak apa pun tidak menegakkan apa pun.
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Uji berjalan dengan cwd = apps/web (npm run test -w apps/web).
const WEB = `${process.cwd().replaceAll("\\", "/")}/`;
const eslint = new ESLint({ cwd: WEB });
const pesan = async (kode: string, berkas: string) => (await eslint.lintText(kode, { filePath: `${WEB}${berkas}` }))[0]?.messages.map((m) => m.message) ?? [];

describe("lint web", () => {
    it.each([
        ['const a = "text-[13px]";', "arbitrer"],
        ['const a = "#1F7A8C";', "Warna mentah"],
        ['const a = "12px";', "px/ms"],
        ['const a = "200ms";', "px/ms"],
        ['const a = "text-accent-blue";', "Accent"],
        ['const a = "border-accent-green";', "Accent"],
        ["const a = `p-[${1}rem]`;", "mentah"],
    ])("menolak %s", async (kode, harap) => {
        expect((await pesan(kode, "src/shared/ui/contoh.tsx")).join("\n")).toContain(harap);
    }, 60_000);

    it("mengizinkan token dan accent sebagai fill/latar penanda", async () => {
        expect(await pesan('export const a = "bg-accent-blue p-4 text-text-primary"; export const b = "fill-accent-green";', "src/shared/ui/contoh.tsx")).toEqual([]);
    }, 60_000);

    it("berkas token dikecualikan — satu-satunya tempat nilai mentah", async () => {
        expect(await pesan('export const x = "#1F7A8C";', "src/shared/ui/tokens/contoh.ts")).toEqual([]);
    }, 60_000);

    it.each([
        ['import { x } from "../m15-dashboard/api";', "src/modules/m01-auth/contoh.ts", "index.ts"],
        ['import { x } from "../../modules/m01-auth";', "src/shared/ui/contoh.ts", "shared/"],
        ['import { x } from "../../app/router";', "src/modules/m01-auth/contoh.ts", "app/"],
        ['import { x } from "../modules/m15-dashboard/api";', "src/pages/contoh.ts", "pages/"],
    ])("batas impor: menolak %s dari %s", async (kode, berkas, harap) => {
        expect((await pesan(kode, berkas)).join("\n")).toContain(harap);
    }, 60_000);

    it("batas impor: index.ts modul lain boleh", async () => {
        expect(await pesan('export { x } from "../m15-dashboard";', "src/modules/m01-auth/contoh.ts")).toEqual([]);
    }, 60_000);
});
