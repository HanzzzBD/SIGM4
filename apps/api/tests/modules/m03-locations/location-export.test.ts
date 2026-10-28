import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/shared/db/index.js";
import { createAuthContext } from "../../../src/shared/auth/index.js";
import { AuditLogger } from "../../../src/shared/audit/index.js";
import { FixedClock } from "../../../src/shared/clock/index.js";
import { exportLocation } from "../../../src/modules/m03-locations/services/location-export.js";

const repo = vi.hoisted(() => ({ exportIdentity: vi.fn(), printer: vi.fn(), exportAssets: vi.fn() }));
vi.mock("../../../src/modules/m03-locations/repositories/location.repository.js", () => ({ createLocationRepository: () => repo }));
const ctx = createAuthContext({ userId: 1, roleCode: "R-01", scopes: new Map([["location.view", "all"], ["report.export", "all"]]) });
const clock = new FixedClock(new Date("2026-10-11T00:00:00Z"));
const audit = new AuditLogger({ clock });
const db = { transaction: () => ({ setIsolationLevel: () => ({ execute: async (f: (scope: unknown) => unknown) => f({}) }) }) } as unknown as Kysely<Database>;

describe("PR-01-22 — ekspor pendukung lokasi", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        repo.exportIdentity.mockResolvedValue({ nama: "Lab <script>", kode: "LAB", area: "Lantai 1", gedung: "Gedung A" });
        repo.printer.mockResolvedValue({ nama: "Petugas" });
        repo.exportAssets.mockResolvedValue(Array.from({ length: 500 }, (_, i) => ({ kode_barang: `PC-${i}`, nama: "=HYPERLINK(\"bad\")", kondisi: "BAIK", status: "TERSEDIA" })));
    });
    it("XLSX memuat 500 hasil tanpa paginasi, identitas/WIB/pencetak dan formula sebagai teks; AL-10", async () => {
        const write = vi.spyOn(audit, "write").mockResolvedValue(true);
        const bytes = await exportLocation(db, audit, clock, { render: vi.fn() }, ctx, 3, { format: "xlsx", q: "PC", kondisi: "BAIK" });
        const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
        const sheet = workbook.worksheets[0]!;
        expect(sheet.rowCount).toBe(504);
        expect(sheet.getCell("B1").value).toContain("Gedung A / Lantai 1 / Lab <script>");
        expect(sheet.getCell("B2").value).toContain("WIB");
        expect(sheet.getCell("B3").value).toBe("Petugas (ID 1)");
        expect(sheet.getCell("B5").type).toBe(ExcelJS.ValueType.String);
        expect(write).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ aksi: "DATA_EXPORTED", nilaiSesudah: { filter: { format: "xlsx", q: "PC", kondisi: "BAIK" }, jumlah_baris: 500 } }));
    });
    it("PDF meng-escape teks pengguna dan gagal audit tidak mengembalikan berkas", async () => {
        vi.spyOn(audit, "write").mockRejectedValue(new Error("audit unavailable"));
        const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7"));
        await expect(exportLocation(db, audit, clock, { render }, ctx, 3, { format: "pdf" })).rejects.toThrow("audit unavailable");
        const html = render.mock.calls[0]?.[0] as string;
        expect(html).toContain("Lab &lt;script&gt;");
        expect(html).not.toContain("Lab <script>");
    });
    it("audit fail-soft false tetap menolak ekspor", async () => {
        vi.spyOn(audit, "write").mockResolvedValue(false);
        await expect(exportLocation(db, audit, clock, { render: vi.fn() }, ctx, 3, { format: "xlsx" })).rejects.toMatchObject({ kode: "INTERNAL_ERROR" });
    });
});
