import { configure, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReportExport } from "@sigm4/schemas";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
configure({ asyncUtilTimeout: 5000 });
afterEach(() => vi.restoreAllMocks());
const time = "2026-10-15T03:00:00Z";
const job: ReportExport = { id: "91", jenis: "assets", judul: "Katalog Aset", format: "XLSX", status: "MENUNGGU", jumlah_baris: null, pesan_galat: null, dibuat_pada: time, selesai_pada: null, berlaku_sampai: null };
const ready = { ...job, status: "SIAP" as const, jumlah_baris: 36, selesai_pada: time, berlaku_sampai: "2026-10-16T03:00:00Z" };
const permissions = { "asset.view": "all", "asset.export": "all" };
function serve(options: { readonly readOnly?: boolean; readonly uncertain?: boolean; readonly failed?: boolean } = {}) {
    let created = false, uncertain = false;
    return pasangServer(p => {
        if (p.url === "/me") return sukses({ ...ME_ADMIN, permissions: options.readOnly ? { "asset.view": "all" } : permissions });
        if (p.url === "/asset-categories") return sukses([{ id: "3", parent_id: null, nama: "Laptop" }]);
        if (p.url === "/assets") return { status: 200, data: { success: true, data: [{ id: "12", kode_barang: "LAB-0012", nama: "Laptop Guru", merek: "Lenovo", nomor_seri: "0012", tahun_perolehan: 2026, kondisi: "BAIK", status: "TERSEDIA", dapat_dipinjam: true, kategori_nama: "Laptop", lokasi: { ruang: "Kelas", gedung: "Gedung" } }], meta: { total: 36, total_pages: 2, page: 2, per_page: 25 } } };
        if (p.url === "/assets/exports") return sukses(created ? [ready] : []);
        if (p.url === "/assets/export") {
            if (options.uncertain && !uncertain) { uncertain = true; return gagal(500, "INTERNAL_ERROR", "Hasil pengiriman belum pasti"); }
            created = true; return { status: 202, data: { success: true, data: job, meta: null } };
        }
        if (p.url === "/assets/exports/91") return sukses(options.failed ? { ...job, status: "DIBATALKAN", pesan_galat: "Izin atau cakupan berubah. Buat ekspor ulang." } : ready);
        if (p.url === "/assets/exports/91/download") return sukses({ url: "https://storage.test/private/asset-export.xlsx", expires_at: time, nama_berkas: "assets-91.xlsx" });
        return gagal(404, "NOT_FOUND", p.url);
    });
}
describe("PR-02-47 ekspor pada Inventaris", () => {
    it("asset.export saja cukup; GET memakai seluruh filter URL tanpa pagination dan lolos axe", async () => {
        const calls = serve(); const { container } = await renderAplikasi("/aset?q=Lenovo&kategori=3&lokasi=10&kondisi=BAIK&status=TERSEDIA&tahun=2026&pinjam=true&impor=9&urut=-nama&page=2&per=50");
        await screen.findByRole("table"); expect(await pelanggaranAxe(container)).toEqual([]);
        fireEvent.change(screen.getByLabelText("Format ekspor"), { target: { value: "PDF" } }); fireEvent.click(screen.getByRole("button", { name: "Ekspor seluruh hasil filter" }));
        await waitFor(() => expect(calls.some(p => p.url === "/assets/export")).toBe(true));
        const request = calls.find(p => p.url === "/assets/export")!; expect(request.method).toBe("GET"); expect(request.params).toMatchObject({ format: "PDF", q: "Lenovo", sort: "-nama", "filter[kategori_id]": 3, "filter[lokasi_id]": 10, "filter[kondisi]": "BAIK", "filter[status]": "TERSEDIA", "filter[tahun_perolehan]": 2026, "filter[dapat_dipinjam]": true, "filter[import_job_id]": 9 });
        expect(request.params).not.toHaveProperty("page"); expect(request.params).not.toHaveProperty("per_page"); expect(request.headers["Idempotency-Key"]).toMatch(/^[\da-f-]{36}$/);
        expect(calls.some(p => p.url.startsWith("/report-exports"))).toBe(false);
    });
    it("tanpa asset.export kendali dan permintaan riwayat tidak muncul", async () => {
        const calls = serve({ readOnly: true }); await renderAplikasi("/aset"); await screen.findByRole("table");
        expect(screen.queryByRole("button", { name: "Ekspor seluruh hasil filter" })).toBeNull(); expect(calls.some(p => p.url.startsWith("/assets/export"))).toBe(false);
    });
    it("notifikasi membuka status yang siap; unduh meminta URL baru, tanpa pengajuan ulang", async () => {
        const calls = serve(); await renderAplikasi("/aset?ekspor=91"); const button = await screen.findByRole("button", { name: "Unduh XLSX #91" });
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined); fireEvent.click(button);
        await waitFor(() => expect(click).toHaveBeenCalled()); expect(calls.some(p => p.url === "/assets/exports/91/download")).toBe(true); expect(calls.some(p => p.url === "/assets/export")).toBe(false);
    });
    it("pengiriman tidak pasti mempertahankan kunci dan filter awal walaupun filter katalog berubah", async () => {
        const calls = serve({ uncertain: true }); const { router } = await renderAplikasi("/aset?q=awal"); await screen.findByRole("table");
        fireEvent.click(screen.getByRole("button", { name: "Ekspor seluruh hasil filter" })); await screen.findByRole("alert");
        await router.navigate({ to: "/aset", search: { q: "baru" } }); fireEvent.click(await screen.findByRole("button", { name: "Ulangi pengiriman ekspor" }));
        await screen.findByRole("button", { name: "Unduh XLSX #91" }); const attempts = calls.filter(p => p.url === "/assets/export"); expect(attempts).toHaveLength(2); expect(attempts[0]!.params).toEqual(attempts[1]!.params); expect(attempts[0]!.headers["Idempotency-Key"]).toBe(attempts[1]!.headers["Idempotency-Key"]);
    });
    it("job batal menampilkan alasan dan perubahan akun mengosongkan job sebelumnya", async () => {
        const calls = serve({ failed: true }); const { queryClient } = await renderAplikasi("/aset?ekspor=91"); await screen.findByText(/Izin atau cakupan berubah/);
        expect(screen.queryByRole("button", { name: "Unduh XLSX #91" })).toBeNull();
        queryClient.setQueryData(["me"], { ...ME_ADMIN, user: { ...ME_ADMIN.user, id: "2" }, permissions: { "asset.view": "all" } });
        await waitFor(() => expect(screen.queryByText(/Izin atau cakupan berubah/)).toBeNull()); expect(calls.some(p => p.url === "/report-exports")).toBe(false);
    });
});
