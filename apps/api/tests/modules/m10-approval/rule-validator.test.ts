// Validasi definisi aturan saat simpan — RE-08, keputusan 66. Setiap penolakan
// harus berkode INVALID_RULE_DEFINITION dan menunjuk jalur yang salah.

import { describe, expect, it } from "vitest";
import { DomainError } from "../../../src/shared/errors/domain-error.js";
import type { JenisPengajuanApproval } from "../../../src/shared/db/schema.js";
import { JENIS_PENGAJUAN } from "../../../src/modules/m10-approval/services/dsl.js";
import type { JenisPengajuan } from "../../../src/modules/m10-approval/services/dsl.js";
import { validateCondition } from "../../../src/modules/m10-approval/services/rule-validator.js";

function tolak(kondisi: unknown, jenis: JenisPengajuan = "PENGADAAN_BARANG"): { field: string; message: string }[] {
    try {
        validateCondition(kondisi, jenis);
    } catch (e) {
        expect(e).toBeInstanceOf(DomainError);
        expect((e as DomainError).kode).toBe("INVALID_RULE_DEFINITION");
        return (e as DomainError).detail?.errors as { field: string; message: string }[];
    }
    throw new Error("diharapkan ditolak");
}

const pr = (field: string, op: string, value?: unknown): Record<string, unknown> =>
    value === undefined ? { field, op } : { field, op, value };

// Salinan lokal JENIS_PENGAJUAN wajib identik dengan tipe enum approval_request_type (schema.ts).
type Sama = [JenisPengajuan] extends [JenisPengajuanApproval]
    ? [JenisPengajuanApproval] extends [JenisPengajuan]
        ? true
        : false
    : false;

describe("JENIS_PENGAJUAN selaras enum approval_request_type", () => {
    it("keenam jenis Bab 11.3, tanpa duplikat", () => {
        const sama: Sama = true;
        expect(sama).toBe(true);
        expect(new Set(JENIS_PENGAJUAN).size).toBe(6);
    });
});

describe("kondisi sah diterima", () => {
    it.each([
        ["`{}`", {}],
        ["predikat desimal", pr("total_value", "gte", 5_000_000)],
        ["between desimal min=max", pr("total_value", "between", [100, 100])],
        ["enum kode terbuka", pr("requester_role", "in", ["R-06", "R-07"])],
        ["enum tertutup", pr("priority", "eq", "MENDESAK")],
        ["boolean is_true tanpa nilai", pr("requester_has_overdue", "is_true")],
        ["boolean eq", pr("requester_has_overdue", "eq", false)],
        ["array in", pr("material_category_id", "in", [1, 2])],
    ])("%s", (_n, k) => {
        const jenis = (k as { field?: string }).field === "material_category_id" ? "PERMINTAAN_BAHAN" : "PENGADAAN_BARANG";
        expect(validateCondition(k, jenis)).toEqual(k);
    });

    it("grup tepat 3 tingkat", () => {
        const k = { operator: "AND", conditions: [{ operator: "OR", conditions: [{ operator: "AND", conditions: [pr("item_count", "gt", 1)] }] }] };
        expect(validateCondition(k, "PENGADAAN_BARANG")).toEqual(k);
    });
});

describe("struktur (D.1)", () => {
    it.each([
        ["bukan objek", "x"],
        ["operator tak dikenal", pr("total_value", "like", 1)],
        ["kunci asing di predikat", { field: "total_value", op: "gt", value: 1, extra: 1 }],
        ["grup kosong", { operator: "AND", conditions: [] }],
        ["operator grup tak dikenal", { operator: "XOR", conditions: [{}] }],
    ])("%s ditolak", (_n, k) => {
        expect(tolak(k).length).toBeGreaterThan(0);
    });
});

describe("makna (D.2/D.3)", () => {
    it("field tak dikenal", () => {
        expect(tolak(pr("harga", "gt", 1))).toEqual([{ field: "kondisi.field", message: expect.stringContaining("tidak dikenal") }]);
    });

    it("field tak berlaku bagi jenis pengajuan aturan (keputusan 66)", () => {
        expect(tolak(pr("room_type", "eq", "AULA"), "PENGADAAN_BARANG")[0]?.field).toBe("kondisi.field");
        expect(validateCondition(pr("room_type", "eq", "AULA"), "RESERVASI_RUANGAN")).toBeDefined();
    });

    it.each([
        ["gt pada enum", pr("priority", "gt", "RENDAH")],
        ["is_true pada angka", pr("total_value", "is_true")],
        ["in pada angka", pr("total_value", "in", [1])],
        ["eq pada array (keputusan 66)", pr("asset_category_id", "eq", 1)],
    ])("operator tak sah: %s", (_n, k) => {
        const jenis = (k as { field: string }).field === "asset_category_id" ? "PENGHAPUSAN_ASET" : "PENGADAAN_BARANG";
        expect(tolak(k, jenis)[0]?.field).toBe("kondisi.op");
    });

    it.each([
        ["eq tanpa nilai", pr("total_value", "eq")],
        ["gt bernilai teks", pr("total_value", "gt", "5")],
        ["integer bernilai pecahan", pr("item_count", "gte", 1.5)],
        ["between bukan pasangan", pr("total_value", "between", [1])],
        ["between terbalik", pr("total_value", "between", [9, 1])],
        ["in kosong", pr("requester_role", "in", [])],
        ["in bukan larik", pr("requester_role", "in", "R-07")],
        ["enum tertutup di luar himpunan", pr("priority", "eq", "SANGAT_MENDESAK")],
        ["label alih-alih kode enum", pr("priority", "in", ["Mendesak"])],
        ["is_true diberi nilai", pr("requester_has_overdue", "is_true", true)],
        ["eq boolean bernilai teks", pr("requester_has_overdue", "eq", "true")],
        ["decimal tak hingga", pr("total_value", "gt", Number.POSITIVE_INFINITY)],
    ])("nilai tak sah: %s", (_n, k) => {
        expect(tolak(k)[0]?.field).toBe("kondisi.value");
    });

    it("between min = max sah, min > max ditolak dengan pesan batas", () => {
        expect(tolak(pr("total_value", "between", [2, 1]))[0]?.message).toContain("Batas bawah");
    });
});

describe("kedalaman & pengumpulan galat", () => {
    it("grup tingkat ke-4 ditolak", () => {
        const k = {
            operator: "AND",
            conditions: [{ operator: "OR", conditions: [{ operator: "AND", conditions: [{ operator: "OR", conditions: [{}] }] }] }],
        };
        expect(tolak(k)).toEqual([
            { field: "kondisi.conditions.0.conditions.0.conditions.0", message: expect.stringContaining("Kedalaman") },
        ]);
    });

    it("seluruh pelanggaran dikumpulkan dengan jalurnya", () => {
        const k = { operator: "OR", conditions: [pr("harga", "gt", 1), pr("total_value", "gt", 1), pr("item_count", "lt", "x")] };
        expect(tolak(k).map((e) => e.field)).toEqual(["kondisi.conditions.0.field", "kondisi.conditions.2.value"]);
    });
});
