import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/shared/db/index.js";
import { createAuthContext } from "../../../src/shared/auth/index.js";
import { AuditLogger } from "../../../src/shared/audit/index.js";
import { FixedClock } from "../../../src/shared/clock/index.js";
import { exportAssets } from "../../../src/modules/m04-assets/services/asset-export.service.js";
const repo = vi.hoisted(() => ({ exportRows: vi.fn(), exportPrinter: vi.fn() }));
vi.mock("../../../src/modules/m04-assets/repositories/asset.repository.js", () => ({ createAssetRepository: () => repo }));
const clock = new FixedClock(new Date("2026-10-12T00:00:00Z"));
const audit = new AuditLogger({ clock });
const db = { transaction: () => ({ setIsolationLevel: () => ({ execute: async (f: (tx: unknown) => unknown) => f({}) }) }) } as unknown as Kysely<Database>;
const context = (money = false, roleCode = "R-02", scope: "all" | "restricted" = "all") => createAuthContext({ userId: 1, roleCode, scopes: new Map([["report.export", "all"], ["asset.view", scope], ...(money ? [["asset.view_financial", "all"] as const] : [])]) });
const ROW = { kode_barang: "PC-1", nama: '=HYPERLINK("evil") <script>', kategori_nama: "Komputer", gedung_nama: "Gedung A", ruang_nama: "Lab", merek: "Dell", model: "PC", nomor_seri: "0000123", tahun_perolehan: 2026, kondisi: "BAIK", status: "TERSEDIA", dapat_dipinjam: true, qr_terpasang: false, sumber_perolehan: "PEMBELIAN", nilai_perolehan: "9007199254740993.99" };
describe("PR-02-47 berkas ekspor katalog", () => {
    beforeEach(() => { vi.restoreAllMocks(); repo.exportPrinter.mockResolvedValue({ nama: "Petugas <script>" }); repo.exportRows.mockResolvedValue([ROW]); vi.spyOn(audit, "write").mockResolvedValue(true); });
    it("5000 unit tidak dipaginasi; metadata dan seluruh teks XLSX aman; angka uang tetap presisi", async () => {
        repo.exportRows.mockResolvedValue(Array.from({ length: 5000 }, (_, i) => ({ ...ROW, kode_barang: `PC-${i}` })));
        const bytes = await exportAssets(db, audit, clock, { render: vi.fn() }, context(true), { format: "xlsx", sort: "-nama", kondisi: "BAIK", dapat_dipinjam: false, qr_terpasang: false });
        const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]); const sheet = book.worksheets[0]!;
        expect(sheet.rowCount).toBe(5006); expect(sheet.getCell("B2").value).toContain("WIB"); expect(sheet.getCell("B3").value).toContain("Petugas <script>"); expect(sheet.getCell("B5").value).toBe(5000);
        expect(sheet.getCell("B7").value).toBe(ROW.nama); expect(sheet.getCell("B7").type).toBe(ExcelJS.ValueType.String); expect(sheet.getCell("H7").value).toBe("0000123"); expect(sheet.getCell("O7").value).toBe(ROW.nilai_perolehan);
        expect(repo.exportRows).toHaveBeenCalledWith(expect.anything(), { sort: "-nama", kondisi: "BAIK", dapatDipinjam: false, qrTerpasang: false }, true);
        expect(audit.write).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ aksi: "DATA_EXPORTED", nilaiSesudah: expect.objectContaining({ jumlah_baris: 5000, kolom_finansial: true }) }));
    }, 20000);
    it.each([context(), context(true, "R-07"), context(true, "R-02", "restricted")])("kolom finansial tidak muncul tanpa hak atau pada subset siswa", async (ctx) => {
        const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7")); await exportAssets(db, audit, clock, { render }, ctx, { format: "pdf", sort: "kode_barang" });
        const html = render.mock.calls[0]?.[0] as string; expect(html).not.toContain("Nilai perolehan"); expect(html).not.toContain(ROW.nilai_perolehan); expect(repo.exportRows.mock.calls.at(-1)?.[2]).toBe(false);
        expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
    });
    it("audit gagal membatalkan hasil; renderer gagal tidak menghasilkan audit ekspor", async () => {
        const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7")); vi.spyOn(audit, "write").mockRejectedValue(new Error("audit unavailable"));
        await expect(exportAssets(db, audit, clock, { render }, context(), { format: "pdf", sort: "kode_barang" })).rejects.toThrow("audit unavailable");
        vi.mocked(audit.write).mockClear(); render.mockRejectedValue(new Error("renderer unavailable")); await expect(exportAssets(db, audit, clock, { render }, context(), { format: "pdf", sort: "kode_barang" })).rejects.toThrow("renderer unavailable"); expect(audit.write).not.toHaveBeenCalled();
    });
    it("tanpa report.export ditolak sebelum repository dan renderer", async () => {
        const ctx = createAuthContext({ userId: 1, roleCode: "R-02", scopes: new Map([["asset.view", "all"]]) });
        await expect(exportAssets(db, audit, clock, { render: vi.fn() }, ctx, { format: "xlsx", sort: "kode_barang" })).rejects.toMatchObject({ kode: "INSUFFICIENT_PERMISSION" }); expect(repo.exportRows).not.toHaveBeenCalled();
    });
    it("audit fail-soft false tidak mengembalikan berkas", async () => {
        vi.spyOn(audit, "write").mockResolvedValue(false);
        await expect(exportAssets(db, audit, clock, { render: vi.fn() }, context(), { format: "xlsx", sort: "kode_barang" })).rejects.toMatchObject({ kode: "INTERNAL_ERROR" });
    });
});
