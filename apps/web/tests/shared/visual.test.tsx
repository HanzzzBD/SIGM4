// PR-07-37 — fondasi web visual-first (UXD-24…27, DSD-13/14, SDD-FE-17/18, WEB-VIS-02…05). Setiap uji
// gagal bila logikanya dicabut: gerbang permission saran, mode touched validasi, preferensi tampilan, C-41 ≤ 3.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { saranDashboard } from "../../src/shared/saran";
import { Isian } from "../../src/shared/ui/primitives";
import { CincinProgres, DaftarSaran, IlustrasiKeadaan, KepalaHalaman, PengalihTampilan, useTampilanDaftar } from "../../src/shared/ui/visual";
import type { Saran } from "../../src/shared/ui/visual";
import { aksiCepat } from "../../src/modules/m15-dashboard/aksi-cepat";
import { ME_ADMIN, pasangServer, renderAplikasi, sukses } from "../helpers";
import { useState } from "react";
import type { ReactElement } from "react";
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router";

const semua = () => true;
const STOK = { jumlah: 1, daftar: [{ id: 3, nama: "Kertas A4", saldo: 2, satuan: "rim", minimum: 10 }] };

beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
});

describe("registri saran tindakan (SDD-FE-18, WEB-VIS-03)", () => {
    it("stok menipis → Ajukan pengadaan dengan angka pemicu", () => {
        expect(saranDashboard({ "stok-bahan-menipis": STOK }, semua)).toEqual([
            { id: "stok-bahan-menipis", judul: "Stok Kertas A4 di bawah minimum", alasan: "Sisa 2 rim · minimum 10", labelAksi: "Ajukan pengadaan", href: "/pengadaan/baru" },
        ]);
    });

    it("tanpa permission aksi, saran tidak dihasilkan sama sekali (PM-04)", () => {
        expect(saranDashboard({ "stok-bahan-menipis": STOK, "pekerjaan-teknisi": { terlambat: 2, aktif: 5 }, "status-konfigurasi": { kekurangan: [{ pesan: "Zona waktu" }] } }, (p) => p !== "procurement.create" && p !== "setting.manage").map((s) => s.id)).toEqual(["wo-terlambat"]);
    });

    it("data tanpa pemicu (jumlah 0, tidak terlambat, konfigurasi lengkap) tidak menghasilkan saran", () => {
        expect(saranDashboard({ "stok-bahan-menipis": { jumlah: 0, daftar: [] }, "pekerjaan-teknisi": { terlambat: 0 }, "status-konfigurasi": { kekurangan: [] } }, semua)).toEqual([]);
    });
});

describe("C-41 Kartu Saran Tindakan", () => {
    const saran = (n: number): Saran[] => Array.from({ length: n }, (_, i) => ({ id: `s${String(i)}`, judul: `Saran ${String(i)}`, alasan: "x", labelAksi: "Buka", href: "/" }));

    it("paling banyak tiga terlihat; sisanya dilipat ke 'Lihat N saran lain'", async () => {
        await renderAplikasiKosong(<DaftarSaran saran={saran(5)} />);
        expect(await screen.findAllByRole("note")).toHaveLength(3);
        await userEvent.click(screen.getByRole("button", { name: "Lihat 2 saran lain" }));
        expect(screen.getAllByRole("note")).toHaveLength(5);
    });

    it("tombol tutup menyembunyikan saran untuk sesi ini", async () => {
        const { unmount } = await renderAplikasiKosong(<DaftarSaran saran={saran(1)} />);
        await userEvent.click(await screen.findByRole("button", { name: "Sembunyikan saran: Saran 0" }));
        expect(screen.queryByRole("note")).toBeNull();
        unmount();
        await renderAplikasiKosong(<DaftarSaran saran={saran(1)} />);
        expect(screen.queryByRole("note")).toBeNull();
    });
});

describe("validasi langsung & contoh pengisian (UXD-27, PATTERNS §4)", () => {
    function Uji() {
        const [v, setV] = useState("");
        return <Isian label="Email" required contoh="nama@sekolah.sch.id" validasi={(x) => (x.includes("@") ? undefined : "Email salah.")} value={v} onChange={(e) => setV(e.target.value)} />;
    }

    it("contoh tampil hanya saat fokus; galat baru setelah blur pertama, lalu setiap perubahan; centang saat valid", async () => {
        render(<Uji />);
        const input = screen.getByLabelText(/Email/);
        expect(screen.queryByText("Contoh: nama@sekolah.sch.id")).toBeNull();
        await userEvent.click(input);
        expect(screen.getByText("Contoh: nama@sekolah.sch.id")).toBeTruthy();
        await userEvent.type(input, "budi");
        expect(screen.queryByText("Email salah.")).toBeNull();
        fireEvent.blur(input);
        expect(screen.getByText("Email salah.")).toBeTruthy();
        expect(input.getAttribute("aria-invalid")).toBe("true");
        await userEvent.type(input, "@sekolah.sch.id");
        expect(screen.queryByText("Email salah.")).toBeNull();
        expect(document.querySelector("[data-valid]")).not.toBeNull();
    });
});

describe("C-40 Pengalih Tampilan (SDD-FE-17, UXD-26)", () => {
    function Daftar() {
        const [t, setT] = useTampilanDaftar("P-uji");
        return (
            <>
                <PengalihTampilan nilai={t} onUbah={setT} />
                <p>tampilan:{t}</p>
            </>
        );
    }

    it("pilihan disimpan per halaman di localStorage dan dipulihkan saat dibuka lagi", async () => {
        const { unmount } = render(<Daftar />);
        expect(screen.getByText("tampilan:tabel")).toBeTruthy();
        await userEvent.click(screen.getByRole("radio", { name: "Kartu" }));
        expect(screen.getByText("tampilan:kartu")).toBeTruthy();
        expect(window.localStorage.getItem("sigm4.tampilan.P-uji")).toBe("kartu");
        unmount();
        render(<Daftar />);
        expect(screen.getByText("tampilan:kartu")).toBeTruthy();
    });
});

describe("komponen visual lain", () => {
    it("C-34 melaporkan nilai progres ke pembaca layar", () => {
        render(<CincinProgres nilai={12} maks={50} format="pecahan" label="Kuota" />);
        const bar = screen.getByRole("progressbar", { name: "Kuota" });
        expect(bar.getAttribute("aria-valuenow")).toBe("12");
        expect(bar.getAttribute("aria-valuetext")).toBe("12/50");
    });

    it("C-37 dekoratif dengan bidang accent sebagai FILL (DSD-07)", () => {
        const { container } = render(<IlustrasiKeadaan jenis="kosong" accent="accent-blue" />);
        const svg = container.querySelector("svg");
        expect(svg?.getAttribute("aria-hidden")).toBe("true");
        expect(container.querySelector("rect[fill='var(--color-accent-blue)']")).not.toBeNull();
    });

    it("kepala halaman: keterangan pindah ke Popover Info C-39, kotak ikon hanya untuk halaman bergrup", async () => {
        const { container, rerender } = render(<KepalaHalaman judul="Profil" info={{ judul: "Tentang Profil", isi: "Keterangan halaman." }} />);
        expect(screen.queryByText("Keterangan halaman.")).toBeNull();
        expect(container.querySelector(".bg-accent-blue")).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "Tentang halaman ini" }));
        expect(await screen.findByText("Keterangan halaman.")).toBeTruthy();
        rerender(<KepalaHalaman judul="Inventaris" ikon="aset" accent="accent-blue" />);
        expect(container.querySelector(".bg-accent-blue")).not.toBeNull();
    });
});

describe("Aksi Cepat P-12 (C-31, UXD-23)", () => {
    it("hanya aksi yang permission-nya dipegang dan halamannya terdaftar; chatbot bukan tile", () => {
        expect(aksiCepat((p) => p === "damage.create" || p === "asset.view", { "P-25": "/scan", "P-40": "/kerusakan/baru" }).map((a) => a.label)).toEqual(["Scan aset", "Lapor kerusakan"]);
        expect(aksiCepat(semua, { "P-40": "/kerusakan/baru" }).map((a) => a.href)).toEqual(["/kerusakan/baru"]);
    });
});

describe("Dashboard P-12 terpadu", () => {
    it("menampilkan saran dari kartu stok menipis dan Aksi Cepat sesuai permission", async () => {
        pasangServer((p) => {
            if (p.url === "/me") return sukses({ ...ME_ADMIN, permissions: { "dashboard.view": "all", "material.view": "all", "procurement.create": "all", "damage.create": "all" } });
            if (p.url === "/dashboard") return sukses({ templat: "R-02", kartu: [{ id: "stok-bahan-menipis", judul: "Stok Bahan Menipis", zona: 1, jenis: "PERINGATAN", berperiode: false, drilldown: null }] });
            if (p.url.startsWith("/dashboard/cards/")) return sukses({ id: "stok-bahan-menipis", isi: STOK, rentang: null, diperbarui_pada: "2026-10-27T00:00:00Z" });
            return { status: 200, data: { success: true, data: [], meta: null } };
        });
        await renderAplikasi("/");
        const saran = await screen.findByRole("note", { name: "Stok Kertas A4 di bawah minimum" });
        expect(within(saran).getByRole("link", { name: "Ajukan pengadaan" }).getAttribute("href")).toBe("/pengadaan/baru");
        await waitFor(() => expect(screen.getByRole("link", { name: /Lapor kerusakan/ })).toBeTruthy());
    });

    it("sidebar dan konten bergulir di wilayah terpisah; kepala logo tidak ikut bergulir (UXD-25)", async () => {
        pasangServer((p) => (p.url === "/me" ? sukses(ME_ADMIN) : p.url === "/dashboard" ? sukses({ templat: null, kartu: [] }) : sukses([])));
        await renderAplikasi("/");
        const konten = await waitFor(() => {
            const el = document.querySelector("[data-gulir-konten]");
            if (el === null) throw new Error("belum");
            return el;
        });
        expect(konten.className).toContain("overflow-y-auto");
        expect(konten.parentElement?.className).toContain("overflow-hidden");
        const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
        const aside = nav.closest("aside");
        // Hanya daftar navigasi yang bergulir; kepala logo di atasnya tetap diam seperti topbar.
        expect(nav.classList.contains("overflow-y-auto")).toBe(true);
        expect(aside?.classList.contains("overflow-hidden")).toBe(true);
        const kepalaLogo = aside?.querySelector("img[alt='SIGM4']")?.parentElement;
        expect(kepalaLogo !== null && kepalaLogo !== undefined && !nav.contains(kepalaLogo)).toBe(true);
        expect(kepalaLogo?.classList.contains("shrink-0")).toBe(true);
        // Elemen sr-only (absolute) — tabel data grafik, label ciut — wajib terkurung di wadah gulirnya; tanpa
        // kelas relative mereka memanjangkan dokumen dan halaman ikut bergulir dengan scrollbar kedua.
        expect(konten.classList.contains("relative")).toBe(true);
        expect(nav.classList.contains("relative")).toBe(true);
    });
});

/** Tautan C-41 memakai router aplikasi — dirender di dalam router memori minimal. */
async function renderAplikasiKosong(ui: ReactElement) {
    const router = createRouter({ routeTree: createRootRoute({ component: () => ui }), history: createMemoryHistory() });
    await router.load();
    return render(<RouterProvider router={router} />);
}
