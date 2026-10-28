import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AssetAvailabilityResponse } from "@sigm4/schemas";
import { gagal, ME_ADMIN, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";

const PATH = "/katalog-aset?mulai=2027-03-01T08%3A00&selesai=2027-03-01T17%3A00";
const response: AssetAvailabilityResponse = {
    success: true, meta: { page: 1, per_page: 25, total: 2, total_pages: 1 },
    data: { dari: "2027-03-01T01:00:00.000Z", sampai: "2027-03-01T10:00:00.000Z", zona_waktu: "Asia/Jakarta", horizon_sampai: "2027-06-01T00:00:00.000Z", kategori: [{ id: "1", nama: "Elektronik" }], kelompok: [
        { key: "proyektor", nama: "Proyektor", merek: "Epson", model: null, kategori: { id: "1", nama: "Elektronik" }, jumlah_unit: 2, jumlah_tersedia: 1, tersedia_mulai: "2027-03-01T01:00:00.000Z", foto_url: null, unit: [
            { id: "10", kode_barang: "PRJ-01", kondisi: "BAIK", tersedia: true, tersedia_mulai: "2027-03-01T01:00:00.000Z" },
            { id: "11", kode_barang: "PRJ-02", kondisi: "RUSAK_RINGAN", tersedia: false, tersedia_mulai: null },
        ] },
        { key: "kamera", nama: "Kamera", merek: null, model: null, kategori: { id: "1", nama: "Elektronik" }, jumlah_unit: 1, jumlah_tersedia: 0, tersedia_mulai: "2027-03-05T02:00:00.000Z", foto_url: null, unit: [{ id: "12", kode_barang: "KAM-01", kondisi: "BAIK", tersedia: false, tersedia_mulai: "2027-03-05T02:00:00.000Z" }] },
    ] },
};
const me = { ...ME_ADMIN, permissions: { "reservation.view": "restricted", "reservation.create": "own" } };
const answer = (data = response) => ({ status: 200, data });

// jsdom tidak menyediakan ResizeObserver yang dipakai checkbox C-10 di dalam form.
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterAll(() => vi.unstubAllGlobals());

describe("PR-04-04 — katalog aset P-28", () => {
    it("menyimpan pencarian/filter dalam URL dan mengirim query API", async () => {
        const calls = pasangServer((p) => p.url === "/me" ? sukses(me) : p.url === "/assets/availability" ? answer() : { status: 404 });
        const { router } = await renderAplikasi(PATH);
        await screen.findByRole("heading", { name: "Proyektor" });
        fireEvent.change(screen.getByRole("searchbox", { name: "Cari nama atau kategori" }), { target: { value: "Proyektor" } });
        fireEvent.click(screen.getByRole("button", { name: "Cari" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "Proyektor" }));
        await screen.findByRole("option", { name: "Elektronik" });
        fireEvent.change(screen.getByRole("combobox", { name: "Kategori" }), { target: { value: "1" } });
        await waitFor(() => expect(router.state.location.search).toMatchObject({ kategori: "1" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Hanya yang tersedia" }));
        await waitFor(() => expect(calls.some((c) => c.url === "/assets/availability" && c.params["q"] === "Proyektor" && c.params["kategori_id"] === 1 && c.params["hanya_tersedia"] === "true")).toBe(true));
    });
    it("menampilkan keadaan kosong dan aksi hapus saringan", async () => {
        pasangServer((p) => p.url === "/me" ? sukses(me) : p.url === "/assets/availability" ? answer({ ...response, data: { ...response.data, kelompok: [] }, meta: { ...response.meta, total: 0, total_pages: 0 } }) : { status: 404 });
        await renderAplikasi(PATH);
        await screen.findByText("Tidak ada aset yang cocok");
        expect(screen.getByRole("button", { name: "Hapus saringan" })).toBeDefined();
    });
    it("memilih hanya unit tersedia tanpa meminta asset.view atau mengajukan reservasi; axe lulus", async () => {
        const calls = pasangServer((p) => p.url === "/me" ? sukses(me) : p.url === "/assets/availability" ? answer() : { status: 404 });
        const { container } = await renderAplikasi(PATH);
        await screen.findByRole("heading", { name: "Proyektor" });
        fireEvent.click(screen.getAllByText("Lihat unit dan pilih aset")[0]!);
        const available = screen.getByRole("checkbox", { name: /PRJ-01/ });
        const busy = screen.getByRole("checkbox", { name: /PRJ-02/ }) as HTMLInputElement;
        expect(busy.disabled).toBe(true);
        fireEvent.click(available);
        await screen.findByText(/1 unit dipilih/);
        expect(screen.getByRole("link", { name: "Ajukan reservasi" }).getAttribute("href")).toContain("mode=aset");
        expect(screen.queryByRole("link", { name: /Detail PRJ/ })).toBeNull();
        expect(calls.filter((c) => c.url === "/asset-categories" || c.url === "/assets" || c.method === "post")).toHaveLength(0);
        expect(await pelanggaranAxe(container)).toEqual([]);
    });
    it("menggunakan tanggal alternatif dalam WIB dengan durasi sama", async () => {
        pasangServer((p) => p.url === "/me" ? sukses(me) : p.url === "/assets/availability" ? answer() : { status: 404 });
        const { router } = await renderAplikasi(PATH);
        fireEvent.click(await screen.findByRole("button", { name: "Gunakan tanggal tersedia" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ mulai: "2027-03-05T09:00", selesai: "2027-03-05T18:00" }));
    });
    it("mengosongkan pemilihan setelah ketersediaan dimuat ulang", async () => {
        pasangServer((p) => p.url === "/me" ? sukses(me) : p.url === "/assets/availability" ? answer() : { status: 404 });
        await renderAplikasi(PATH);
        await screen.findByRole("heading", { name: "Proyektor" });
        fireEvent.click(screen.getAllByText("Lihat unit dan pilih aset")[0]!);
        fireEvent.click(screen.getByRole("checkbox", { name: /PRJ-01/ }));
        await screen.findByText(/1 unit dipilih/);
        fireEvent.click(screen.getByRole("button", { name: "Muat ulang" }));
        await waitFor(() => expect(screen.getByRole("checkbox", { name: /PRJ-01/ }).getAttribute("aria-checked")).toBe("false"));
    });
    it("menolak rentang tidak sah sebelum permintaan HTTP", async () => {
        const calls = pasangServer((p) => p.url === "/me" ? sukses(me) : answer());
        await renderAplikasi("/katalog-aset?mulai=2027-03-03T08%3A00&selesai=2027-03-01T17%3A00");
        await screen.findByText(/Waktu akhir harus sesudah waktu awal/);
        expect(calls.filter((c) => c.url === "/assets/availability")).toHaveLength(0);
    });
    it("membatasi route tanpa izin dan tidak membaca katalog", async () => {
        const calls = pasangServer((p) => p.url === "/me" ? sukses(ME_ADMIN) : answer());
        await renderAplikasi(PATH);
        await screen.findByText("Akses dibatasi");
        expect(calls.filter((c) => c.url === "/assets/availability")).toHaveLength(0);
    });
    it("menampilkan galat server dan tombol coba lagi", async () => {
        pasangServer((p) => p.url === "/me" ? sukses(me) : gagal(422, "VALIDATION_ERROR", "Di luar horizon pemesanan."));
        await renderAplikasi(PATH);
        await screen.findByText("Di luar horizon pemesanan.");
        expect(screen.getByRole("button", { name: "Coba lagi" })).toBeDefined();
    });
});
