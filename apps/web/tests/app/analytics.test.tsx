import { configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AnalyticsResponse, ReportExport } from "@sigm4/schemas";
import { ME_ADMIN, pasangServer, renderAplikasi, sukses, gagal, pelanggaranAxe } from "../helpers";
import { decimalDelta, decimalDisplay, displayValue } from "../../src/modules/m16-analytics/format";
configure({ asyncUtilTimeout: 5000 });
beforeAll(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); vi.spyOn(window,"scrollTo").mockImplementation(() => undefined); });
afterAll(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const time = "2026-10-14T03:00:00Z", period = { tanggal_mulai: "2026-10-01", tanggal_selesai: "2026-10-14", jumlah_hari: 14 };
const columns = [{ key: "grup", label: "ID aset", tipe: "TEXT" as const, sensitivitas: "PUBLIC" as const }, { key: "nama", label: "Aset", tipe: "TEXT" as const, sensitivitas: "PUBLIC" as const }, { key: "jumlah", label: "Jumlah", tipe: "NUMBER" as const, sensitivitas: "PUBLIC" as const }];
const report: AnalyticsResponse = { success: true, data: [{ grup: "11", nama: "Proyektor kelas", jumlah: 3 }], meta: { page: 1, per_page: 25, total: 30, total_pages: 2 }, report: { jenis: "rekapitulasi-aset", judul: "Rekapitulasi Aset", periode: period, filter: { bandingkan: true }, zona_waktu: "Asia/Jakarta", dibuat_pada: time, kolom: columns, kolom_ringkasan: [columns[2]!], ringkasan: { jumlah: 3 }, pembanding: { periode: { tanggal_mulai: "2026-09-17", tanggal_selesai: "2026-09-30", jumlah_hari: 14 }, ringkasan: { jumlah: 2 } }, metodologi: ["Cakupan penanggung jawab memakai data sekarang."] } };
const job: ReportExport = { id: "91", jenis: "rekapitulasi-aset", judul: "Rekapitulasi Aset", format: "XLSX", status: "MENUNGGU", jumlah_baris: null, pesan_galat: null, dibuat_pada: time, selesai_pada: null, berlaku_sampai: null };
const permissions = { "report.view": "all", "report.export": "all", "asset.view": "all" };
function serve(options: { permissions?: Record<string, string>; role?: string; empty?: boolean; uncertain?: boolean } = {}) {
    let failed = false, created = false;
    return pasangServer(p => {
        if (p.url === "/me") return sukses({ ...ME_ADMIN, user: { ...ME_ADMIN.user, role_kode: options.role ?? "R-01" }, permissions: options.permissions ?? permissions });
        if (p.url === "/analytics") return sukses([{ jenis: "rekapitulasi-aset", judul: "Rekapitulasi Aset", status: "SIAP", filter: ["room_id", "category_id"], kolom: columns }, { jenis: "kondisi-aset", judul: "Kondisi Aset", status: "BELUM_TERSEDIA", filter: ["room_id", "category_id"], kolom: [] }]);
        if (p.url.endsWith("/options")) return sukses({ rooms: [{ id: "4", nama: "Kelas 1" }], categories: [{ id: "2", nama: "Elektronik" }], units: [], roles: [] });
        if (p.url === "/analytics/rekapitulasi-aset") return { status: 200, data: options.empty ? { ...report, data: [], meta: { ...report.meta, total: 0, total_pages: 1 } } : report };
        if (p.url === "/report-exports") return sukses(created ? [job] : []);
        if (p.url.endsWith("/export")) { if (options.uncertain && !failed) { failed = true; return gagal(500, "INTERNAL_ERROR", "Hasil belum pasti"); } created = true; return { status: 202, data: { success: true, data: job, meta: null } }; }
        if (p.url === "/report-exports/91") return sukses({ ...job, status: "SIAP", jumlah_baris: 30, selesai_pada: time, berlaku_sampai: "2026-10-15T03:00:00Z" });
        return gagal(404, "NOT_FOUND", p.url);
    });
}
describe("PR-06-10/11 analytics and shared export UI", () => {
    it("catalogue hides unavailable calculations behind explicit status and passes accessibility checks", async () => {
        serve(); const { container } = await renderAplikasi("/analitik"); await screen.findByRole("link", { name: "Rekapitulasi Aset" }); expect(screen.queryByRole("link", { name: "Kondisi Aset" })).toBeNull(); expect(screen.getByText("Perhitungan belum tersedia")).toBeTruthy(); expect(await pelanggaranAxe(container)).toEqual([]);
    });
    it("graph has visible labels, exact summary/comparison, tabular alternative and authorized drilldown", async () => {
        serve(); const { container } = await renderAplikasi("/analitik/rekapitulasi-aset?bandingkan=true"); await screen.findByRole("table"); expect(screen.getByRole("region", { name: "Tabel analitik, dapat digulir" }).tabIndex).toBe(0); expect(screen.getByText(/Sebelumnya 2.*Selisih 1/)).toBeTruthy(); expect(within(screen.getByRole("region", { name: "Grafik laporan" })).getByText("Proyektor kelas")).toBeTruthy(); expect(screen.getByRole("link", { name: "Buka rincian Proyektor kelas" }).getAttribute("href")).toBe("/aset/11"); expect(await pelanggaranAxe(container)).toEqual([]);
    });
    it("filters, compare, sorting and pagination update URL and send the same query contract", async () => {
        const calls = serve(), { router } = await renderAplikasi("/analitik/rekapitulasi-aset"); await screen.findByRole("table"); fireEvent.change(screen.getByLabelText("Lokasi"), { target: { value: "4" } }); fireEvent.click(screen.getByRole("checkbox", { name: "Bandingkan dengan periode sebelumnya" })); fireEvent.click(screen.getByRole("button", { name: "Terapkan filter" })); await waitFor(() => expect(router.state.location.search).toMatchObject({ room_id: 4, bandingkan: "true", page: 1, tanggal_mulai: "2026-10-01", tanggal_selesai: "2026-10-14" }));
        fireEvent.click(await screen.findByRole("button", { name: /Jumlah, urutkan/ })); await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: "jumlah", page: 1 })); fireEvent.click(await screen.findByRole("button", { name: "Berikutnya" })); await waitFor(() => expect(router.state.location.search).toMatchObject({ page: 2 })); expect(calls.some(p => p.params.room_id === 4 && p.params.bandingkan === "true")).toBe(true);
    });
    it("empty report shows useful state and export uncertainty retains identical payload/idempotency key", async () => {
        const calls = serve({ empty: true, uncertain: true }); await renderAplikasi("/analitik/rekapitulasi-aset"); await screen.findByText("Tidak ada data pada rentang ini"); fireEvent.click(screen.getByRole("button", { name: "Ekspor seluruh hasil filter" })); await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", { name: "Ulangi pengiriman ekspor" })); await screen.findByText("Menunggu diproses"); const posts = calls.filter(p => p.url.endsWith("/export")); expect(posts).toHaveLength(2); expect(posts[0]!.data).toEqual(posts[1]!.data); expect(posts[0]!.headers["Idempotency-Key"]).toBe(posts[1]!.headers["Idempotency-Key"]); expect((posts[0]!.data as { filter: object }).filter).not.toHaveProperty("page");
    });
    it("notification deeplink opens its private ready file and lack of export permission hides actions", async () => {
        serve(); await renderAplikasi("/analitik/rekapitulasi-aset?ekspor=91"); expect(await screen.findByRole("button", { name: "Unduh XLSX #91" })).toBeTruthy();
    });
    it("read-only role sees tables and never requests export history", async () => {
        const calls = serve({ permissions: { "report.view": "all", "asset.view": "all" } }); await renderAplikasi("/analitik/rekapitulasi-aset"); await screen.findByRole("table"); expect(screen.queryByRole("button", { name: "Ekspor seluruh hasil filter" })).toBeNull(); expect(calls.some(p => p.url === "/report-exports")).toBe(false);
    });
    it("switching account in the same tab fetches a new report instead of reusing another account's cache", async () => {
        const options = { empty: false }, calls = serve(options), { queryClient } = await renderAplikasi("/analitik/rekapitulasi-aset"); await screen.findByRole("table"); options.empty = true;
        queryClient.setQueryData(["me"], { ...ME_ADMIN, user: { ...ME_ADMIN.user, id: "2" }, permissions });
        await screen.findByText("Tidak ada data pada rentang ini"); expect(calls.filter(p => p.url === "/analytics/rekapitulasi-aset")).toHaveLength(2);
    });
    it.each(["reservasi", "kerusakan"])("%s exports use the exact list filters and omit pagination", async route => {
        const calls = pasangServer(p => {
            if (p.url === "/me") return sukses({ ...ME_ADMIN, permissions: { "report.export": "all", "reservation.view": "all", "damage.view": "all" } });
            if (p.url === "/report-exports") return sukses([]);
            if (p.url.endsWith("/export")) return { status: 202, data: { success: true, data: { ...job, jenis: route === "reservasi" ? "reservations" : "damage-reports" }, meta: null } };
            if (p.url === "/reservations" || p.url === "/damage-reports") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 25, total: 0, total_pages: 0, jumlah_per_status: {} } } };
            return gagal(404, "NOT_FOUND", p.url);
        });
        await renderAplikasi(`/${route}?q=proyektor&dari=2026-10-01&sampai=2026-10-14&saya=true`); fireEvent.click(await screen.findByRole("button", { name: "Ekspor seluruh hasil filter" }));
        await waitFor(() => expect(calls.some(p => p.method === "POST")).toBe(true)); const post = calls.find(p => p.method === "POST")!;
        expect(post.url).toBe(route === "reservasi" ? "/reservations/export" : "/damage-reports/export"); expect(post.data).toMatchObject({ format: "XLSX", filter: { q: "proyektor", dari: "2026-10-01", sampai: "2026-10-14", [route === "reservasi" ? "pemohon" : "pelapor"]: "saya" } }); expect((post.data as { filter: object }).filter).not.toHaveProperty("page");
    });
    it("student is denied before any analytics request", async () => {
        const calls = serve({ role: "R-07" }), { router } = await renderAplikasi("/analitik"); await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses")); expect(calls.some(p => p.url.startsWith("/analytics"))).toBe(false);
    });
    it("exact decimal formatting/deltas preserve very large and negative fractional values", () => {
        expect(decimalDisplay("12345678901234567890.95")).toBe("12.345.678.901.234.567.890,95"); expect(decimalDisplay("-0.5")).toBe("-0,5"); expect(decimalDelta("12345678901234567890.95", "12345678901234567890.90")).toBe("0.05"); expect(decimalDelta("-0.5", "0.5")).toBe("-1.0");
    });
    it("financial sensitivity gates are independent of currency representation", () => {
        const sensitive = { key: "nilai", label: "Nilai", sensitivitas: "MAINTENANCE_COST" as const };
        expect(displayValue(3, { ...sensitive, tipe: "NUMBER" })).toBe("3");
        expect(displayValue("PEMBELIAN", { ...sensitive, tipe: "TEXT" })).toBe("PEMBELIAN");
        expect(displayValue("1000.25", { ...sensitive, tipe: "DECIMAL" })).toBe("Rp1.000,25");
    });
});
