import { describe, expect, it } from "vitest";
import { verifyBody, workOrderBody } from "../src/features/damage/staff.js";
import { managesWorkOrders, verifyWorkOrderBody } from "../src/features/workorders/model.js";
import { visibleMenu } from "../src/features/menu/model.js";

const assign = { technician: "4", target: "2026-11-10", estimate: "", disableAsset: true };

describe("MS-60 verifikasi tiket (FR-11.2)", () => {
    it("requires a note when the ticket is closed and attaches assignment only to follow-ups", () => {
        expect(verifyBody({ decision: "TOLAK", note: "", condition: "", conditionReason: "", assign: null })).toEqual({ error: "Alasan penolakan wajib diisi." });
        expect(verifyBody({ decision: "PERBAIKAN_RINGAN", note: "Baut dikencangkan", condition: "BAIK", conditionReason: "Sudah normal", assign: null })).toEqual({ body: { keputusan: "PERBAIKAN_RINGAN", catatan: "Baut dikencangkan", kondisi_aset: { kondisi: "BAIK", alasan: "Sudah normal" } } });
        expect(verifyBody({ decision: "TINDAK_LANJUT", note: "", condition: "", conditionReason: "", assign })).toEqual({ body: { keputusan: "TINDAK_LANJUT", work_order: { teknisi_id: 4, target_selesai: "2026-11-10", estimasi_biaya: 0, nonaktifkan_aset: true } } });
        expect(verifyBody({ decision: "TOLAK", note: "Bukan kerusakan", condition: "", conditionReason: "", assign })).toEqual({ body: { keputusan: "TOLAK", catatan: "Bukan kerusakan" } });
    });
});

describe("MS-62 buat work order (FR-12.1)", () => {
    const base = { ticket: "", asset: "", room: "", description: "Ganti lampu", priority: "SEDANG" as const, assign };
    it("needs a technician and exactly one object unless created from a ticket", () => {
        expect(workOrderBody({ ...base, assign: { ...assign, technician: "" } })).toEqual({ error: "Pilih teknisi." });
        expect(workOrderBody(base)).toHaveProperty("error");
        expect(workOrderBody({ ...base, ticket: "8", asset: "3" })).toMatchObject({ body: { damage_report_id: 8 } });
        expect(workOrderBody({ ...base, ticket: "8", asset: "3" })).not.toMatchObject({ body: { asset_id: 3 } });
        expect(workOrderBody({ ...base, room: "5", assign: { ...assign, estimate: "150000" } })).toMatchObject({ body: { room_id: 5, estimasi_biaya: 150000, prioritas: "SEDANG" } });
    });
});

describe("verifikasi hasil WO (FR-12.4)", () => {
    it("requires the post-repair condition for assets when closing and a note when returning", () => {
        expect(verifyWorkOrderBody(true, "", "", true)).toEqual({ error: "Pilih kondisi aset sesudah perbaikan." });
        expect(verifyWorkOrderBody(true, "", "BAIK", true)).toEqual({ body: { keputusan: "TUTUP", kondisi_pasca: "BAIK" } });
        expect(verifyWorkOrderBody(true, "", "", false)).toEqual({ body: { keputusan: "TUTUP" } });
        expect(verifyWorkOrderBody(false, " ", "BAIK", true)).toEqual({ error: "Catatan pengembalian wajib diisi." });
        expect(verifyWorkOrderBody(false, "Foto kurang", "BAIK", true)).toEqual({ body: { keputusan: "KEMBALIKAN", catatan: "Foto kurang" } });
    });
    it("shows the whole queue only to WO managers and opens the manager list from the menu", () => {
        expect(managesWorkOrders({ "workorder.view": "assigned", "workorder.execute": "assigned" })).toBe(false);
        expect(managesWorkOrders({ "workorder.view": "all", "workorder.verify": "all" })).toBe(true);
        expect(visibleMenu({ "workorder.view": "all", "damage.view": "all" }).find((g) => g.group === "PERAWATAN")?.entries.map((e) => [e.id, e.path])).toEqual([["MS-59", "/kerusakan"], ["MS-61", "/work-order"]]);
    });
});
