import { describe, expect, it } from "vitest";
import { changed, coreLocked, heldFrom, matrixPayload, modules, toggle } from "../src/features/roles/model.js";
import { checkModel, conditionCount, definitionErrors, emptyGroup, modelFrom, newPredicate, newStep, sortRules, swap, toDefinition, toTree, userIds } from "../src/features/approval-rules/model.js";
import type { SavedRule } from "../src/features/approval-rules/model.js";
import { MobileApiError } from "../src/shared/api/client.js";

const admin = { kode: "R-01", permissions: [{ kode: "role.update", scope: "ALL" as const }, { kode: "asset.view", scope: "OWN" as const }] };
const catalog = [{ kode: "role.update", modul: "M-02", aksi: "update", deskripsi: "Ubah role", inti: true }, { kode: "role.view", modul: "M-02", aksi: "view", deskripsi: "Lihat role", inti: true }, { kode: "asset.view", modul: "M-04", aksi: "view", deskripsi: "Lihat aset", inti: false }, { kode: "asset.qr_print", modul: "M-04", aksi: "qr_print", deskripsi: "Cetak QR", inti: false }];

describe("MS-81 matriks permission (FR-02.2)", () => {
    it("locks core permissions the Administrator already holds (A1)", () => {
        expect(coreLocked(admin, catalog[0]!)).toBe(true);
        expect(coreLocked(admin, catalog[1]!)).toBe(false);
        expect(coreLocked({ ...admin, kode: "R-02" }, catalog[0]!)).toBe(false);
        expect(coreLocked(admin, catalog[2]!)).toBe(false);
    });
    it("restores the original scope, defaults new grants to ALL and sends a full replacement", () => {
        const held = heldFrom(admin);
        expect(toggle(toggle(held, admin, "asset.view", false), admin, "asset.view", true)["asset.view"]).toBe("OWN");
        expect(toggle(held, admin, "asset.qr_print", true)["asset.qr_print"]).toBe("ALL");
        expect(matrixPayload({ ...held, "asset.view": null })).toEqual([{ kode: "role.update", scope: "ALL" }]);
        expect(changed(held, admin, catalog)).toBe(false);
        expect(changed({ ...held, "asset.view": "ALL" }, admin, catalog)).toBe(true);
        expect(modules(catalog).map((m) => [m.modul, m.items.map((p) => p.kode)])).toEqual([["M-02", ["role.view", "role.update"]], ["M-04", ["asset.view", "asset.qr_print"]]]);
    });
});

const rule: SavedRule = { id: 3, jenis_pengajuan: "PENGADAAN_BARANG", prioritas: 20, kondisi: { operator: "AND", conditions: [{ field: "total_value", op: "gt", value: 5000000 }, { operator: "OR", conditions: [{ field: "priority", op: "eq", value: "MENDESAK" }] }] }, steps: [{ order: 2, approver_type: "user", approver_user_id: 9, sla_hours: 48, on_sla_breach: "remind" }, { order: 1, approver_type: "role", approver_role: "R-02", sla_hours: 24, on_sla_breach: "escalate", escalate_to_user_id: 7 }], fallback_approver: null, terminal_on_exhausted_escalation: "hold_and_alert", status_aktif: true, versi: 4, updated_at: "2026-10-01T00:00:00Z" };

describe("MS-84 editor approval rule (FR-10.1, D.1–D.5)", () => {
    it("round-trips a nested rule, ordering steps by their saved order", () => {
        expect(toDefinition(modelFrom(rule))).toEqual({ jenis_pengajuan: "PENGADAAN_BARANG", prioritas: 20, kondisi: rule.kondisi, steps: [{ order: 1, approver_type: "role", approver_role: "R-02", sla_hours: 24, on_sla_breach: "escalate", escalate_to_user_id: 7 }, { order: 2, approver_type: "user", approver_user_id: 9, sla_hours: 48, on_sla_breach: "remind" }], fallback_approver: null, terminal_on_exhausted_escalation: "hold_and_alert" });
    });
    it("sends an empty root group as {} (always matches) and wraps a single predicate", () => {
        expect(toDefinition(modelFrom(null)).kondisi).toEqual({});
        expect(toTree({ field: "item_count", op: "gt", value: 3 })).toMatchObject({ kind: "grup", operator: "AND", children: [{ field: "item_count", op: "gt", value: 3 }] });
        expect(toTree(null).children).toEqual([]);
        expect(conditionCount(rule.kondisi)).toBe(2);
        expect(conditionCount({})).toBe(0);
    });
    it("drops escalation targets when reminding and starts predicates with a valid operator", () => {
        const m = modelFrom(rule), steps = m.steps.map((s) => ({ ...s, breach: "remind" as const }));
        expect(toDefinition({ ...m, steps }).steps.every((s) => !("escalate_to_user_id" in s))).toBe(true);
        expect(newPredicate("is_recurring").op).toBe("eq");
        expect(newPredicate("room_id").op).toBe("in");
        expect(userIds(m)).toEqual([7, 9]);
        expect(swap([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    });
    it("checks structure on the same paths the server reports", () => {
        const m = modelFrom(null);
        expect(checkModel(m)).toEqual({ "steps.0.approver_role": "Pilih role approver." });
        expect(checkModel({ ...m, prioritas: "-1", steps: [] })).toEqual({ prioritas: "Prioritas berupa bilangan bulat 0–1.000.000.", steps: "Aturan wajib memiliki sedikitnya satu langkah." });
        const step = { ...newStep(), approver: { type: "user" as const, role: "", user: null }, sla: "721", breach: "escalate" as const };
        expect(checkModel({ ...m, steps: [step], fallback: { type: "role", role: "", user: null } })).toEqual({ "steps.0.approver_user_id": "Pilih pengguna approver.", "steps.0.sla_hours": "SLA berupa bilangan bulat 1–720 jam.", "steps.0.escalate_to_user_id": "Pilih pengguna tujuan eskalasi.", "fallback_approver.approver_role": "Pilih role approver." });
        expect(checkModel({ ...m, steps: [{ ...newStep(), sla: "0", approver: { type: "role", role: "R-02", user: null } }] })).toEqual({ "steps.0.sla_hours": "SLA berupa bilangan bulat 1–720 jam." });
        expect(checkModel({ ...m, kondisi: emptyGroup(), steps: [{ ...newStep(), approver: { type: "role", role: "R-02", user: null } }] })).toEqual({});
    });
    it("maps 422 INVALID_RULE_DEFINITION details to node paths, stripping the preview prefix", () => {
        const e = new MobileApiError(422, "INVALID_RULE_DEFINITION", "Tidak valid", [{ field: "aturan_draf.kondisi.conditions.0.op", message: "Operator salah." }, { field: "kondisi.conditions.0.op", message: "Lagi." }]);
        expect(definitionErrors(e)).toEqual({ "kondisi.conditions.0.op": "Operator salah. Lagi." });
        expect(definitionErrors(new MobileApiError(409, "CONFLICT", "x"))).toBeNull();
    });
    it("orders rules per request type by priority then id (RE-04)", () => {
        const r = (id: number, jenis: SavedRule["jenis_pengajuan"], prioritas: number) => ({ ...rule, id, jenis_pengajuan: jenis, prioritas });
        expect(sortRules([r(1, "PENGADAAN_BARANG", 5), r(2, "RESERVASI_RUANGAN", 1), r(3, "PENGADAAN_BARANG", 9), r(4, "PENGADAAN_BARANG", 9)]).map((x) => x.id)).toEqual([2, 3, 4, 1]);
    });
});
