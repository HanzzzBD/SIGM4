import { describe, expect, it } from "vitest";
import { createAuthContext } from "../../src/shared/auth/index.js";
import { maskWorkOrderCosts, tanggalWib } from "../../src/modules/m12-maintenance/services/work-order.service.js";
import { eventHandlers } from "../../src/worker/index.js";

describe("PR-04-05/06 keamanan dan bootstrap work order", () => {
    it("workorder.view tidak memberikan maintenance.view_cost secara implisit", () => {
        const row = { id: "1", teknisi_id:"4", estimasi_biaya: "50000.00", biaya: "25000.00" };
        const viewer = createAuthContext({ userId: 4, roleCode: "R-04", scopes: new Map([["workorder.view", "assigned"]]) });
        expect(maskWorkOrderCosts(viewer, row)).toEqual({ id: "1", teknisi_id:"4", estimasi_biaya: null, biaya: null });
        const financial = createAuthContext({ userId: 4, roleCode: "R-04", scopes: new Map([["maintenance.view_cost", "assigned"]]) });
        expect(maskWorkOrderCosts(financial, row)).toEqual(row);
        expect(maskWorkOrderCosts(financial,{...row,teknisi_id:"5"}).biaya).toBeNull();
        expect(row.biaya).toBe("25000.00");
    });
    it("target memakai tanggal WIB pada batas tengah malam", () => {
        expect(tanggalWib(new Date("2026-12-31T16:59:59Z"))).toBe("2026-12-31");
        expect(tanggalWib(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
    });
    it("worker memasang konsumen pembentukan WO dan notifikasinya tanpa bootstrap HTTP", () => {
        expect(eventHandlers.handlersFor("DamageReportVerified").length).toBeGreaterThanOrEqual(2);
        expect(eventHandlers.handlersFor("WorkOrderAssigned")).toHaveLength(1);
    });
});
