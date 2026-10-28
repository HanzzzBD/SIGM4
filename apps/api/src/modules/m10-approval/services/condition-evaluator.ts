// ConditionEvaluator — Lampiran D.3/D.4, SDD-APR-01, SDD-02 §4.2. Fungsi MURNI (RE-01):
// tanpa I/O, tanpa jam sistem, tanpa acak. Dipakai pembentukan instance DAN pratinjau
// (SDD-APR-10) — tidak boleh ada evaluator kedua.
//
// Evaluator tidak pernah melempar atas fakta: bentuk yang tak terduga dinilai
// "tidak cocok" (semangat RE-02). Kesalahan DEFINISI aturan ditolak lebih awal,
// saat disimpan (RE-08, `rule-validator.ts`).

import type { Kondisi, Predikat } from "./dsl.js";
import { adalahGrup, adalahPredikat } from "./dsl.js";

export type Fakta = string | number | boolean | null | readonly (string | number)[];
/** Kamus fakta dari FactAdapter (SDD-APR-09). Field yang tak berlaku bagi jenisnya TIDAK ADA di sini. */
export type KamusFakta = Readonly<Record<string, Fakta>>;

export function evaluate(kondisi: Kondisi, fakta: KamusFakta): boolean {
    if (adalahGrup(kondisi)) {
        return kondisi.operator === "AND"
            ? kondisi.conditions.every((k) => evaluate(k, fakta))
            : kondisi.conditions.some((k) => evaluate(k, fakta));
    }
    if (adalahPredikat(kondisi)) return evaluasiPredikat(kondisi, fakta);
    return true; // `{}` — selalu cocok (D.1, BR-036)
}

function evaluasiPredikat(p: Predikat, fakta: KamusFakta): boolean {
    // RE-02: field yang tak berlaku bagi jenis pengajuan -> tidak cocok, bukan galat.
    if (!Object.prototype.hasOwnProperty.call(fakta, p.field)) return false;
    const f = fakta[p.field];
    // RE-03: null -> false, KECUALI is_false.
    if (f === null || f === undefined) return p.op === "is_false";

    switch (p.op) {
        case "is_true":
            return f === true;
        case "is_false":
            return f === false;
        case "eq":
            return !Array.isArray(f) && f === p.value;
        case "neq":
            return !Array.isArray(f) && typeof f === typeof p.value && f !== p.value;
        case "gt":
        case "gte":
        case "lt":
        case "lte":
            return typeof f === "number" && typeof p.value === "number" && banding(p.op, f, p.value);
        case "between": {
            if (typeof f !== "number" || !Array.isArray(p.value)) return false;
            const [min, max] = p.value as unknown[];
            return typeof min === "number" && typeof max === "number" && f >= min && f <= max; // inklusif (D.3)
        }
        case "in":
        case "not_in": {
            if (!Array.isArray(p.value)) return false;
            const himpunan = new Set(p.value as unknown[]);
            // Fakta array: IRISAN — satu elemen di himpunan sudah cukup (keputusan 66).
            const ada = Array.isArray(f) ? f.some((x) => himpunan.has(x)) : himpunan.has(f);
            return p.op === "in" ? ada : !ada;
        }
    }
}

function banding(op: "gt" | "gte" | "lt" | "lte", a: number, b: number): boolean {
    switch (op) {
        case "gt":
            return a > b;
        case "gte":
            return a >= b;
        case "lt":
            return a < b;
        case "lte":
            return a <= b;
    }
}
