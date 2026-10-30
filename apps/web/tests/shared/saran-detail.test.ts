// Saran halaman detail PR-07-38 (SDD-FE-18, WEB-VIS-03, UXD-27): diturunkan dari respons yang sudah diterima
// halaman, dan tidak pernah dihasilkan tanpa permission aksinya (PM-04).

import { describe, expect, it } from "vitest";
import { saranBahan, saranGaransiAset, saranLinimasaAset, saranServisAset } from "../../src/shared/saran";

const semua = () => true;
const tanpa = (kode: string) => (p: string) => p !== kode;

describe("saran detail bahan P-82 (FR-22.7, BR-085)", () => {
    const bahan = { nama: "Kertas A4", stok_menipis: true, status: "AKTIF", saldo_total: 3, stok_minimum: 10, satuan: { simbol: "rim" } };
    it("stok menipis → ajukan pengadaan dengan angka pemicunya", () => {
        expect(saranBahan(bahan, semua)).toEqual([{ id: "stok-bahan-menipis", judul: "Stok Kertas A4 di bawah minimum", alasan: "Sisa 3 rim · minimum 10", labelAksi: "Ajukan pengadaan", href: "/pengadaan/baru" }]);
    });
    it("tidak muncul untuk stok aman, bahan nonaktif, saldo tersembunyi, atau tanpa procurement.create", () => {
        expect(saranBahan({ ...bahan, stok_menipis: false }, semua)).toEqual([]);
        expect(saranBahan({ ...bahan, status: "NONAKTIF" }, semua)).toEqual([]);
        expect(saranBahan({ ...bahan, saldo_total: null }, semua)).toEqual([]);
        expect(saranBahan(bahan, tanpa("procurement.create"))).toEqual([]);
    });
});

describe("saran linimasa P-18 (BR-051)", () => {
    const dilewati = { jenis: "PREVENTIF_DILEWATI", nama: "Servis AC", jatuh_tempo: "2026-10-01" };
    it("preventif terakhir dilewati → buat work order untuk aset ini", () => {
        const [s] = saranLinimasaAset("12", [{ jenis: "KONDISI" }, dilewati], semua);
        expect(s?.href).toBe("/work-order/baru?aset=12");
        expect(s?.judul).toBe("Pemeliharaan Servis AC terlewat");
        expect(s?.alasan).toContain("1 Oktober 2026");
    });
    it("pemeliharaan yang lebih baru menutup saran; tanpa workorder.create tidak muncul", () => {
        expect(saranLinimasaAset("12", [{ jenis: "PEMELIHARAAN" }, dilewati], semua)).toEqual([]);
        expect(saranLinimasaAset("12", [dilewati], tanpa("workorder.create"))).toEqual([]);
    });
});

describe("saran servis P-18 (BR-053)", () => {
    it("melewati ambang → usulkan penggantian; selain itu tidak ada", () => {
        expect(saranServisAset("12", { rekomendasi_penggantian: true, total_biaya: "2500000", jumlah_perbaikan: 4 }, semua)).toMatchObject([{ href: "/pengadaan/baru?aset=12", alasan: "4 perbaikan · total Rp 2.500.000" }]);
        expect(saranServisAset("12", { rekomendasi_penggantian: null, total_biaya: null, jumlah_perbaikan: 0 }, semua)).toEqual([]);
        expect(saranServisAset("12", { rekomendasi_penggantian: true, total_biaya: "1", jumlah_perbaikan: 1 }, tanpa("procurement.create"))).toEqual([]);
    });
});

describe("saran garansi P-18 (NT-29, BR-052)", () => {
    const doc = (garansi_selesai: string, garansi_mulai = "2025-01-01", jenis = "GARANSI") => ({ jenis, nama_berkas: `garansi-${garansi_selesai}.pdf`, garansi_mulai, garansi_selesai });
    it("garansi aktif terdekat ≤ 30 hari → lapor kerusakan selagi bergaransi", () => {
        const [s] = saranGaransiAset("12", [doc("2026-12-31"), doc("2026-11-20"), doc("2026-11-10")], "2026-10-30", semua);
        expect(s).toMatchObject({ judul: "Garansi aset berakhir dalam 11 hari", href: "/kerusakan/baru?aset=12" });
        expect(s?.alasan).toContain("garansi-2026-11-10.pdf");
        expect(saranGaransiAset("12", [doc("2026-10-30")], "2026-10-30", semua)[0]?.judul).toBe("Garansi aset berakhir hari ini");
    });
    it("tidak muncul untuk garansi > 30 hari, sudah berakhir, belum mulai, bukan dokumen garansi, atau tanpa damage.create", () => {
        expect(saranGaransiAset("12", [doc("2026-12-31")], "2026-10-30", semua)).toEqual([]);
        expect(saranGaransiAset("12", [doc("2026-10-29")], "2026-10-30", semua)).toEqual([]);
        expect(saranGaransiAset("12", [doc("2026-11-10", "2026-11-01")], "2026-10-30", semua)).toEqual([]);
        expect(saranGaransiAset("12", [doc("2026-11-10", "2025-01-01", "FAKTUR")], "2026-10-30", semua)).toEqual([]);
        expect(saranGaransiAset("12", [doc("2026-11-10")], "2026-10-30", tanpa("damage.create"))).toEqual([]);
    });
});
