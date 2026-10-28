import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ME_ADMIN, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import { tujuanDashboard, rincianDashboard } from "../../src/modules/m15-dashboard/drilldown";
import type { KartuManifes } from "../../src/modules/m15-dashboard/api";

const kartu = (id: string, drilldown: string): KartuManifes => ({ id, judul: id, drilldown, zona: 2, jenis: "KPI", berperiode: false });

describe("PR-02-50 drill-down dashboard", () => {
    it("menjaga izin tujuan, tujuan belum tersedia, dan fallback konfigurasi", () => {
        expect(tujuanDashboard(kartu("pengajuan-saya", "P-30?saya=true"), (p) => p === "approval.view")).toBeNull();
        expect(tujuanDashboard(kartu("reset", "P-67"), (p) => p === "user.reset_password")).toBe("/permintaan-reset-password");
        expect(tujuanDashboard(kartu("reset", "P-67"), (p) => p === "dashboard.view")).toBeNull();
        // P-73 terdaftar sejak PR-01-25 (#167): bertaut hanya bagi pemegang activity_log.view.
        expect(tujuanDashboard(kartu("log", "P-73"), (p) => p === "activity_log.view")).toBe("/activity-log");
        expect(tujuanDashboard(kartu("log", "P-73"), (p) => p === "dashboard.view")).toBeNull();
        expect(tujuanDashboard(kartu("config", "P-68 · P-70"), (p) => p === "setting.view")).toBe("/pengaturan");
        expect(tujuanDashboard(kartu("aset-belum-berlabel-qr", "P-24?filter[qr_terpasang]=false"), (p) => p === "asset.qr_print")).toBeNull();
    });

    it("rincian grafik mempertahankan kode filter kondisi/status", () => {
        expect(rincianDashboard(kartu("kondisi-aset", "P-15"), { kondisi: { BAIK: 17 } }, () => true)).toContainEqual({ label: "Baik", jumlah: 17, href: "/aset?kondisi=BAIK" });
        expect(rincianDashboard(kartu("status-aset", "P-15"), { status: { TERSEDIA: 3 } }, () => true)).toEqual(expect.arrayContaining([expect.objectContaining({ jumlah: 3, href: "/aset?status=TERSEDIA" })]));
        expect(rincianDashboard(kartu("kondisi-aset", "P-15"), {}, () => false)).toEqual([]);
    });

    it("klik KPI pengguna aktif diteruskan sampai filter API pengguna", async () => {
        const log = pasangServer((p) => {
            if (p.url === "/me") return sukses(ME_ADMIN);
            if (p.url === "/dashboard") return sukses({ templat: "R-01", kartu: [kartu("pengguna-aktif", "P-60?filter[status]=AKTIF")] });
            if (p.url.startsWith("/dashboard/cards/")) return sukses({ id: "pengguna-aktif", isi: { total: 17, per_role: [] }, rentang: null, diperbarui_pada: "2026-10-11T00:00:00Z" });
            return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 25, total: 0, total_pages: 1 } } };
        });
        await renderAplikasi("/");
        await userEvent.click(await screen.findByRole("link", { name: "pengguna-aktif, buka daftar sumbernya" }));
        await waitFor(() => expect(log.some((p) => p.url === "/users" && p.params["filter[status]"] === "AKTIF")).toBe(true));
    });

    it.each(["kondisi", "status"])("rincian %s dapat diakses dan diteruskan ke katalog", async (filter) => {
        const code = filter === "kondisi" ? "BAIK" : "TERSEDIA";
        const id = `${filter}-aset`;
        const log = pasangServer((p) => {
            if (p.url === "/me") return sukses({ ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "asset.view": "all" } });
            if (p.url === "/dashboard") return sukses({ templat: "R-02", kartu: [{ ...kartu(id, "P-15"), jenis: "GRAFIK_DONAT" }] });
            if (p.url.startsWith("/dashboard/cards/")) return sukses({ id, isi: { [filter]: { [code]: 17 } }, rentang: null, diperbarui_pada: "2026-10-11T00:00:00Z" });
            return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 25, total: 0, total_pages: 1 } } };
        });
        const { container } = await renderAplikasi("/");
        const link = await screen.findByRole("link", { name: new RegExp(`${id}, .*: 17 aset`) });
        expect(await pelanggaranAxe(container)).toEqual([]);
        await userEvent.click(link);
        await waitFor(() => expect(log.some((p) => p.url === "/assets" && p.params[`filter[${filter}]`] === code)).toBe(true));
    });

    it("klik QR memuat aset tanpa label tanpa perlu pencarian manual", async () => {
        const log = pasangServer((p) => {
            if (p.url === "/me") return sukses({ ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "asset.view": "all", "asset.qr_print": "all" } });
            if (p.url === "/dashboard") return sukses({ templat: "R-02", kartu: [kartu("aset-belum-berlabel-qr", "P-24?filter[qr_terpasang]=false")] });
            if (p.url.startsWith("/dashboard/cards/")) return sukses({ id: "aset-belum-berlabel-qr", isi: { jumlah: 2 }, rentang: null, diperbarui_pada: "2026-10-11T00:00:00Z" });
            return sukses([]);
        });
        await renderAplikasi("/");
        await userEvent.click(await screen.findByRole("link", { name: "aset-belum-berlabel-qr, buka daftar sumbernya" }));
        await waitFor(() => expect(log.some((p) => p.url === "/assets" && p.params["filter[qr_terpasang]"] === false)).toBe(true));
        expect(await screen.findByText(/Menampilkan aset yang belum berlabel QR/)).toBeTruthy();
    });
});
