// Pemilihan aturan — RE-04 (prioritas, seri -> id terkecil), RE-06 (aturan bawaan).

import { describe, expect, it } from "vitest";
import { ATURAN_BAWAAN, selectRule } from "../../../src/modules/m10-approval/services/rule-selector.js";

const siswa = { field: "requester_role", op: "eq", value: "R-07" } as const;
const mahal = { field: "total_value", op: "gt", value: 1_000_000 } as const;

describe("selectRule", () => {
    it("RE-04: prioritas tertinggi menang, tanpa bergantung urutan masukan", () => {
        const rules = [
            { id: 1, prioritas: 10, kondisi: siswa },
            { id: 2, prioritas: 50, kondisi: {} },
            { id: 3, prioritas: 30, kondisi: siswa },
        ];
        const f = { requester_role: "R-07" };
        expect(selectRule(rules, f).terpilih?.id).toBe(2);
        expect(selectRule([...rules].reverse(), f).terpilih?.id).toBe(2);
        expect(selectRule(rules, f).cocok.map((r) => r.id)).toEqual([2, 3, 1]);
    });

    it("RE-04: prioritas seri -> id terkecil", () => {
        const rules = [
            { id: 9, prioritas: 20, kondisi: siswa },
            { id: 4, prioritas: 20, kondisi: {} },
            { id: 7, prioritas: 20, kondisi: siswa },
        ];
        expect(selectRule(rules, { requester_role: "R-07" }).terpilih?.id).toBe(4);
    });

    it("aturan yang tidak cocok tidak ikut, meski prioritasnya tertinggi", () => {
        const rules = [
            { id: 1, prioritas: 99, kondisi: mahal },
            { id: 2, prioritas: 1, kondisi: siswa },
        ];
        const hasil = selectRule(rules, { requester_role: "R-07", total_value: 500 });
        expect(hasil.terpilih?.id).toBe(2);
        expect(hasil.cocok.map((r) => r.id)).toEqual([2]);
    });

    it("RE-06: tak ada yang cocok -> terpilih null (berlaku ATURAN_BAWAAN)", () => {
        expect(selectRule([{ id: 1, prioritas: 1, kondisi: mahal }], { total_value: 1 })).toEqual({ terpilih: null, cocok: [] });
        expect(selectRule([], {})).toEqual({ terpilih: null, cocok: [] });
    });

    it("tidak mengubah larik masukan", () => {
        const rules = [
            { id: 2, prioritas: 1, kondisi: {} },
            { id: 1, prioritas: 5, kondisi: {} },
        ];
        selectRule(rules, {});
        expect(rules.map((r) => r.id)).toEqual([2, 1]);
    });
});

describe("ATURAN_BAWAAN (RE-06, BR-036)", () => {
    it("satu level, role Petugas Sarana Prasarana (R-02), SLA 24 jam, kondisi selalu cocok", () => {
        expect(ATURAN_BAWAAN.kondisi).toEqual({});
        expect(ATURAN_BAWAAN.steps).toHaveLength(1);
        expect(ATURAN_BAWAAN.steps[0]).toMatchObject({ order: 1, approver_type: "role", approver_role: "R-02", sla_hours: 24 });
    });
});
