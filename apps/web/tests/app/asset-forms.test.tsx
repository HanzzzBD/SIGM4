// P-16 Tambah Aset, P-19 Ubah Aset, P-21 Kategori Aset (FR-04.1, FR-04.3, FR-04.5, UX §7.1 C; PR-02-46,
// keputusan 93 log phase-02) — aplikasi utuh lewat router dan klien HTTP produksi.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssetDetail } from "@sigm4/schemas";
import { describe, expect, it } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

// Kotak centang Radix DI DALAM <form> merender input gelembung ber-ResizeObserver, yang tak ada di jsdom (pola room-blocks).
globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
};

const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "asset.view": "all", "asset.create": "all", "asset.update": "all", "asset.update_condition": "all", "location.view": "all", "category.manage": "all" } };

const DETAIL: AssetDetail = {
    id: "12",
    uuid: "3f2b1c9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c",
    kode_barang: "LAB-PRY-0012",
    nama: "Proyektor Aula",
    kategori: { id: "3", nama: "Proyektor" },
    merek: "Epson",
    model: null,
    nomor_seri: "SN-12",
    tahun_perolehan: 2023,
    lokasi: { room_id: "10", ruang: "Aula", area: "Lantai 1", gedung: "Gedung A" },
    kondisi: "BAIK",
    status: "TERSEDIA",
    dapat_dipinjam: true,
    boleh_dipinjam_siswa: false,
    penanggung_jawab: { id: "5", nama: "Bu Sari" },
    qr_url: "https://sigm4.sekolah.test/a/3f2b1c9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c",
    qr_terpasang: false,
    dihapuskan: false,
    tanggal_penghapusan: null,
    created_at: "2026-10-01T03:00:00.000Z",
    sumber_perolehan: "PEMBELIAN",
    nilai_perolehan: "5000000.00",
};

// Sub sebelum induk: urutan pohon disusun klien, bukan diandalkan dari urutan API.
const KATEGORI = [
    { id: "4", parent_id: "3", nama: "Proyektor Portabel", kode: "PRY-P", umur_teknis_tahun: null, interval_preventif_hari: null, created_at: "x", updated_at: "x" },
    { id: "3", parent_id: null, nama: "Proyektor", kode: "PRY", umur_teknis_tahun: 5, interval_preventif_hari: 180, created_at: "x", updated_at: "x" },
];
const halaman = (data: unknown[]): Jawaban => ({ status: 200, data: { success: true, data, meta: { page: 1, per_page: 100, total: data.length, total_pages: 1 } } });

function server(o: { me?: unknown; post?: (p: Permintaan) => Jawaban; put?: (p: Permintaan) => Jawaban; detail?: Jawaban; hapus?: Jawaban } = {}) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(o.me ?? ME);
        if (p.url === "/asset-categories" && p.method === "GET") return halaman(KATEGORI);
        if (p.url === "/asset-categories" || p.url === "/asset-categories/4") return p.method === "DELETE" ? (o.hapus ?? sukses(null)) : sukses(KATEGORI[1]);
        if (p.url === "/locations/tree") return sukses([{ nama: "Gedung A", areas: [{ rooms: [{ id: "10", nama: "Aula" }] }] }]);
        if (p.url === "/users") return halaman([{ id: "5", nama: "Bu Sari" }]);
        if (p.url === "/assets" && p.method === "POST") return o.post?.(p) ?? { status: 201, data: { success: true, data: [{ id: "21", kode_barang: "LAB-PRY-0021", nama: "Proyektor Kelas" }, { id: "22", kode_barang: "LAB-PRY-0022", nama: "Proyektor Kelas" }], meta: { jumlah_unit: 2 } } };
        if (p.url === "/assets/12" && p.method === "GET") return o.detail ?? sukses(DETAIL);
        if (p.url === "/assets/12" && p.method === "PUT") return o.put?.(p) ?? sukses({ id: "12" });
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        return { status: 404 };
    });
}

describe("P-16 Tambah Aset", () => {
    it("validasi per isian sebelum dikirim; nomor seri nonaktif untuk >1 unit; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container } = await renderAplikasi("/aset/baru");
        await user.click(await screen.findByRole("button", { name: "Daftarkan aset" }));
        expect(screen.getByText("Nama aset wajib diisi.")).toBeTruthy();
        expect(screen.getByText("Pilih kategori.")).toBeTruthy();
        expect(screen.getByText("Pilih ruangan.")).toBeTruthy();
        expect(screen.getByText(/Isi tahun empat digit/)).toBeTruthy();
        expect(log.some((p) => p.method === "POST")).toBe(false);
        const jumlah = screen.getByLabelText(/^Jumlah unit/);
        await user.clear(jumlah);
        await user.type(jumlah, "2");
        expect(screen.getByLabelText(/^Nomor seri/).hasAttribute("disabled")).toBe(true);
        expect(await pelanggaranAxe(container)).toEqual([]);
        // axe + validasi penuh: batas longgar agar tak rapuh saat suite berjalan paralel.
    }, 20_000);

    it("mengirim N unit; hasil menampilkan setiap kode aset yang terbentuk (FR-04.1 langkah 6)", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/aset/baru");
        await user.type(await screen.findByLabelText(/^Nama aset/), "Proyektor Kelas");
        await user.selectOptions(screen.getByLabelText(/^Kategori/), "3");
        await user.selectOptions(await screen.findByLabelText(/^Ruangan/), "10");
        await user.type(screen.getByLabelText(/^Tahun perolehan/), "2025");
        const jumlah = screen.getByLabelText(/^Jumlah unit/);
        await user.clear(jumlah);
        await user.type(jumlah, "2");
        await user.type(screen.getByLabelText(/^Nilai perolehan/), "4500000");
        await user.click(screen.getByRole("button", { name: "Daftarkan aset" }));
        const hasil = await screen.findByRole("list", { name: "Unit yang terbentuk" });
        expect(within(hasil).getByText("LAB-PRY-0021")).toBeTruthy();
        expect(within(hasil).getByText("LAB-PRY-0022")).toBeTruthy();
        expect(log.find((p) => p.method === "POST")?.data).toMatchObject({ nama: "Proyektor Kelas", category_id: 3, room_id: 10, tahun_perolehan: 2025, jumlah_unit: 2, nomor_seri: null, nilai_perolehan: 4500000, kondisi: "BAIK", sumber_perolehan: "PEMBELIAN" });
    });

    it("galat server per isian (DUPLICATE_CODE nomor seri) tampil pada isiannya", async () => {
        server({ post: () => ({ status: 409, data: { success: false, error: { code: "DUPLICATE_CODE", message: "Nomor seri sudah digunakan.", details: [{ field: "nomor_seri", message: "Nomor seri sudah digunakan." }] }, request_id: "r" } }) });
        const user = userEvent.setup();
        await renderAplikasi("/aset/baru");
        await user.type(await screen.findByLabelText(/^Nama aset/), "Proyektor");
        await user.selectOptions(screen.getByLabelText(/^Kategori/), "3");
        await user.selectOptions(await screen.findByLabelText(/^Ruangan/), "10");
        await user.type(screen.getByLabelText(/^Tahun perolehan/), "2025");
        await user.type(screen.getByLabelText(/^Nomor seri/), "SN-12");
        await user.click(screen.getByRole("button", { name: "Daftarkan aset" }));
        expect((await screen.findByLabelText(/^Nomor seri/)).getAttribute("aria-invalid")).toBe("true");
        expect(screen.getByText("Nomor seri sudah digunakan.")).toBeTruthy();
    });

    it("tanpa asset.create → P-08 (PM-04)", async () => {
        server({ me: { ...ME, permissions: { "asset.view": "all" } } });
        const { router } = await renderAplikasi("/aset/baru");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-19 Ubah Aset", () => {
    it("terisi dari detail; perolehan hanya bila dikirim server; tanpa perubahan kondisi PUT tanpa kondisi; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container, router } = await renderAplikasi("/aset/12/ubah");
        const nama = await screen.findByLabelText(/^Nama aset/);
        expect((nama as HTMLInputElement).value).toBe("Proyektor Aula");
        expect(screen.getByLabelText(/^Nilai perolehan/)).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
        await user.clear(nama);
        await user.type(nama, "Proyektor Aula Utama");
        await user.click(screen.getByRole("button", { name: "Simpan perubahan" }));
        await waitFor(() => expect(log.find((p) => p.method === "PUT")?.data).toEqual({ nama: "Proyektor Aula Utama", merek: "Epson", model: null, nomor_seri: "SN-12", tahun_perolehan: 2023, dapat_dipinjam: true, boleh_dipinjam_siswa: false, penanggung_jawab_id: 5, sumber_perolehan: "PEMBELIAN", nilai_perolehan: 5000000 }));
        // Kembali ke P-18 (terdaftar sejak PR-02-45).
        await waitFor(() => expect(router.state.location.pathname).toBe("/aset/12"));
    });

    it("kondisi berubah menuntut alasan; terkirim bersama atribut dalam satu PUT (keputusan 93f)", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/aset/12/ubah");
        await user.selectOptions(await screen.findByLabelText(/^Kondisi$/), "RUSAK_BERAT");
        expect(screen.getByText(/akan berstatus Tidak Tersedia/)).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Simpan perubahan" }));
        expect(screen.getByText("Alasan perubahan kondisi wajib diisi.")).toBeTruthy();
        expect(log.some((p) => p.method === "PUT")).toBe(false);
        await user.type(screen.getByLabelText(/Alasan perubahan kondisi/), "Lampu pecah");
        await user.click(screen.getByRole("button", { name: "Simpan perubahan" }));
        await waitFor(() => expect(log.find((p) => p.method === "PUT")?.data).toMatchObject({ kondisi: "RUSAK_BERAT", alasan: "Lampu pecah" }));
    });

    it("tanpa asset.update_condition bagian Kondisi tidak dirender; tanpa kunci finansial perolehan tidak dirender", async () => {
        const tanpa: Partial<AssetDetail> = { ...DETAIL };
        delete tanpa.sumber_perolehan;
        delete tanpa.nilai_perolehan;
        server({ me: { ...ME, permissions: { ...ME.permissions, "asset.update_condition": undefined } }, detail: sukses(tanpa) });
        await renderAplikasi("/aset/12/ubah");
        await screen.findByLabelText(/^Nama aset/);
        expect(screen.queryByLabelText(/^Kondisi$/)).toBeNull();
        expect(screen.queryByLabelText(/^Nilai perolehan/)).toBeNull();
    });

    it("Batal dengan perubahan belum tersimpan meminta konfirmasi (UX-04)", async () => {
        server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/aset/12/ubah");
        await user.type(await screen.findByLabelText(/^Model/), "EB-X51");
        await user.click(screen.getByRole("button", { name: "Batal" }));
        const dialog = await screen.findByRole("dialog", { name: "Buang perubahan?" });
        expect(router.state.location.pathname).toBe("/aset/12/ubah");
        await user.click(within(dialog).getByRole("button", { name: "Buang perubahan" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/aset/12"));
    });

    it("aset terhapuskan tidak dapat diubah; 404 → tidak ditemukan; tanpa asset.update → P-08", async () => {
        server({ detail: sukses({ ...DETAIL, dihapuskan: true }) });
        await renderAplikasi("/aset/12/ubah");
        expect(await screen.findByText("Aset telah dihapuskan")).toBeTruthy();
        server({ detail: gagal(404, "NOT_FOUND", "Aset tidak ditemukan.") });
        await renderAplikasi("/aset/12/ubah");
        expect(await screen.findByText("Aset tidak ditemukan")).toBeTruthy();
        server({ me: { ...ME, permissions: { "asset.view": "all" } } });
        const { router } = await renderAplikasi("/aset/12/ubah");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-18 → P-19", () => {
    it("P-18 menampilkan Ubah menuju P-19 bagi pemegang asset.update; aset terhapuskan tidak", async () => {
        server();
        await renderAplikasi("/aset/12");
        expect((await screen.findByRole("link", { name: "Ubah" })).getAttribute("href")).toBe("/aset/12/ubah");
        server({ detail: sukses({ ...DETAIL, dihapuskan: true }) });
        await renderAplikasi("/aset/12");
        expect((await screen.findAllByRole("heading", { level: 1 })).length).toBeGreaterThan(0);
        expect(screen.queryAllByRole("link", { name: "Ubah" })).toHaveLength(1);
    });
});

describe("P-21 Kategori Aset", () => {
    it("pohon dua tingkat; tambah mengirim body FR-04.5; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container } = await renderAplikasi("/kategori-aset");
        expect(await screen.findByText("Proyektor Portabel")).toBeTruthy();
        // Tabel pohon: induk lalu subnya; tanpa matchMedia jsdom memakai bawaan Tabel (UXD-26).
        const baris = screen.getAllByRole("row").slice(1);
        expect(baris.map((b) => b.querySelector("th")?.textContent)).toEqual(["Proyektor", "Proyektor Portabel"]);
        expect(within(baris[0]!).getByText("180 hari")).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
        await user.type(screen.getByLabelText(/^Nama/), "Proyektor Mini");
        await user.type(screen.getByLabelText(/^Kode/), "PRY-M");
        await user.selectOptions(screen.getByLabelText("Induk"), "3");
        await user.type(screen.getByLabelText(/^Interval preventif/), "0");
        await user.click(screen.getByRole("button", { name: "Tambah kategori" }));
        expect(screen.getByText("Isi bilangan bulat lebih dari nol, atau kosongkan.")).toBeTruthy();
        await user.clear(screen.getByLabelText(/^Interval preventif/));
        await user.type(screen.getByLabelText(/^Interval preventif/), "90");
        await user.click(screen.getByRole("button", { name: "Tambah kategori" }));
        await waitFor(() => expect(log.find((p) => p.method === "POST")?.data).toEqual({ nama: "Proyektor Mini", kode: "PRY-M", parent_id: 3, umur_teknis_tahun: null, interval_preventif_hari: 90 }));
        expect(await screen.findByText("Kategori Proyektor Mini ditambahkan.")).toBeTruthy();
    });

    it("Ubah mengisi formulir lalu PUT; Hapus yang ditolak server menampilkan alasannya (FR-04.5 A2)", async () => {
        const log = server({ hapus: gagal(422, "VALIDATION_ERROR", "Kategori masih dipakai 3 aset.") });
        const user = userEvent.setup();
        await renderAplikasi("/kategori-aset");
        await user.click(await screen.findByRole("button", { name: "Ubah kategori Proyektor Portabel" }));
        expect((screen.getByLabelText(/^Nama/) as HTMLInputElement).value).toBe("Proyektor Portabel");
        await user.click(screen.getByRole("button", { name: "Simpan perubahan" }));
        await waitFor(() => expect(log.find((p) => p.method === "PUT")?.url).toBe("/asset-categories/4"));
        await user.click(screen.getByRole("button", { name: "Hapus kategori Proyektor Portabel" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Hapus kategori" }));
        expect(await within(dialog).findByText("Kategori masih dipakai 3 aset.")).toBeTruthy();
    });

    it("tanpa category.manage → P-08 (PM-04)", async () => {
        server({ me: { ...ME, permissions: { "asset.view": "all" } } });
        const { router } = await renderAplikasi("/kategori-aset");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});
