import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/shared/db/index.js";
import { createAuthContext } from "../../../src/shared/auth/index.js";
import { AuditLogger } from "../../../src/shared/audit/index.js";
import { FixedClock } from "../../../src/shared/clock/index.js";
import { LocationService } from "../../../src/modules/m03-locations/services/location.service.js";
import { exportLocation } from "../../../src/modules/m03-locations/services/location-export.js";
import { ListRoomAssetsQuerySchema } from "../../../src/modules/m04-assets/schemas/asset.schema.js";

const repo = vi.hoisted(() => ({ listAllBuildings: vi.fn(), listAllAreas: vi.fn(), listAllRooms: vi.fn(), assetCounts: vi.fn() }));
vi.mock("../../../src/modules/m03-locations/repositories/location.repository.js", () => ({ createLocationRepository: () => repo }));
const ctx = createAuthContext({ userId: 1, roleCode: "R-01", scopes: new Map([["location.view", "all"]]) });
const db = {} as Kysely<Database>;
const clock = new FixedClock(new Date("2026-10-11T00:00:00Z"));
const audit = new AuditLogger({ clock });

describe("PR-01-21 — hitungan lokasi", () => {
    it("rollup memisahkan cabang, mempertahankan nol dan menghitung ruangan nonaktif", async () => {
        repo.listAllBuildings.mockResolvedValue([{ id: "1" }, { id: "2" }]);
        repo.listAllAreas.mockResolvedValue([{ id: "10", building_id: "1" }, { id: "11", building_id: "1" }, { id: "20", building_id: "2" }]);
        repo.listAllRooms.mockResolvedValue([{ id: "100", area_id: "10", status: "NONAKTIF" }, { id: "101", area_id: "10" }, { id: "102", area_id: "11" }]);
        repo.assetCounts.mockResolvedValue([{ room_id: "100", jumlah: "500" }, { room_id: "102", jumlah: "2" }]);
        const tree = await new LocationService(db, audit).getTree(ctx);
        expect(tree.map((b) => b.jumlah_aset)).toEqual([502, 0]);
        expect(tree[0]?.areas.map((a) => a.jumlah_aset)).toEqual([500, 2]);
        expect(tree[0]?.areas[0]?.rooms.map((r) => r.jumlah_aset)).toEqual([500, 0]);
    });
    it("validasi pencarian trim, kombinasi saringan dan batas 200 karakter", () => {
        expect(ListRoomAssetsQuerySchema.parse({ q: " PC ", kategori_id: "4", kondisi: "BAIK", status: "TERSEDIA" })).toMatchObject({ q: "PC", kategori_id: 4, kondisi: "BAIK", status: "TERSEDIA" });
        expect(ListRoomAssetsQuerySchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
    });
    it("ekspor tanpa report.export ditolak sebelum membuka transaksi", async () => {
        const render = vi.fn();
        await expect(exportLocation(db, audit, clock, { render }, ctx, 1, { format: "xlsx" })).rejects.toMatchObject({ kode: "INSUFFICIENT_PERMISSION" });
        expect(render).not.toHaveBeenCalled();
    });
});
