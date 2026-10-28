import { describe, expect, it } from "vitest";
import type { DisposalCandidate } from "@sigm4/schemas";
import { actionsFor, canCancel, canReinstate, canRevise, disposalBody, executeBody, formFromCandidate, selectCandidate } from "../src/features/disposal/model.js";
import { decisionBlockers, disposalApproveBlocker, disposalDecision, isFinalStep } from "../src/features/approvals/model.js";
import type { ApprovalReview } from "../src/features/approvals/model.js";
import { canClose, canReceive, receiptBody, receivedRow } from "../src/features/procurement/model.js";

const asset: DisposalCandidate = { id: "8", uuid: "u", kode_barang: "AST-008", nama: "Printer", category_id: "2", kategori: "Elektronik", room_id: "3", lokasi: "Lab", kondisi: "RUSAK_BERAT", tahun_perolehan: 2015, umur_tahun: 11, umur_teknis: 5, nilai_perolehan: "2000000.00", biaya_pemeliharaan: "750000.00", jumlah_work_order: 4, rekomendasi_penggantian: true, work_order_id: "41", loss_session_id: null, garansi: [], penghalang: [] };
const form = { reason: "RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI" as const, justification: "Rusak total", action: "DIMUSNAHKAN" as const, items: [selectCandidate(asset)], files: [] };

describe("MS-72 usulan penghapusan (FR-21.1)", () => {
    it("builds the proposal and keeps lost assets administrative only", () => {
        expect(disposalBody(form)).toEqual({ body: { alasan: "RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI", justifikasi: "Rusak total", tindak_lanjut_fisik: "DIMUSNAHKAN", lampiran: [], items: [{ asset_id: 8, loss_session_id: null, bukti_kehilangan_file_id: null, konfirmasi_garansi: false, alasan_garansi: "" }] } });
        expect(actionsFor("HILANG")).toEqual(["ADMINISTRATIF"]);
        expect(actionsFor("LAINNYA")).not.toContain("ADMINISTRATIF");
        expect(disposalBody({ ...form, reason: "HILANG" })).toEqual({ error: "Tindak lanjut tidak sesuai alasan penghapusan." });
        expect(disposalBody({ ...form, items: [] })).toHaveProperty("error");
    });
    it("needs a reasoned warranty confirmation and a clean loss report when no stocktake proves the loss", () => {
        const warranted = { ...asset, garansi: [{ id: "1", nama_berkas: "garansi.pdf", garansi_selesai: "2027-01-01" }] };
        expect(disposalBody({ ...form, items: [{ ...selectCandidate(warranted), warranty: true }] })).toHaveProperty("error");
        expect(disposalBody({ ...form, items: [{ ...selectCandidate(warranted), warranty: true, warrantyReason: "Tidak ekonomis" }] })).toHaveProperty("body");
        const lost = { ...asset, kondisi: "HILANG" as const }, proof = { file_id: 31, nama_berkas: "ba.pdf", scan_status: "CLEAN" as const, jenis: "KEHILANGAN" as const };
        const base = { ...form, reason: "HILANG" as const, action: "ADMINISTRATIF" as const };
        expect(disposalBody({ ...base, items: [selectCandidate(lost)], files: [proof] })).toHaveProperty("error");
        expect(disposalBody({ ...base, items: [{ ...selectCandidate(lost), proof: "31" }], files: [{ ...proof, scan_status: "PENDING" }] })).toHaveProperty("error");
        expect(disposalBody({ ...base, items: [{ ...selectCandidate(lost), proof: "31" }], files: [proof] })).toMatchObject({ body: { items: [{ bukti_kehilangan_file_id: 31 }] } });
        expect(disposalBody({ ...base, items: [selectCandidate({ ...lost, loss_session_id: "6" })] })).toMatchObject({ body: { items: [{ loss_session_id: 6, bukti_kehilangan_file_id: null }] } });
    });
    it("prefills from the asset or work order recommendation", () => {
        expect(formFromCandidate(form, { ...asset, kondisi: "HILANG", loss_session_id: "6" })).toMatchObject({ reason: "HILANG", action: "ADMINISTRATIF", justification: "Aset AST-008 dinyatakan hilang berdasarkan opname #6." });
        expect(formFromCandidate({ ...form, justification: "" }, asset).justification).toBe("Rekomendasi penggantian dari work order #41 untuk Printer.");
    });
});

describe("MS-73 pelaksanaan & pemulihan (FR-21.3)", () => {
    const run = { date: "2026-10-26", action: "DIMUSNAHKAN" as const, witnesses: " Budi \n\nSiti ", photos: [{ file_id: 5, nama_berkas: "f.jpg", scan_status: "CLEAN" as const }], note: "" };
    it("requires witnesses and clean photos unless the loss is recorded administratively", () => {
        expect(executeBody({ alasan: "LAINNYA" }, run)).toEqual({ body: { tanggal: "2026-10-26", tindak_lanjut: "DIMUSNAHKAN", saksi: ["Budi", "Siti"], foto_file_ids: [5], catatan: "" } });
        expect(executeBody({ alasan: "LAINNYA" }, { ...run, photos: [] })).toHaveProperty("error");
        expect(executeBody({ alasan: "HILANG" }, { ...run, action: "ADMINISTRATIF", photos: [] })).toHaveProperty("body");
        expect(executeBody({ alasan: "LAINNYA" }, { ...run, photos: [{ ...run.photos[0]!, scan_status: "PENDING" }] })).toHaveProperty("error");
        expect(executeBody({ alasan: "LAINNYA" }, { ...run, witnesses: " " })).toEqual({ error: "Isi 1–10 nama saksi, satu per baris." });
    });
    it("limits revision, cancellation and reinstatement to the right people", () => {
        const owner = { id: "4", role_kode: "R-02" }, admin = { id: "1", role_kode: "R-01" }, other = { id: "9", role_kode: "R-02" }, perms = { "disposal.create": "all", "disposal.reinstate": "all" };
        expect(canRevise({ status: "PERLU_REVISI", pengusul_id: "4" }, owner, perms)).toBe(true);
        expect(canRevise({ status: "PERLU_REVISI", pengusul_id: "4" }, admin, perms)).toBe(false);
        expect(canCancel({ status: "MENUNGGU_PERSETUJUAN", pengusul_id: "4" }, admin, perms)).toBe(true);
        expect(canCancel({ status: "MENUNGGU_PERSETUJUAN", pengusul_id: "4" }, other, perms)).toBe(false);
        expect(canCancel({ status: "SELESAI", pengusul_id: "4" }, owner, perms)).toBe(false);
        const done = { executed_at: "2026-10-01", dihapuskan: true, reinstated_at: null };
        expect(canReinstate({ alasan: "HILANG" }, done, admin, perms)).toBe(true);
        expect(canReinstate({ alasan: "HILANG" }, done, owner, perms)).toBe(false);
        expect(canReinstate({ alasan: "LAINNYA" }, done, admin, perms)).toBe(false);
        expect(canReinstate({ alasan: "HILANG" }, { ...done, reinstated_at: "2026-10-20" }, admin, perms)).toBe(false);
    });
});

describe("MS-54 keputusan penghapusan (keputusan 20)", () => {
    const steps = [{ urutan: 1, status: "AKTIF" }, { urutan: 2, status: "BELUM_AKTIF" }];
    it("reserves the final approval for Pimpinan and waits for clean attachments", () => {
        expect(isFinalStep(steps, 1)).toBe(false);
        expect(isFinalStep(steps, 2)).toBe(true);
        const clean = { lampiran: [{ file_id: "1", nama_berkas: "a", jenis: "PENDUKUNG", status: "CLEAN", url: "https://x" }] };
        expect(disposalApproveBlocker(clean, false, { role_kode: "R-02" }, {})).toBeNull();
        expect(disposalApproveBlocker(clean, true, { role_kode: "R-02" }, { "disposal.approve": "all" })).toMatch(/Pimpinan/);
        expect(disposalApproveBlocker(clean, true, { role_kode: "R-03" }, {})).toMatch(/Pimpinan/);
        expect(disposalApproveBlocker(clean, true, { role_kode: "R-03" }, { "disposal.approve": "all" })).toBeNull();
        expect(disposalApproveBlocker({ lampiran: [{ ...clean.lampiran[0]!, status: "PENDING" }] }, false, { role_kode: "R-03" }, {})).toMatch(/lampiran/);
    });
    it("sends per-asset partial approval with a required note", () => {
        const d = { items: [{ id: "11" }, { id: "12" }] } as Parameters<typeof disposalDecision>[0];
        expect(disposalDecision(d, 2, "DISETUJUI", " Ok ", ["12"])).toEqual({ urutan: 2, keputusan: "DISETUJUI", catatan: "Ok", rincian_keputusan: { items: [{ item_id: 11, disetujui: false, keterangan: "Ok" }, { item_id: 12, disetujui: true, keterangan: "Ok" }] } });
        expect(disposalDecision(d, 1, "DITOLAK", "Tidak layak")).toEqual({ urutan: 1, keputusan: "DITOLAK", catatan: "Tidak layak" });
        expect(() => disposalDecision(d, 1, "DISETUJUI", " ")).toThrow(/wajib/);
        expect(() => disposalDecision(d, 1, "DISETUJUI", "Ok", [])).toThrow(/minimal satu/);
    });
    it("blocks the decision when the loaded disposal does not match the active request", () => {
        const pending = { instance_id: 7, urutan: 1, jenis_pengajuan: "PENGHAPUSAN_ASET", referensi_id: 3, pemohon: { id: 4 } };
        const review = { history: { instance_id: 7, status: "MENUNGGU", langkah_aktif: 1, jenis_pengajuan: "PENGHAPUSAN_ASET", referensi_id: 3, pemohon: { id: 4 }, langkah: [{ urutan: 1, status: "AKTIF" }] }, pending, room: null, availability: null, contextError: null, requesterContextComplete: true, disposal: { id: "3", approval_instance_id: "7", pengusul_id: "4", status: "MENUNGGU_PERSETUJUAN" } } as unknown as ApprovalReview;
        const perms = { "approval.decide": "all" }, mismatch = "Rincian penghapusan tidak cocok dengan pengajuan aktif. Muat ulang konteks.";
        expect(decisionBlockers(review, perms)).not.toContain(mismatch);
        expect(decisionBlockers({ ...review, disposal: { ...review.disposal!, approval_instance_id: "8" } }, perms)).toContain(mismatch);
        expect(decisionBlockers({ ...review, disposal: { ...review.disposal!, status: "DISETUJUI" } }, perms)).toContain(mismatch);
        expect(decisionBlockers({ ...review, disposal: null }, perms)).toContain(mismatch);
    });
});

describe("MS-70 catat penerimaan (FR-14.3)", () => {
    const items = [{ id: "1", jenis: "ASET" as const, nama_barang: "Laptop", satuan: "unit", jumlah_disetujui: 3, jumlah_diterima: 1 }, { id: "2", jenis: "BAHAN" as const, nama_barang: "Kertas", satuan: "rim", jumlah_disetujui: 10, jumlah_diterima: 0 }] as Parameters<typeof receiptBody>[0]["items"];
    const rows = { "1": { ...receivedRow(items[0]!), selected: true, room: "3", merek: "Acme", seri: "SN1\n" }, "2": { ...receivedRow(items[1]!), selected: true, room: "4" } };
    const f = { tanggal: "2026-10-26", nomor: "INV-9", catatan: "", dokumen: [{ file_id: 7, nama_berkas: "faktur.jpg", scan_status: "CLEAN" as const, jenis: "FAKTUR" as const }], rows };
    it("registers assets per unit and adds consumable stock within the remaining quantity", () => {
        expect(receivedRow(items[0]!).jumlah).toBe("2");
        expect(receiptBody({ items }, f)).toEqual({ body: { tanggal_terima: "2026-10-26", nomor_dokumen: "INV-9", dokumen: [{ file_id: 7, nama_berkas: "faktur.jpg", jenis: "FAKTUR" }], items: [
            { item_id: 1, jumlah: 2, status: "DITERIMA", kondisi: "BAIK", room_id: 3, merek: "Acme", nomor_seri: ["SN1", null], dapat_dipinjam: true, foto_file_ids: [], boleh_dipinjam_siswa: false },
            { item_id: 2, jumlah: 10, status: "DITERIMA", room_id: 4, foto_file_ids: [], kondisi: "BAIK", nomor_seri: [], dapat_dipinjam: true, boleh_dipinjam_siswa: false }] } });
        expect(receiptBody({ items }, { ...f, rows: { ...rows, "1": { ...rows["1"], jumlah: "3" } } })).toEqual({ error: "Laptop: jumlah melebihi sisa 2 unit." });
        expect(receiptBody({ items }, { ...f, rows: { ...rows, "2": { ...rows["2"], room: "" } } })).toEqual({ error: "Kertas: pilih lokasi penempatan." });
        expect(receiptBody({ items }, { ...f, rows: { "1": { ...rows["1"], selected: false }, "2": { ...rows["2"], selected: false } } })).toHaveProperty("error");
        expect(receiptBody({ items }, { ...f, dokumen: [] })).toEqual({ error: "Lampirkan minimal satu dokumen penerimaan." });
    });
    it("records rejected goods with a reason and photos instead of a location", () => {
        const rejected = { ...rows["1"], status: "DITOLAK_SAAT_PENERIMAAN" as const, room: "", alasan: "Layar retak", foto: [{ file_id: 12, nama_berkas: "x.jpg", scan_status: "CLEAN" as const }] };
        expect(receiptBody({ items }, { ...f, rows: { "1": rejected } })).toMatchObject({ body: { items: [{ item_id: 1, status: "DITOLAK_SAAT_PENERIMAAN", alasan: "Layar retak", foto_file_ids: [12] }] } });
        expect(Object.keys((receiptBody({ items }, { ...f, rows: { "1": rejected } }) as { body: { items: object[] } }).body.items[0]!)).not.toContain("room_id");
    });
    it("receives approved proposals and closes them only after the budget year", () => {
        const perms = { "procurement.receive": "all" };
        expect(canReceive({ status: "DISETUJUI_SEBAGIAN" }, perms)).toBe(true);
        expect(canReceive({ status: "SELESAI" }, perms)).toBe(false);
        expect(canReceive({ status: "DISETUJUI" }, {})).toBe(false);
        expect(canClose({ status: "DITERIMA_SEBAGIAN", tahun_anggaran: 2025 }, perms, 2026)).toBe(true);
        expect(canClose({ status: "DITERIMA_SEBAGIAN", tahun_anggaran: 2026 }, perms, 2026)).toBe(false);
    });
});
