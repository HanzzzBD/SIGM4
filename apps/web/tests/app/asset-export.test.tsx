import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "asset.view": "all", "report.export": "all" } };
function server(exportPermission = true, denied = false) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(exportPermission ? ME : { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "asset.view": "all" } });
        if (p.url === "/assets/export") return denied ? gagal(403, "INSUFFICIENT_PERMISSION", "Ditolak.") : { status: 200, data: new Blob(["export bytes"], { type: "application/octet-stream" }) };
        if (p.url === "/assets") return { status: 200, data: { success: true, data: [], meta: { total: 0, page: 2, per_page: 50, total_pages: 0 } } };
        return sukses([]);
    });
}
afterEach(() => { vi.restoreAllMocks(); });
describe("PR-02-47 unduh katalog", () => {
    it.each(["XLSX", "PDF"])("%s membawa filter dan urutan daftar, tanpa page/per_page", async (format) => {
        const create = vi.fn().mockReturnValue("blob:export"); Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        const log = server(); const { container } = await renderAplikasi("/aset?q=PC&kategori=3&lokasi=10&kondisi=BAIK&status=TERSEDIA&tahun=2026&pinjam=false&impor=7&urut=-nama&page=2&per=50");
        await userEvent.click(await screen.findByRole("button", { name: `Ekspor ${format}` })); await waitFor(() => expect(create).toHaveBeenCalledOnce()); expect(click).toHaveBeenCalledOnce();
        const params = log.find((p) => p.url === "/assets/export")?.params;
        expect(params).toMatchObject({ format: format.toLowerCase(), q: "PC", sort: "-nama", "filter[kategori_id]": "3", "filter[lokasi_id]": "10", "filter[kondisi]": "BAIK", "filter[status]": "TERSEDIA", "filter[tahun_perolehan]": 2026, "filter[dapat_dipinjam]": false, "filter[import_job_id]": 7 });
        expect(params).not.toHaveProperty("page"); expect(params).not.toHaveProperty("per_page"); expect(await pelanggaranAxe(container)).toEqual([]);
    });
    it("tanpa report.export tidak menampilkan aksi; penolakan server tidak mengunduh", async () => {
        let log = server(false); const app = await renderAplikasi("/aset"); await screen.findByRole("heading", { name: "Inventaris Aset" }); expect(screen.queryByRole("button", { name: "Ekspor XLSX" })).toBeNull(); expect(log.some((p) => p.url === "/assets/export")).toBe(false);
        app.unmount(); log = server(true, true); const create = vi.fn(); Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create }); await renderAplikasi("/aset"); await userEvent.click(await screen.findByRole("button", { name: "Ekspor PDF" })); await screen.findByText("Anda tidak dapat mengekspor katalog ini."); expect(create).not.toHaveBeenCalled(); expect(log.some((p) => p.url === "/assets/export")).toBe(true);
    });
});
