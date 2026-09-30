// SDD-FE-08 (label enum = Bab 11.3), UX §5.3/UXD-01 (sidebar per permission & halaman terdaftar),
// UX §8.3 (drill-down), keputusan 83.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LABEL_JENIS_PENGAJUAN, LABEL_KONDISI_ASET, LABEL_STATUS_ASET, LABEL_STATUS_INSTANCE_APPROVAL, labelEnum } from "@sigm4/schemas";
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { buatRouter } from "../../src/app/router";
import { HALAMAN_TERDAFTAR, NAVIGASI, jalurDrilldown, navigasiTerlihat } from "../../src/shared/navigasi";

const bab113 = readFileSync(resolve(process.cwd(), "../../docs/PRD/03-architecture/data-model.md"), "utf8");
const nilaiBab = (kelompok: string): string[] => {
    const baris = bab113.split("\n").find((l) => l.startsWith(`| **${kelompok}** |`));
    return (baris?.split("|")[2] ?? "").split(",").map((s) => s.trim());
};

describe("peta label enum (SDD-FE-08) = PRD Bab 11.3 kata per kata", () => {
    it.each([
        ["Kondisi Aset", LABEL_KONDISI_ASET],
        ["Status Aset", LABEL_STATUS_ASET],
        ["Status Instance Approval", LABEL_STATUS_INSTANCE_APPROVAL],
        ["Jenis Pengajuan (Approval)", LABEL_JENIS_PENGAJUAN],
    ] as const)("%s", (kelompok, peta) => {
        expect(Object.values(peta)).toEqual(nilaiBab(kelompok));
    });

    it("kode tak dikenal tidak pernah dirender mentah", () => {
        expect(labelEnum(LABEL_KONDISI_ASET, "RUSAK_TOTAL")).toBe("Tidak diketahui");
    });
});

describe("registri navigasi", () => {
    const semua = (...p: string[]) => (x: string) => p.includes(x);

    it("struktur UXD-01: Beranda + lima grup domain, Sistem terakhir; accent sesuai DSD-03", () => {
        expect(NAVIGASI.map((g) => [g.label, g.accent])).toEqual([
            ["Beranda", null],
            ["Aset & Bahan", "accent-blue"],
            ["Pemanfaatan", "accent-green"],
            ["Perawatan", "accent-yellow"],
            ["Pengawasan", "accent-purple"],
            ["Sistem", "accent-gray"],
        ]);
    });

    it("entri dirender hanya bila halamannya terdaftar DAN permission dipegang; grup kosong hilang", () => {
        expect(navigasiTerlihat(semua("dashboard.view", "user.view", "asset.view")).map((g) => [g.label, g.entri.map((e) => e.label)])).toEqual([["Beranda", ["Dashboard"]]]);
        expect(navigasiTerlihat(semua("user.view"))).toEqual([]);
    });

    it("HALAMAN_TERDAFTAR identik dengan route yang benar-benar ada di router", () => {
        const router = buatRouter(new QueryClient());
        const path = Object.keys(router.routesByPath).map((x) => (x.length > 1 && x.endsWith("/") ? x.slice(0, -1) : x));
        expect([...new Set(path)].sort()).toEqual(Object.values(HALAMAN_TERDAFTAR).sort());
    });

    it("drill-down hanya menjadi tautan bila halaman sasarannya terdaftar; filter URL dipertahankan", () => {
        expect(jalurDrilldown("P-60?filter[status]=AKTIF")).toBeNull();
        expect(jalurDrilldown(null)).toBeNull();
        expect(jalurDrilldown("P-12?rentang=7_hari")).toBe("/?rentang=7_hari");
        expect(jalurDrilldown("P-12 · P-70")).toBe("/");
    });
});
