import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { gagal, ME_ADMIN, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";

const room = { id: "3", area_id: "2", nama: "Laboratorium", kode: "LAB", jenis: "LABORATORIUM", kapasitas: 30, penanggung_jawab_id: null, dapat_direservasi: true, boleh_direservasi_siswa: false, status: "AKTIF", jumlah_aset: 500 };
const tree = [{ id: "1", nama: "Gedung A", kode: "GA", status: "AKTIF", jumlah_aset: 500, areas: [{ id: "2", nama: "Lantai 1", kode: "L1", jumlah_aset: 500, rooms: [room] }] }];
function server(permissions: string[], denyAssets = false) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses({ ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, ...Object.fromEntries(permissions.map((s) => [s, "all"])) } });
        if (p.url === "/notifications/unread-count") return sukses({ jumlah: 0 });
        if (p.url === "/locations/tree") return sukses(tree);
        if (p.url === "/rooms/3") return sukses(room);
        if (p.url === "/asset-categories") return sukses([{ id: "4", nama: "Elektronik" }]);
        if (p.url === "/rooms/3/assets/export") return { status: 200, data: new Blob(["xlsx"]) };
        if (p.url === "/rooms/3/assets") return denyAssets ? gagal(403, "INSUFFICIENT_PERMISSION", "Akses aset ditolak.") : { status: 200, data: { success: true, data: { assets: [{ kode_barang: "PC-01", nama: "Komputer", kondisi: "BAIK", status: "TERSEDIA" }], ringkasan: { total: 500, per_kondisi: { BAIK: 500, RUSAK_RINGAN: 0, RUSAK_BERAT: 0, HILANG: 0 }, jumlah_dipinjam: 0, jumlah_dalam_perbaikan: 0 } }, meta: { page: 1, total: 1, total_pages: 1 } } };
        return gagal(404, "NOT_FOUND", p.url);
    });
}

describe("PR-01-23 — lokasi", () => {
    it("pohon dapat dibuka dan baca-saja tidak menawarkan mutasi; axe", async () => {
        server(["location.view"]);
        const { container } = await renderAplikasi("/lokasi");
        const user = userEvent.setup();
        const summary = await screen.findByText("Gedung A · GA · 500 aset · Aktif");
        expect(summary.parentElement?.hasAttribute("open")).toBe(false);
        await user.click(summary);
        await user.click(screen.getByText("Lantai 1 · L1 · 500 aset"));
        expect(screen.getByRole("link", { name: /Laboratorium · LAB · 500 aset/ }).getAttribute("href")).toBe("/lokasi/ruangan/3");
        expect(screen.queryByRole("button", { name: "Tambah gedung" })).toBeNull();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("detail menggabungkan pencarian dan filter dari URL; ringkasan tetap 500 dan axe", async () => {
        const log = server(["location.view", "asset.view"]);
        const { container } = await renderAplikasi("/lokasi/ruangan/3?q=Komputer&kategori=4&kondisi=BAIK&status=TERSEDIA");
        await screen.findByText("PC-01");
        expect(log.find((p) => p.url === "/rooms/3/assets")?.params).toMatchObject({ q: "Komputer", "filter[kategori_id]": "4", "filter[kondisi]": "BAIK", "filter[status]": "TERSEDIA", page: 1 });
        expect(screen.getByText("Total: 500 unit")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Ekspor XLSX" })).toBeNull();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("tanpa location.view ditolak sebelum memanggil API lokasi", async () => {
        const log = server([]);
        const { router } = await renderAplikasi("/lokasi/ruangan/3");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
        expect(log.some((p) => p.url.startsWith("/rooms") || p.url === "/locations/tree")).toBe(false);
    });

    it("galat 403 server tampil dan tab jadwal tanpa izin tidak mengambil API blokade", async () => {
        const log = server(["location.view", "asset.view"], true);
        await renderAplikasi("/lokasi/ruangan/3");
        await screen.findByText("Akses aset ditolak.");
        await userEvent.setup().click(screen.getByRole("button", { name: "Jadwal Tetap" }));
        await screen.findByText("Anda tidak memiliki izin melihat atau mengelola jadwal tetap.");
        expect(log.some((p) => p.url.includes("/blocks"))).toBe(false);
    });

    it("pengelola menambah gedung lewat formulir dan kegagalan server tetap terlihat", async () => {
        const requests = pasangServer((p) => {
            if (p.url === "/me") return sukses({ ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "location.view": "all", "location.manage": "all" } });
            if (p.url === "/locations/tree") return sukses(tree);
            if (p.url === "/buildings") return gagal(422, "DUPLICATE_CODE", "Kode lokasi sudah digunakan.");
            return sukses({ jumlah: 0 });
        });
        await renderAplikasi("/lokasi");
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: "Tambah gedung" }));
        await user.type(screen.getByLabelText(/^Nama/), "Gedung B");
        await user.type(screen.getByLabelText(/^Kode/), "GA");
        await user.click(screen.getByRole("button", { name: "Simpan" }));
        await screen.findByText("Kode lokasi sudah digunakan.");
        expect(requests.find((p) => p.url === "/buildings")?.data).toEqual({ nama: "Gedung B", kode: "GA", keterangan: null });
    });

    it("ekspor memakai semua filter dan izin report.export", async () => {
        const createUrl = vi.fn().mockReturnValue("blob:inventory");
        const revoke = vi.fn();
        Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
        Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
        const log = server(["location.view", "asset.view", "report.export"]);
        await renderAplikasi("/lokasi/ruangan/3?q=PC&kondisi=BAIK");
        await userEvent.setup().click(await screen.findByRole("button", { name: "Ekspor XLSX" }));
        await waitFor(() => expect(createUrl).toHaveBeenCalled());
        expect(log.find((p) => p.url.endsWith("/export"))?.params).toMatchObject({ format: "xlsx", q: "PC", "filter[kondisi]": "BAIK" });
        expect(log.some((p) => p.url === "/rooms/3")).toBe(true);
    });
});
