// Validasi definisi kondisi saat SIMPAN — RE-08, SDD-APR-02. Dua lapis:
//   1. struktur (Zod `KondisiSchema`): bentuk grup/predikat/`{}`, operator dikenal;
//   2. makna (D.2/D.3): field dikenal, berlaku bagi jenis pengajuan aturan
//      (keputusan 66), operator sah bagi tipe field, bentuk `value` sesuai
//      operator, kedalaman grup ≤ KEDALAMAN_GRUP_MAKS.
// Seluruh pelanggaran dikumpulkan sekaligus, lalu ditolak 422 INVALID_RULE_DEFINITION.

import { DomainError } from "../../../shared/errors/domain-error.js";
import type { DefinisiField, JenisPengajuan, Kondisi, Predikat } from "./dsl.js";
import { FIELD_DSL, KEDALAMAN_GRUP_MAKS, KondisiSchema, OPERATOR_PER_TIPE, adalahGrup, adalahPredikat } from "./dsl.js";

export interface PelanggaranAturan {
    readonly field: string;
    readonly message: string;
}

const PESAN_TIDAK_VALID = "Definisi kondisi aturan persetujuan tidak valid.";

/** Melempar `INVALID_RULE_DEFINITION` bila `kondisi` tidak sah; bila sah, mengembalikannya bertipe. */
export function validateCondition(kondisi: unknown, jenis: JenisPengajuan): Kondisi {
    const hasil = KondisiSchema.safeParse(kondisi);
    if (!hasil.success) {
        const errors = hasil.error.issues.map((i) => ({
            field: jalur(["kondisi", ...i.path.map(String)]),
            message: "Struktur kondisi tidak sesuai Lampiran D.1.",
        }));
        throw new DomainError("INVALID_RULE_DEFINITION", PESAN_TIDAK_VALID, { errors });
    }
    const errors: PelanggaranAturan[] = [];
    periksa(hasil.data, jenis, ["kondisi"], 0, errors);
    if (errors.length > 0) throw new DomainError("INVALID_RULE_DEFINITION", PESAN_TIDAK_VALID, { errors });
    return hasil.data;
}

function periksa(k: Kondisi, jenis: JenisPengajuan, path: string[], kedalaman: number, errors: PelanggaranAturan[]): void {
    if (adalahGrup(k)) {
        // D.1: kedalaman dihitung per tingkat GRUP (keputusan 66).
        if (kedalaman + 1 > KEDALAMAN_GRUP_MAKS) {
            errors.push({ field: jalur(path), message: `Kedalaman grup melebihi ${KEDALAMAN_GRUP_MAKS} tingkat.` });
            return;
        }
        k.conditions.forEach((anak, i) => periksa(anak, jenis, [...path, "conditions", String(i)], kedalaman + 1, errors));
        return;
    }
    if (adalahPredikat(k)) periksaPredikat(k, jenis, path, errors);
}

function periksaPredikat(p: Predikat, jenis: JenisPengajuan, path: string[], errors: PelanggaranAturan[]): void {
    const tambah = (sub: string, message: string): void => void errors.push({ field: jalur([...path, sub]), message });
    const def = Object.prototype.hasOwnProperty.call(FIELD_DSL, p.field) ? FIELD_DSL[p.field] : undefined;
    if (def === undefined) return tambah("field", `Field "${p.field}" tidak dikenal (Lampiran D.2).`);
    if (!def.berlaku.includes(jenis)) {
        return tambah("field", `Field "${p.field}" tidak berlaku bagi jenis pengajuan ${jenis}.`);
    }
    if (!OPERATOR_PER_TIPE[def.tipe].includes(p.op)) {
        return tambah("op", `Operator "${p.op}" tidak berlaku bagi field bertipe ${def.tipe}.`);
    }
    const galat = periksaNilai(p, def);
    if (galat !== null) tambah("value", galat);
}

/** Bentuk `value` per operator (D.3); `null` = sah. */
function periksaNilai(p: Predikat, def: DefinisiField): string | null {
    const ada = Object.prototype.hasOwnProperty.call(p, "value");
    switch (p.op) {
        case "is_true":
        case "is_false":
            return ada ? `Operator ${p.op} tidak menerima nilai.` : null;
        case "eq":
        case "neq":
            return ada && skalarSah(p.value, def) ? null : `Nilai harus satu ${uraian(def)}.`;
        case "gt":
        case "gte":
        case "lt":
        case "lte":
            return ada && skalarSah(p.value, def) ? null : `Nilai harus ${uraian(def)}.`;
        case "between": {
            const v = p.value;
            if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => skalarSah(x, def))) {
                return `Nilai harus pasangan [min, max] ${uraian(def)}.`;
            }
            return (v[0] as number) <= (v[1] as number) ? null : "Batas bawah melebihi batas atas.";
        }
        case "in":
        case "not_in": {
            const v = p.value;
            if (!Array.isArray(v) || v.length === 0 || !v.every((x) => skalarSah(x, def))) {
                return `Nilai harus larik tidak kosong berisi ${uraian(def)}.`;
            }
            return null;
        }
    }
}

/** Satu skalar sesuai tipe field — bagi field array, tipe ELEMENNYA. */
function skalarSah(v: unknown, def: DefinisiField): boolean {
    switch (def.tipe) {
        case "enum":
            return typeof v === "string" && v.length > 0 && (def.nilaiSah === undefined || def.nilaiSah.includes(v));
        case "integer":
        case "integer_array":
            return Number.isSafeInteger(v);
        case "decimal":
            return typeof v === "number" && Number.isFinite(v);
        case "boolean":
            return typeof v === "boolean";
    }
}

function uraian(def: DefinisiField): string {
    switch (def.tipe) {
        case "enum":
            return def.nilaiSah === undefined ? "kode teks" : `salah satu dari ${def.nilaiSah.join(", ")}`;
        case "integer":
        case "integer_array":
            return "bilangan bulat";
        case "decimal":
            return "bilangan";
        case "boolean":
            return "boolean";
    }
}

function jalur(bagian: readonly string[]): string {
    return bagian.join(".");
}
