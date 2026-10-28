// C-23 / NFR-AC-04 / DSD-10: setiap grafik membawa legenda teks DAN tabel data alternatif;
// visual SVG disembunyikan dari pembaca layar; seri memakai urutan accent tetap.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GrafikBatang, GrafikDonat, GrafikGaris } from "../../src/shared/ui/charts";

const DATA = [
    { label: "Baik", nilai: 4000 },
    { label: "Rusak Ringan", nilai: 820 },
];

describe("grafik SVG", () => {
    it.each([
        ["batang", GrafikBatang],
        ["donat", GrafikDonat],
        ["garis", GrafikGaris],
    ] as const)("%s: tabel data alternatif lengkap dengan angka berformat id-ID", (_n, Grafik) => {
        render(<Grafik judul="Kondisi Aset" kolom="Kondisi" data={DATA} />);
        const tabel = screen.getByRole("table", { name: "Kondisi Aset" });
        expect(within(tabel).getAllByRole("row").map((r) => r.textContent)).toEqual(["KondisiJumlah", "Baik4.000", "Rusak Ringan820"]);
        for (const svg of document.querySelectorAll("figure > svg")) expect(svg.getAttribute("aria-hidden")).toBe("true");
    });

    it("warna seri mengikuti urutan accent tetap (biru, hijau, …) — bukan teks", () => {
        const { container } = render(<GrafikBatang judul="Status" kolom="Status" data={DATA} />);
        expect([...container.querySelectorAll("figure > svg rect")].map((r) => r.getAttribute("fill"))).toEqual(["var(--color-accent-blue)", "var(--color-accent-green)"]);
    });
});
