// Kamus DSL kondisi approval — Lampiran D.1–D.3 (PRD approval-rule-dsl.md). Kamus field
// D.2 & operator D.3 tinggal di `@sigm4/schemas` agar web memakai sumber yang SAMA
// (SDD-FE-05, PR-02-34); struktur kondisi divalidasi Zod di sini — keputusan 66.
//
// Nilai enum dalam aturan adalah KODE TEKNIS (`R-07`, `LABORATORIUM`, `HILANG`), bukan
// label: contoh D.1/D.6 yang menulis "Siswa/OSIS" bersifat ilustratif, dan enum
// selalu disimpan sebagai kode (SDD-DB-02).

import type { Operator } from "@sigm4/schemas";
import { z } from "zod";

export type { DefinisiField, JenisPengajuan, Operator, TipeField } from "@sigm4/schemas";
export { FIELD_DSL, JENIS_PENGAJUAN, KEDALAMAN_GRUP_MAKS, OPERATOR_PER_TIPE } from "@sigm4/schemas";

export interface Predikat {
    readonly field: string;
    readonly op: Operator;
    readonly value?: unknown;
}

export interface Grup {
    readonly operator: "AND" | "OR";
    readonly conditions: readonly Kondisi[];
}

/** `{}` = selalu cocok (D.1, BR-036). */
export type Kondisi = Predikat | Grup | Readonly<Record<string, never>>;

const OPERATOR = z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "between", "is_true", "is_false"]);

/** Bentuk STRUKTUR saja; makna (field, tipe, nilai, kedalaman) diperiksa `rule-validator.ts`. */
export const PredikatSchema = z.strictObject({ field: z.string().min(1), op: OPERATOR, value: z.unknown().optional() });

export const KondisiSchema: z.ZodType<Kondisi> = z.lazy(() =>
    z.union([
        z.strictObject({}),
        PredikatSchema,
        z.strictObject({ operator: z.enum(["AND", "OR"]), conditions: z.array(KondisiSchema).min(1) }),
    ]),
);

export function adalahGrup(k: Kondisi): k is Grup {
    return "operator" in k;
}

export function adalahPredikat(k: Kondisi): k is Predikat {
    return "field" in k;
}
