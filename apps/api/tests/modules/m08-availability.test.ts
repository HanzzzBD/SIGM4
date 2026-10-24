import { describe, expect, it } from "vitest";
import { AssetAvailabilityQuerySchema } from "@sigm4/schemas";
import { nextAvailableStart } from "../../src/modules/m08-reservation-item/services/availability.service.js";
import { assetAvailabilityRoute } from "../../src/modules/m08-reservation-item/index.js";
import { buildOpenApiDocument } from "../../src/api/openapi.js";
import { registry } from "../../src/api/index.js";
import { RouteRegistry } from "../../src/shared/http/index.js";

describe("FR-08.1 — celah tersedia", () => {
    it("endpoint terdaftar; OpenAPI menyebut reservation.view dan query, bukan parameter path", () => {
        expect(registry.all()).toContain(assetAvailabilityRoute);
        const document = buildOpenApiDocument(new RouteRegistry().register(assetAvailabilityRoute), { version: "test" });
        const get = document.paths?.["/api/v1/assets/availability"]?.get;
        expect(get).toMatchObject({ "x-permission": "reservation.view" });
        expect(get?.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: "dari", in: "query" }), expect.objectContaining({ name: "kategori_id", in: "query" })]));
    });
    const slot = (start: number, end: number) => ({ mulai: new Date(start), selesai: new Date(end) });
    it("mengizinkan batas berdempetan [) dan mengabaikan slot sebelum rentang", () => {
        expect(nextAvailableStart(10, 5, 30, [slot(0, 10), slot(15, 20)])).toBe(10);
    });
    it("melewati rantai slot sampai celah mencukupi seluruh durasi", () => {
        expect(nextAvailableStart(10, 5, 40, [slot(10, 15), slot(18, 25), slot(26, 30)])).toBe(30);
    });
    it("tidak menyarankan celah yang melewati akhir horizon", () => {
        expect(nextAvailableStart(10, 5, 24, [slot(10, 20)])).toBeNull();
    });
    it("menolak rentang terbalik, saringan boolean ambigu, dan ID tidak sah", () => {
        const q = { dari: "2027-03-01T08:00:00+07:00", sampai: "2027-03-02T08:00:00+07:00" };
        expect(AssetAvailabilityQuerySchema.safeParse(q).success).toBe(true);
        expect(AssetAvailabilityQuerySchema.safeParse({ ...q, sampai: "2027-04-01T08:00:00+07:00" }).success).toBe(true);
        for (const patch of [{ sampai: q.dari }, { hanya_tersedia: "0" }, { kategori_id: -1 }, { per_page: 101 }]) expect(AssetAvailabilityQuerySchema.safeParse({ ...q, ...patch }).success).toBe(false);
    });
});
