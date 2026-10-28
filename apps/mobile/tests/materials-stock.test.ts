import { describe, expect, it } from "vitest";
import type { MaterialRequestDetail } from "@sigm4/schemas";
import { adjustmentBody, canClose, canIssue, categoryBody, issueBody, issueLimit, issuable, materialBody, receiptBody } from "../src/features/materials/stock.js";
import { nativeChatPath } from "../src/features/chat/model.js";

const form = { nama: "Kertas A4", category: "2", unit: "3", minimum: "10", room: "5", note: "", active: true, students: true };
const clean = [{ file_id: 9, nama_berkas: "nota.pdf", scan_status: "CLEAN" }];

describe("MS-41 master bahan (FR-22.1)", () => {
    it("never sends a locked unit and validates through the shared schema", () => {
        expect(materialBody(form, null)).toEqual({ body: { nama: "Kertas A4", material_category_id: 2, satuan_id: 3, stok_minimum: 10, room_id_default: 5, boleh_diminta_siswa: true, keterangan: null, status: "AKTIF" } });
        expect(materialBody(form, { lockedUnit: true })).toMatchObject({ body: expect.not.objectContaining({ satuan_id: 3 }) });
        expect(materialBody({ ...form, nama: " " }, null)).toHaveProperty("error");
    });
});

describe("MS-42 penerimaan & penyesuaian lewat ledger (FR-22.2, FR-22.3)", () => {
    const base = { room: "5", qty: "20", date: "2026-11-03", doc: "PO-1", note: "" };
    it("requires at least one verified (CLEAN) receipt document like the server", () => {
        expect(receiptBody({ ...base, files: [] })).toEqual({ error: "Lampirkan minimal satu dokumen penerimaan." });
        expect(receiptBody({ ...base, files: [{ ...clean[0]!, scan_status: "PENDING" }] })).toEqual({ error: "Tunggu semua dokumen lolos pemeriksaan sebelum menyimpan." });
        expect(receiptBody({ ...base, files: clean })).toEqual({ body: { room_id: 5, jumlah: 20, tanggal_terima: "2026-11-03", nomor_dokumen: "PO-1", catatan: "", dokumen: [{ file_id: 9, nama_berkas: "nota.pdf" }] } });
    });
    it("blocks reductions beyond the location balance and requires a reason", () => {
        expect(adjustmentBody({ room: "5", direction: "KURANG", qty: "8", reason: "Rusak" }, 5)).toEqual({ error: "Pengurangan melebihi saldo lokasi." });
        expect(adjustmentBody({ room: "5", direction: "TAMBAH", qty: "8", reason: "Selisih hitung" }, 5)).toEqual({ body: { room_id: 5, arah: "TAMBAH", jumlah: 8, alasan: "Selisih hitung" } });
        expect(adjustmentBody({ room: "5", direction: "KURANG", qty: "1", reason: "" }, 5)).toHaveProperty("error");
    });
});

describe("MS-43 kategori bahan", () => {
    it("restricts the code to letters, digits, dash, underscore", () => {
        expect(categoryBody({ nama: "ATK", kode: "ATK-01", note: "", active: true })).toEqual({ body: { nama: "ATK", kode: "ATK-01", keterangan: null, status: "AKTIF" } });
        expect(categoryBody({ nama: "ATK", kode: "ATK 01", note: "", active: true })).toHaveProperty("error");
    });
});

describe("MS-58 penyerahan bahan (FR-22.5)", () => {
    const item = (id: string, disetujui: number | null, diserahkan: number, saldo: number) => ({ id, material_id: "1", room_id: "5", nama: `Bahan ${id}`, lokasi: "Gudang", satuan: "rim", jumlah_diminta: 10, jumlah_disetujui: disetujui, jumlah_diserahkan: diserahkan, saldo_terkini: saldo });
    const d = { status: "DISETUJUI_SEBAGIAN", items: [item("1", 6, 2, 3), item("2", 4, 4, 9), item("3", null, 0, 9)] } as unknown as MaterialRequestDetail;
    it("offers only rows with approved remainder, capped by remainder and current balance", () => {
        expect(issuable(d).map((i) => i.id)).toEqual(["1"]);
        expect(issueLimit(d.items[0]!)).toBe(3);
    });
    it("rejects over-issue, sends only non-zero rows, and needs at least one", () => {
        const input = { name: "Siti", date: "2026-11-03", note: "" };
        expect(issueBody(d, { ...input, qty: { "1": "4" } })).toEqual({ error: "Bahan 1: paling banyak 3 rim." });
        expect(issueBody(d, { ...input, qty: {} })).toEqual({ error: "Isi jumlah yang diserahkan sekarang." });
        expect(issueBody(d, { ...input, qty: { "1": "3", "2": "1" } })).toEqual({ body: { nama_penerima: "Siti", tanggal_serah: "2026-11-03", catatan: "", items: [{ item_id: 1, jumlah: 3 }] } });
    });
    it("allows issuing and closing only to material.issue in the right states", () => {
        const perms = { "material.issue": "all" };
        expect(canIssue({ status: "DISETUJUI" }, perms)).toBe(true);
        expect(canIssue({ status: "MENUNGGU_PERSETUJUAN" }, perms)).toBe(false);
        expect(canIssue({ status: "DISETUJUI" }, {})).toBe(false);
        expect(canClose({ status: "DISERAHKAN_SEBAGIAN" }, perms)).toBe(true);
        expect(canClose({ status: "DISETUJUI" }, perms)).toBe(false);
    });
    it("opens material and room links from the chatbot natively", () => {
        expect(nativeChatPath("/bahan/3", { "material.view": "own" })).toBe("/bahan/3");
        expect(nativeChatPath("/lokasi/ruangan/7", {})).toBeNull();
    });
});
