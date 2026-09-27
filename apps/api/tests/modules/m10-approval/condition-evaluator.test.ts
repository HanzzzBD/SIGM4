// Evaluator DSL kondisi — Lampiran D.3/D.4. Acceptance PR-02-19: "seluruh operator
// D.2 teruji, termasuk kasus batas". Tiap operator diuji di sisi benar, sisi salah,
// dan tepat di batasnya.

import { describe, expect, it } from "vitest";
import { evaluate } from "../../../src/modules/m10-approval/services/condition-evaluator.js";
import type { KamusFakta } from "../../../src/modules/m10-approval/services/condition-evaluator.js";
import type { Kondisi, Operator } from "../../../src/modules/m10-approval/services/dsl.js";

const p = (field: string, op: Operator, value?: unknown): Kondisi =>
    value === undefined ? { field, op } : { field, op, value };

describe("operator perbandingan skalar (D.3)", () => {
    const f: KamusFakta = { total_value: 5_000_000, requester_role: "R-07" };

    it("eq / neq", () => {
        expect(evaluate(p("total_value", "eq", 5_000_000), f)).toBe(true);
        expect(evaluate(p("total_value", "eq", 5_000_001), f)).toBe(false);
        expect(evaluate(p("requester_role", "eq", "R-07"), f)).toBe(true);
        expect(evaluate(p("requester_role", "eq", "R-06"), f)).toBe(false);
        expect(evaluate(p("requester_role", "neq", "R-06"), f)).toBe(true);
        expect(evaluate(p("requester_role", "neq", "R-07"), f)).toBe(false);
    });

    it("gt / gte di batas: nilai sama hanya cocok bagi gte", () => {
        expect(evaluate(p("total_value", "gt", 4_999_999), f)).toBe(true);
        expect(evaluate(p("total_value", "gt", 5_000_000), f)).toBe(false);
        expect(evaluate(p("total_value", "gte", 5_000_000), f)).toBe(true);
        expect(evaluate(p("total_value", "gte", 5_000_001), f)).toBe(false);
    });

    it("lt / lte di batas: nilai sama hanya cocok bagi lte", () => {
        expect(evaluate(p("total_value", "lt", 5_000_001), f)).toBe(true);
        expect(evaluate(p("total_value", "lt", 5_000_000), f)).toBe(false);
        expect(evaluate(p("total_value", "lte", 5_000_000), f)).toBe(true);
        expect(evaluate(p("total_value", "lte", 4_999_999), f)).toBe(false);
    });

    it("between inklusif di kedua ujung", () => {
        const r = (v: number): boolean => evaluate(p("participant_count", "between", [10, 20]), { participant_count: v });
        expect(r(9)).toBe(false);
        expect(r(10)).toBe(true);
        expect(r(15)).toBe(true);
        expect(r(20)).toBe(true);
        expect(r(21)).toBe(false);
        expect(evaluate(p("participant_count", "between", [7, 7]), { participant_count: 7 })).toBe(true);
    });

    it("desimal: pecahan dibandingkan apa adanya", () => {
        expect(evaluate(p("asset_value_max", "gt", 1000.5), { asset_value_max: 1000.51 })).toBe(true);
        expect(evaluate(p("asset_value_max", "gt", 1000.5), { asset_value_max: 1000.5 })).toBe(false);
    });

    it("tipe fakta tak sesuai -> tidak cocok, bukan galat", () => {
        expect(evaluate(p("total_value", "gt", 1), { total_value: "9" })).toBe(false);
        expect(evaluate(p("total_value", "neq", 1), { total_value: "9" })).toBe(false);
        expect(evaluate(p("total_value", "between", [1, 9]), { total_value: "5" })).toBe(false);
    });
});

describe("in / not_in", () => {
    it("fakta skalar: keanggotaan himpunan", () => {
        const f = { room_type: "LABORATORIUM" };
        expect(evaluate(p("room_type", "in", ["AULA", "LABORATORIUM"]), f)).toBe(true);
        expect(evaluate(p("room_type", "in", ["AULA"]), f)).toBe(false);
        expect(evaluate(p("room_type", "not_in", ["AULA"]), f)).toBe(true);
        expect(evaluate(p("room_type", "not_in", ["LABORATORIUM"]), f)).toBe(false);
    });

    it("fakta array: irisan — satu elemen cukup (keputusan 66)", () => {
        const f = { asset_category_id: [3, 7, 9] };
        expect(evaluate(p("asset_category_id", "in", [9]), f)).toBe(true);
        expect(evaluate(p("asset_category_id", "in", [1, 2]), f)).toBe(false);
        expect(evaluate(p("asset_category_id", "not_in", [1, 2]), f)).toBe(true);
        expect(evaluate(p("asset_category_id", "not_in", [1, 7]), f)).toBe(false);
    });

    it("fakta array kosong: in tidak cocok, not_in cocok", () => {
        expect(evaluate(p("room_id", "in", [1]), { room_id: [] })).toBe(false);
        expect(evaluate(p("room_id", "not_in", [1]), { room_id: [] })).toBe(true);
    });

    it("eq pada fakta array tidak pernah cocok", () => {
        expect(evaluate(p("room_id", "eq", 1), { room_id: [1] })).toBe(false);
    });
});

describe("boolean: is_true / is_false / eq", () => {
    it("is_true dan is_false", () => {
        expect(evaluate(p("is_recurring", "is_true"), { is_recurring: true })).toBe(true);
        expect(evaluate(p("is_recurring", "is_true"), { is_recurring: false })).toBe(false);
        expect(evaluate(p("is_recurring", "is_false"), { is_recurring: false })).toBe(true);
        expect(evaluate(p("is_recurring", "is_false"), { is_recurring: true })).toBe(false);
        expect(evaluate(p("is_recurring", "eq", true), { is_recurring: true })).toBe(true);
    });

    it("is_true hanya menerima true sejati, bukan nilai truthy", () => {
        expect(evaluate(p("is_recurring", "is_true"), { is_recurring: 1 })).toBe(false);
        expect(evaluate(p("is_recurring", "is_false"), { is_recurring: 0 })).toBe(false);
    });
});

describe("RE-02 / RE-03", () => {
    it("RE-02: field yang tidak ada pada fakta -> tidak cocok, untuk operator apa pun", () => {
        const ops: [Operator, unknown][] = [["eq", 1], ["neq", 1], ["gt", 1], ["lt", 1], ["between", [0, 9]], ["in", [1]], ["not_in", [1]], ["is_true", undefined], ["is_false", undefined]];
        for (const [op, v] of ops) expect(evaluate(p("total_value", op, v), { item_count: 3 }), op).toBe(false);
    });

    it("RE-03: null -> false, kecuali is_false", () => {
        const f = { requester_has_overdue: null, total_value: null };
        expect(evaluate(p("requester_has_overdue", "is_false"), f)).toBe(true);
        expect(evaluate(p("requester_has_overdue", "is_true"), f)).toBe(false);
        expect(evaluate(p("total_value", "neq", 5), f)).toBe(false);
        expect(evaluate(p("total_value", "not_in", [5]), f)).toBe(false);
        expect(evaluate(p("total_value", "lte", 5), f)).toBe(false);
    });

    it("tidak membaca properti warisan prototipe sebagai fakta", () => {
        expect(evaluate(p("toString", "not_in", ["x"]), {})).toBe(false);
    });
});

describe("grup (D.1)", () => {
    const f = { requester_role: "R-07", item_count: 3, total_value: null };
    const benar = p("requester_role", "eq", "R-07");
    const salah = p("item_count", "gt", 10);

    it("`{}` selalu cocok", () => {
        expect(evaluate({}, {})).toBe(true);
    });

    it("AND: semua anak harus cocok", () => {
        expect(evaluate({ operator: "AND", conditions: [benar, benar] }, f)).toBe(true);
        expect(evaluate({ operator: "AND", conditions: [benar, salah] }, f)).toBe(false);
    });

    it("OR: cukup satu anak cocok", () => {
        expect(evaluate({ operator: "OR", conditions: [salah, benar] }, f)).toBe(true);
        expect(evaluate({ operator: "OR", conditions: [salah, salah] }, f)).toBe(false);
    });

    it("grup bersarang tiga tingkat", () => {
        const k: Kondisi = {
            operator: "AND",
            conditions: [benar, { operator: "OR", conditions: [salah, { operator: "AND", conditions: [benar, p("item_count", "eq", 3)] }] }],
        };
        expect(evaluate(k, f)).toBe(true);
        expect(evaluate(k, { ...f, item_count: 4 })).toBe(false);
    });
});
