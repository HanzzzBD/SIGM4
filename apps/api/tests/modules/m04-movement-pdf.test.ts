import { describe, expect, it } from "vitest";
import { AssetMovementSnapshotSchema, MoveAssetsBodySchema } from "@sigm4/schemas";
import { movementDocumentHtml } from "../../src/modules/m04-assets/services/movement-pdf.js";
import { periksaKebijakan } from "../../src/modules/m06-documents/services/kebijakan.js";

describe("Berita acara mutasi: template aman dan input operasi", () => {
    it("meng-escape teks pengguna dan menyertakan asal, tujuan, tanggal, pelaku, alasan dan penanggung jawab", () => {
        const location = { id: "1", kode: "R&1", nama: '<img src="http://attacker">', gedung: "Gedung", area: "Area" };
        const snapshot = AssetMovementSnapshotSchema.parse({ versi: 1, tanggal_mutasi: "2026-10-08", dicatat_pada: "2026-10-08T03:00:00Z",
            pelaku: { id: "5", nama: "Petugas <script>" }, alasan: "Penataan & perbaikan", tujuan: { ...location, nama: "Tujuan" },
            aset: [{ id: "9", kode_barang: "AST-001", nama: "Aset <script>alert('x')</script>", nomor_seri: "00000123", asal: location,
                penanggung_jawab_lama: { id: "7", nama: "Lama" }, penanggung_jawab_baru: { id: "8", nama: "Baru" } }] });
        const html = movementDocumentHtml("123", snapshot);
        for (const content of ["AST-001", "00000123", "Penataan &amp; perbaikan", "2026-10-08", "Petugas &lt;script&gt;", "Lama → Baru", "Tujuan", "&lt;img"]) expect(html).toContain(content);
        expect(html).not.toContain("<script>"); expect(html).not.toContain("<img "); expect(html).toContain("size:A4");
    });
    it.each([0, 51])("menolak %i aset sebelum transaksi", (size) => {
        expect(MoveAssetsBodySchema.safeParse({ asset_ids: Array.from({ length: size }, (_, i) => i + 1), room_tujuan_id: 1, tanggal_mutasi: "2026-10-08", alasan: "Mutasi" }).success).toBe(false);
    });
    it("jenis berkas khusus sistem ditolak presign service sekalipun tipe input ditembus", () => {
        expect(periksaKebijakan("ASSET_MOVEMENT_DOCUMENT", "application/pdf", 1)?.field).toBe("jenis");
    });
});
