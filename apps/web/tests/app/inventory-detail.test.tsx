// P-15 Inventaris Aset, P-18 Detail Aset, pencarian global topbar (FR-04.2, BR-073, UX §7.1/§7.4/§7.6.3;
// PR-02-45, keputusan 93 log phase-02) — aplikasi utuh lewat router dan klien HTTP produksi.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssetDetail, EntriLinimasaAset } from "@sigm4/schemas";
import { describe, expect, it } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "asset.view": "all", "asset.update": "all", "location.view": "all" } };

const ITEM = {
    id: "12",
    uuid: "3f2b1c9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c",
    kode_barang: "LAB-KOM-0012",
    nama: "Laptop Guru",
    category_id: "3",
    merek: "Lenovo",
    model: null,
    nomor_seri: "SN-12",
    tahun_perolehan: 2024,
    room_id: "10",
    kondisi: "RUSAK_RINGAN",
    status: "TERSEDIA",
    dapat_dipinjam: true,
    boleh_dipinjam_siswa: false,
    qr_url: "https://sigm4.sekolah.test/a/3f2b1c9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c",
    qr_terpasang: false,
    created_at: "2026-10-01T03:00:00.000Z",
    kategori_nama: "Laptop",
    lokasi: { ruang: "Lab Komputer", gedung: "Gedung A" },
};

const DETAIL: AssetDetail = {
    id: "12",
    uuid: ITEM.uuid,
    kode_barang: ITEM.kode_barang,
    nama: ITEM.nama,
    kategori: { id: "3", nama: "Laptop" },
    merek: "Lenovo",
    model: "ThinkPad",
    nomor_seri: "SN-12",
    tahun_perolehan: 2024,
    lokasi: { room_id: "10", ruang: "Lab Komputer", area: "Lantai 1", gedung: "Gedung A" },
    kondisi: "RUSAK_RINGAN",
    status: "TERSEDIA",
    dapat_dipinjam: true,
    boleh_dipinjam_siswa: false,
    penanggung_jawab: { id: "5", nama: "Bu Sari" },
    qr_url: ITEM.qr_url,
    qr_terpasang: false,
    dihapuskan: false,
    tanggal_penghapusan: null,
    created_at: "2026-10-01T03:00:00.000Z",
    sumber_perolehan: "HIBAH",
    nilai_perolehan: "8500000.00",
};

const LINIMASA: EntriLinimasaAset[] = [
    { jenis: "KERUSAKAN", id: "7", waktu: "2026-10-07T03:00:00.000Z", laporan_id: "7", nomor: "KRS-2026-0007", status: "DILAPORKAN", urgensi: "TINGGI" },
    { jenis: "DOKUMEN", id: "4", waktu: "2026-10-05T03:00:00.000Z", aksi: "DITAUTKAN", dokumen_id: "9", jenis_dokumen: "FAKTUR", nama_berkas: "faktur.pdf", pelaku: { id: "5", nama: "Bu Sari" } },
    { jenis: "MUTASI", id: "3", waktu: "2026-10-04T05:00:00.000Z", tanggal: "2026-10-04", ruang_asal: { id: "9", nama: "Gudang" }, ruang_tujuan: { id: "10", nama: "Lab Komputer" }, alasan: "Dipakai praktik", pelaku: { id: "5", nama: "Bu Sari" }, document_id: "2" },
    { jenis: "KONDISI", id: "1", waktu: "2026-10-03T03:00:00.000Z", kondisi_lama: "BAIK", kondisi_baru: "RUSAK_RINGAN", alasan: "Engsel retak", pelaku: null, referensi_jenis: null, referensi_id: null },
];

const halaman = (data: unknown[], total = data.length): Jawaban => ({ status: 200, data: { success: true, data, meta: { page: 1, per_page: 25, total, total_pages: Math.max(1, Math.ceil(total / 25)) } } });

function server(o: { me?: unknown; katalog?: (p: Permintaan) => Jawaban; detail?: Jawaban; linimasa?: Jawaban } = {}) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(o.me ?? ME);
        if (p.url === "/assets") return o.katalog?.(p) ?? halaman([ITEM]);
        if (p.url === "/asset-categories") return halaman([{ id: "3", parent_id: null, nama: "Laptop" }]);
        if (p.url === "/locations/tree") return sukses([{ nama: "Gedung A", areas: [{ rooms: [{ id: "10", nama: "Lab Komputer" }] }] }]);
        if (p.url === "/assets/12") return o.detail ?? sukses(DETAIL);
        if (p.url === "/assets/12/timeline") return o.linimasa ?? halaman(LINIMASA);
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        return { status: 404 };
    });
}

describe("P-15 Inventaris Aset", () => {
    it("tabel C-15: nama kategori & lokasi, lencana kondisi/status, kode bertaut ke P-18; tanpa pelanggaran axe", async () => {
        server();
        const { container } = await renderAplikasi("/aset");
        const tabel = await screen.findByRole("table");
        expect(within(tabel).getByRole("link", { name: "LAB-KOM-0012" }).getAttribute("href")).toBe("/aset/12");
        expect(within(tabel).getByText("Laptop")).toBeTruthy();
        expect(within(tabel).getByText("Lab Komputer")).toBeTruthy();
        expect(within(tabel).getByText("Rusak Ringan")).toBeTruthy();
        expect(within(tabel).getByText("Tersedia")).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("saringan & kata kunci → URL dan filter[...]; chip aktif dapat dihapus satu per satu", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/aset");
        await screen.findByRole("table");
        await user.selectOptions(screen.getByLabelText("Kondisi"), "RUSAK_RINGAN");
        await user.selectOptions(await screen.findByLabelText("Lokasi"), "10");
        await user.type(screen.getByLabelText(/Cari kode aset/), "laptop");
        await user.click(screen.getByRole("button", { name: "Cari" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ kondisi: "RUSAK_RINGAN", lokasi: "10", q: "laptop" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/assets").at(-1)?.params).toMatchObject({ "filter[kondisi]": "RUSAK_RINGAN", "filter[lokasi_id]": "10", q: "laptop", sort: "kode_barang", page: 1, per_page: 25 }));
        const chip = screen.getByRole("list", { name: "Saringan aktif" });
        expect(within(chip).getByText("Lokasi: Lab Komputer · Gedung A")).toBeTruthy();
        await user.click(within(chip).getByRole("button", { name: "Hapus saringan Kondisi: Rusak Ringan" }));
        await waitFor(() => expect(router.state.location.search).not.toHaveProperty("kondisi"));
    });

    it("urut lewat kepala kolom dengan aria-sort; klik kedua membalik arah", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/aset");
        const tabel = await screen.findByRole("table");
        expect(within(tabel).getByRole("columnheader", { name: /Kode Aset/ }).getAttribute("aria-sort")).toBe("ascending");
        await user.click(within(tabel).getByRole("button", { name: /Nama/ }));
        await waitFor(() => expect(log.filter((p) => p.url === "/assets").at(-1)?.params).toMatchObject({ sort: "nama" }));
        await user.click(within(await screen.findByRole("table")).getByRole("button", { name: /Nama/ }));
        await waitFor(() => expect(log.filter((p) => p.url === "/assets").at(-1)?.params).toMatchObject({ sort: "-nama" }));
        expect(within(await screen.findByRole("table")).getByRole("columnheader", { name: /Nama/ }).getAttribute("aria-sort")).toBe("descending");
    });

    it("tanpa location.view saringan Lokasi tidak dirender; hasil kosong tersaring menawarkan Hapus saringan", async () => {
        server({ me: { ...ME, permissions: { ...ME.permissions, "location.view": undefined } }, katalog: () => halaman([]) });
        await renderAplikasi("/aset?kondisi=HILANG");
        // Tabel desktop & kartu ponsel sama-sama memuat keadaan kosong (CSS responsif tak berlaku di jsdom).
        expect((await screen.findAllByText("Tidak ada aset yang cocok")).length).toBeGreaterThan(0);
        expect(screen.queryByLabelText("Lokasi")).toBeNull();
        expect(screen.getAllByRole("button", { name: "Hapus saringan" }).length).toBeGreaterThan(0);
    });

    it("hasil impor P-17 (`?impor=`) diteruskan sebagai filter[import_job_id]", async () => {
        const log = server();
        await renderAplikasi("/aset?impor=4");
        await screen.findByRole("table");
        expect(log.filter((p) => p.url === "/assets").at(-1)?.params).toMatchObject({ "filter[import_job_id]": 4 });
    });

    it("tanpa asset.view → P-08 untuk P-15 dan P-18; entri sidebar & kotak cari tidak dirender (PM-04)", async () => {
        server({ me: ME_ADMIN });
        const { router } = await renderAplikasi("/aset");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
        expect(screen.queryByRole("link", { name: "Inventaris Aset" })).toBeNull();
        expect(screen.queryByRole("search")).toBeNull();
        await router.navigate({ to: "/aset/$id", params: { id: "12" } });
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-18 Detail Aset", () => {
    it("identitas, lokasi bertingkat, penanggung jawab, perolehan (bila dikirim), QR; tanpa pelanggaran axe", async () => {
        server();
        const { container } = await renderAplikasi("/aset/12");
        expect(await screen.findByRole("heading", { name: /LAB-KOM-0012 · Laptop Guru/, level: 1 })).toBeTruthy();
        expect(screen.getByText("Lab Komputer · Lantai 1 · Gedung A")).toBeTruthy();
        expect(screen.getByText("Bu Sari")).toBeTruthy();
        expect(screen.getByText("Hibah")).toBeTruthy();
        expect(screen.getByText(/8\.500\.000/)).toBeTruthy();
        expect(screen.getByRole("img", { name: "QR Code aset LAB-KOM-0012" })).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("BR-073: tanpa kunci finansial blok Perolehan tidak dirender", async () => {
        const tanpa: Partial<AssetDetail> = { ...DETAIL };
        delete tanpa.sumber_perolehan;
        delete tanpa.nilai_perolehan;
        server({ detail: sukses(tanpa) });
        await renderAplikasi("/aset/12");
        await screen.findByRole("heading", { level: 1 });
        expect(screen.queryByRole("heading", { name: "Perolehan" })).toBeNull();
    });

    it("Dipinjam → Mutasi Lokasi tetap terlihat, nonaktif beserta alasannya (BR-010, UX-05)", async () => {
        server({ detail: sukses({ ...DETAIL, status: "DIPINJAM" }) });
        await renderAplikasi("/aset/12");
        expect(await screen.findByText("Aset sedang dipinjam — mutasi menunggu pengembalian.")).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Mutasi Lokasi" })).toBeNull();
    });

    it("aset terhapuskan: spanduk permanen, aksi transaksional disembunyikan (BR-065d)", async () => {
        server({ detail: sukses({ ...DETAIL, dihapuskan: true, tanggal_penghapusan: "2026-10-09T02:00:00.000Z" }) });
        await renderAplikasi("/aset/12");
        expect(await screen.findByText("Aset telah dihapuskan")).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Mutasi Lokasi" })).toBeNull();
    });

    it("404 → keadaan tidak ditemukan tanpa membedakan di luar scope (SDD-AUTH-08); id cacat → Tidak Ditemukan", async () => {
        server({ detail: gagal(404, "NOT_FOUND", "Aset tidak ditemukan.") });
        const { router } = await renderAplikasi("/aset/12");
        expect(await screen.findByText("Aset tidak ditemukan")).toBeTruthy();
        await router.navigate({ to: "/aset/$id", params: { id: "12a" } });
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-ditemukan"));
    });

    it("tab Riwayat (segmen URL): empat jenis entri, pelaku null = Sistem, waktu WIB", async () => {
        server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/aset/12");
        await user.click(await screen.findByRole("link", { name: "Riwayat" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/aset/12/riwayat"));
        expect(await screen.findByText("Laporan kerusakan KRS-2026-0007")).toBeTruthy();
        expect(screen.getByText("Dokumen ditautkan: faktur.pdf")).toBeTruthy();
        expect(screen.getByText("Mutasi Gudang → Lab Komputer")).toBeTruthy();
        expect(screen.getByText("Kondisi Baik → Rusak Ringan")).toBeTruthy();
        // Dibatasi ke konten: grup sidebar "Sistem" ikut tampil sejak P-60 terdaftar (PR-01-19).
        expect(within(screen.getByRole("main")).getByText("Sistem")).toBeTruthy();
        // Dibatasi ke konten: jam topbar kini "WIB <jam>" dengan jam dalam elemen tersendiri (PR-02-50, render responsif).
        expect(within(screen.getByRole("main")).getAllByText(/WIB$/).length).toBe(4);
        expect(screen.getByRole("link", { name: "Riwayat" }).getAttribute("aria-current")).toBe("page");
    });
});

describe("Pencarian global topbar", () => {
    it("kata kunci → P-15 terfilter `?q=`", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/");
        await user.type(await screen.findByRole("searchbox", { name: /Cari aset/ }), "SN-12{Enter}");
        await waitFor(() => expect(router.state.location.pathname).toBe("/aset"));
        expect(router.state.location.search).toMatchObject({ q: "SN-12" });
        await waitFor(() => expect(log.filter((p) => p.url === "/assets").at(-1)?.params).toMatchObject({ q: "SN-12" }));
    });
});
