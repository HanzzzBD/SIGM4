import { describe, expect, it } from "vitest";
import { checkinBody, checkoutBody, fineActionBody, fineActions, needsConditionNote, needsSubstitutionReason } from "../src/features/loans/model.js";
import type { HandoverUnit, ReturnRow } from "../src/features/loans/model.js";
import { contextualActions } from "../src/features/scanner/model.js";

const unit = (patch: Partial<HandoverUnit> = {}): HandoverUnit => ({ key: "k", allocated: "10", expected: "LAP-01", code: "LAP-01", resolved: { asset_id: "10", kode_barang: "LAP-01", kondisi: "BAIK", layak: true }, reason: "", photos: [5], condition: "BAIK", note: "", ...patch });
const base = { reservationId: "7", direct: null, recipient: "Siti", proxy: false, signature: 9 };

describe("MS-10 Serah Terima (FR-09.1, BR-027)", () => {
    it("requires verified eligible units, a photo per unit, and an uploaded signature before review", () => {
        expect(checkoutBody({ ...base, units: [unit({ resolved: null })] })).toEqual({ error: "Verifikasi seluruh unit dan pastikan unit layak dipinjam." });
        expect(checkoutBody({ ...base, units: [unit({ resolved: { asset_id: "10", kode_barang: "LAP-01", kondisi: "BAIK", layak: false } })] })).toHaveProperty("error");
        expect(checkoutBody({ ...base, units: [unit({ photos: [] })] })).toEqual({ error: "Unggah minimal satu foto kondisi per unit." });
        expect(checkoutBody({ ...base, signature: null, units: [unit()] })).toEqual({ error: "Simpan tanda tangan penerima lebih dulu." });
    });
    it("builds the reservation body and records substitution with its reason (A1)", () => {
        expect(checkoutBody({ ...base, units: [unit()] })).toEqual({ body: { reservation_id: 7, nama_penerima: "Siti", diwakilkan: false, signature_file_id: 9, unit: [{ asset_id: 10, allocated_asset_id: 10, verification_code: "LAP-01", kondisi_awal: "BAIK", foto_file_ids: [5] }] } });
        const swapped = unit({ code: "LAP-02", resolved: { asset_id: "11", kode_barang: "LAP-02", kondisi: "BAIK", layak: true }, reason: "Unit alokasi rusak" });
        expect(needsSubstitutionReason(swapped)).toBe(true);
        expect(checkoutBody({ ...base, units: [swapped] })).toMatchObject({ body: { unit: [{ asset_id: 11, allocated_asset_id: 10, alasan_substitusi: "Unit alokasi rusak" }] } });
        expect(checkoutBody({ ...base, units: [{ ...swapped, reason: "" }] })).toHaveProperty("error");
        expect(needsConditionNote(unit({ condition: "RUSAK_RINGAN" }))).toBe(true);
    });
    it("needs a borrower and the direct-loan details for peminjaman langsung", () => {
        const direct = { borrower: "", dueDate: "2026-11-04", dueTime: "17:00", purpose: "Praktik", location: "Lab", reason: "Mendesak" };
        expect(checkoutBody({ ...base, reservationId: null, direct, units: [unit()] })).toEqual({ error: "Pilih peminjam aktif." });
        expect(checkoutBody({ ...base, reservationId: null, direct: { ...direct, borrower: "3" }, units: [unit()] })).toMatchObject({ body: { langsung: { peminjam_id: 3, tanggal_jatuh_tempo: "2026-11-04T17:00:00+07:00" } } });
    });
});

describe("MS-11 Pengembalian (FR-09.2)", () => {
    const row = (patch: Partial<ReturnRow> = {}): ReturnRow => ({ id: "4", selected: true, code: "LAP-01", condition: "BAIK", photos: [8], note: "", negligence: false, ...patch });
    it("returns only selected units (A3) and requires notes for damage, loss, or negligence", () => {
        expect(checkinBody([row({ selected: false })])).toEqual({ error: "Pilih minimal satu unit yang dikembalikan." });
        expect(checkinBody([row(), row({ id: "5", selected: false })])).toEqual({ body: { unit: [{ loan_item_id: 4, verification_code: "LAP-01", kondisi_akhir: "BAIK", foto_file_ids: [8], catatan: "", kelalaian: false }] } });
        expect(checkinBody([row({ condition: "HILANG" })])).toEqual({ error: "Unit 1: isi catatan kondisi pengembalian." });
        expect(checkinBody([row({ code: " " })])).toEqual({ error: "Unit 1: masukkan atau pindai kode aset." });
        expect(checkinBody([row({ photos: [] })])).toEqual({ error: "Unit 1: unggah minimal satu foto." });
    });
});

describe("MS-53 aksi kewajiban dari flag server (FR-09.4)", () => {
    const none = { bayar: false, bebaskan: false, bebaskan_ganti_rugi: false, usulkan_nilai: false, putuskan_nilai: false, buka_kembali: false };
    it("renders only the actions the server allows", () => {
        expect(fineActions(none)).toEqual([]);
        expect(fineActions({ ...none, bayar: true, putuskan_nilai: true }).map((a) => a.action)).toEqual(["pay", "approve", "reject"]);
    });
    it("validates each action body with the shared schema", () => {
        const input = { date: "2026-11-03", proof: "", reason: "", amount: "" };
        expect(fineActionBody("pay", input)).toHaveProperty("error");
        expect(fineActionBody("pay", { ...input, proof: "KW-1" })).toEqual({ body: { tanggal_bayar: "2026-11-03T00:00:00+07:00", nomor_bukti: "KW-1" } });
        expect(fineActionBody("propose", { ...input, reason: "Harga pasar", amount: "0" })).toHaveProperty("error");
        expect(fineActionBody("reject", { ...input, reason: "Terlalu tinggi" })).toEqual({ body: { keputusan: "DITOLAK", catatan: "Terlalu tinggi" } });
    });
});

describe("aksi Hasil Scan", () => {
    it("offers handover and return natively to loan managers", () => {
        const asset = { status: "DIRESERVASI" as const, dihapuskan: false, dapat_dipinjam: true };
        expect(contextualActions(asset, { "loan.manage": "all" })[0]).toMatchObject({ label: "Serah terima", available: true });
        expect(contextualActions({ ...asset, status: "DIPINJAM" }, { "loan.manage": "all" })[0]).toMatchObject({ label: "Pengembalian", available: true });
    });
});
