// P-06 Halaman Publik Aset, P-24 Label QR, P-25 Scan QR web (FR-05.1, FR-05.2, UX-02, C-25; PR-03-28,
// keputusan 24 log phase-03) — aplikasi utuh lewat router dan klien HTTP produksi. Kamera, canvas, dan
// jsQR ditiru: jsdom tidak menyediakan `getUserMedia` maupun konteks 2D.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uuidDariQr } from "../../src/modules/m05-qr/api";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

const isiQr = vi.hoisted(() => ({ nilai: null as string | null }));
vi.mock("jsqr", () => ({ default: () => (isiQr.nilai === null ? null : { data: isiQr.nilai }) }));

const UUID = "3f2b1c9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c";
const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "asset.view": "all", "asset.qr_print": "all" } };
const PUBLIK = { kode_barang: "LAB-PRY-0012", nama: "Proyektor Aula", kategori: "Proyektor", lokasi: { gedung: "Gedung A", area: "Lantai 1", ruang: "Aula" }, kondisi: "BAIK", status: "TERSEDIA", aktif: true };
const PINDAIAN = { id: "12", uuid: UUID, kode_barang: "LAB-PRY-0012", nama: "Proyektor Aula", kategori_nama: "Proyektor", lokasi: PUBLIK.lokasi, kondisi: "BAIK", status: "TERSEDIA", dihapuskan: false };
const ringkas = (id: string, kode: string, terpasang = false) => ({ id, kode_barang: kode, nama: `Aset ${id}`, qr_terpasang: terpasang });
const halaman = (data: unknown[]): Jawaban => ({ status: 200, data: { success: true, data, meta: { page: 1, per_page: 25, total: data.length, total_pages: 1 } } });

function server(o: { me?: unknown; publik?: Jawaban; cari?: (p: Permintaan) => Jawaban; byUuid?: Jawaban } = {}) {
    return pasangServer((p) => {
        if (p.url === "/public/qr/config") return sukses({ app_base_url: "https://sigm4.sekolah.test" });
        if (p.url === "/me") return sukses(o.me ?? ME);
        if (p.url === `/public/assets/${UUID}`) return o.publik ?? sukses(PUBLIK);
        if (p.url === `/assets/by-uuid/${UUID}`) return o.byUuid ?? sukses(PINDAIAN);
        if (p.url === "/assets/12") return sukses({ id: "12", uuid: UUID, kode_barang: "LAB-PRY-0012", nama: "Proyektor Aula", kategori: { id: "3", nama: "Proyektor" }, merek: null, model: null, nomor_seri: null, tahun_perolehan: 2023, lokasi: { room_id: "10", ruang: "Aula", area: "Lantai 1", gedung: "Gedung A" }, kondisi: "BAIK", status: "TERSEDIA", dapat_dipinjam: true, boleh_dipinjam_siswa: false, penanggung_jawab: null, qr_url: `https://sigm4.sekolah.test/a/${UUID}`, qr_terpasang: false, dihapuskan: false, tanggal_penghapusan: null, created_at: "2026-10-01T03:00:00.000Z" });
        if (p.url === "/assets/21") return sukses(ringkas("21", "LAB-PRY-0021"));
        if (p.url === "/assets/22") return sukses(ringkas("22", "LAB-PRY-0022", true));
        if (p.url === "/assets") return o.cari?.(p) ?? halaman([ringkas("30", "LAB-PRY-0030")]);
        if (p.url === "/assets/qr/print") return { status: 200, data: new Blob(["%PDF-1.7"], { type: "application/pdf" }), headers: { "content-disposition": 'attachment; filename="label-qr-uji.pdf"' } };
        if (p.url === "/assets/qr-terpasang") return { status: 200, data: { success: true, data: { diubah: ["21"], qr_terpasang: true }, meta: { jumlah_diubah: 1 } } };
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        return { status: 404 };
    });
}

afterEach(() => {
    isiQr.nilai = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("uuidDariQr (FR-05.1 langkah 1)", () => {
    it("hanya payload `…/a/{uuid}` yang dikenali", () => {
        expect(uuidDariQr(`https://sigm4.sekolah.test/a/${UUID.toUpperCase()}`)).toBe(UUID);
        expect(uuidDariQr("https://contoh.com/produk/123")).toBeNull();
        expect(uuidDariQr("teks bebas")).toBeNull();
    });
});

describe("origin label PDF", () => {
    it("memakai domain backend meskipun halaman scanner dibuka di localhost", () => {
        const label = `https://sigm4.sekolah.test/a/${UUID}`;
        expect(uuidDariQr(label, "http://localhost:5173")).toBeNull();
        expect(uuidDariQr(label, "https://sigm4.sekolah.test")).toBe(UUID);
    });
    it("menolak domain asing, URL berparameter dan UUID yang tidak sah", () => {
        for (const label of [`https://evil.test/a/${UUID}`, `https://sigm4.sekolah.test/a/${UUID}?next=evil`, `https://sigm4.sekolah.test/a/${UUID}#x`, `https://user@sigm4.sekolah.test/a/${UUID}`, "https://sigm4.sekolah.test/a/not-uuid"])
            expect(uuidDariQr(label, "https://sigm4.sekolah.test")).toBeNull();
    });
});


describe("P-06 Halaman Publik Aset", () => {
    it("tanpa sesi: atribut non-sensitif, noindex, tanpa sidebar; tanpa pelanggaran axe", async () => {
        const log = server();
        const { container } = await renderAplikasi(`/a/${UUID}`);
        expect(await screen.findByRole("heading", { name: /LAB-PRY-0012 · Proyektor Aula/ })).toBeTruthy();
        expect(screen.getByText("Aula · Lantai 1 · Gedung A")).toBeTruthy();
        expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
        expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
        expect(log.some((p) => p.url === "/me")).toBe(false);
        expect(screen.getByRole("link", { name: "masuk ke SIGM4" }).getAttribute("href")).toBe("/login");
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("aset terhapuskan bertanda tidak aktif; UUID tak dikenali → pesan jelas (FR-05.2 A1/A2)", async () => {
        server({ publik: sukses({ ...PUBLIK, aktif: false }) });
        await renderAplikasi(`/a/${UUID}`);
        expect(await screen.findByText(/Aset tidak aktif/)).toBeTruthy();
        server({ publik: gagal(404, "NOT_FOUND", "QR tidak dikenali.") });
        await renderAplikasi(`/a/${UUID}`);
        expect(await screen.findByText("QR tidak dikenali")).toBeTruthy();
    });
});

describe("P-24 Label QR", () => {
    beforeEach(() => {
        vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:uji"), revokeObjectURL: vi.fn() }));
    });

    it("aset bawaan `?aset=`, tambah lewat cari, unduh PDF dengan tata letak & elemen, lalu tandai terpasang; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const klik = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        const { container } = await renderAplikasi("/label-qr?aset=21,22");
        const terpilih = await screen.findByRole("list", { name: "Aset terpilih" });
        await waitFor(() => expect(within(terpilih).getAllByRole("listitem")).toHaveLength(2));
        expect(within(terpilih).getByText("Label terpasang")).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);

        await user.type(screen.getByLabelText(/Cari aset untuk ditambahkan/), "PRY");
        await user.click(screen.getByRole("button", { name: "Cari" }));
        await user.click(await screen.findByRole("button", { name: "Tambahkan LAB-PRY-0030" }));
        await user.click(within(screen.getByRole("list", { name: "Aset terpilih" })).getByRole("button", { name: "Lepas LAB-PRY-0022" }));
        await user.selectOptions(screen.getByLabelText("Tata letak"), "A4_2X5");
        await user.click(screen.getByRole("checkbox", { name: "Nama aset" }));
        await user.click(screen.getByRole("button", { name: "Unduh PDF" }));
        await waitFor(() => expect(log.find((p) => p.url === "/assets/qr/print")?.data).toEqual({ asset_ids: [21, 30], tata_letak: "A4_2X5", elemen: { kode_aset: true, nama: false } }));
        await waitFor(() => expect(klik).toHaveBeenCalled());
        expect(await screen.findByText(/PDF 2 label diunduh/)).toBeTruthy();

        await user.click(screen.getByRole("button", { name: "Tandai label terpasang" }));
        await waitFor(() => expect(log.find((p) => p.url === "/assets/qr-terpasang")?.data).toEqual({ asset_ids: [21, 30], qr_terpasang: true }));
        expect(await screen.findByText("1 aset ditandai berlabel QR.")).toBeTruthy();
    });

    it("tanpa aset terpilih tombol Unduh nonaktif; tanpa asset.qr_print → P-08", async () => {
        server();
        await renderAplikasi("/label-qr");
        expect((await screen.findByRole("button", { name: "Unduh PDF" })).hasAttribute("disabled")).toBe(true);
        server({ me: { ...ME, permissions: { "asset.view": "all" } } });
        const { router } = await renderAplikasi("/label-qr");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-18 → P-24", () => {
    it("P-18 menampilkan Cetak Label QR menuju P-24 dengan aset itu terpilih", async () => {
        server();
        await renderAplikasi("/aset/12");
        expect((await screen.findByRole("link", { name: "Cetak Label QR" })).getAttribute("href")).toBe("/label-qr?aset=12");
    });
});

describe("P-25 Scan QR web", () => {
    const kameraAda = () => {
        const stop = vi.fn();
        vi.stubGlobal("navigator", Object.assign(navigator, { mediaDevices: { getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [{ stop }] })) } }));
        vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
        vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(10);
        vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(10);
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: () => undefined, getImageData: () => ({ data: new Uint8ClampedArray(400), width: 10, height: 10 }) } as unknown as CanvasRenderingContext2D);
        return stop;
    };

    it("QR aset PDF dari domain backend terbaca pada browser localhost → profil dari `by-uuid`, diumumkan live region, kamera dimatikan; tanpa pelanggaran axe", async () => {
        const log = server();
        const stop = kameraAda();
        isiQr.nilai = `https://sigm4.sekolah.test/a/${UUID}`;
        const { container } = await renderAplikasi("/scan");
        expect(await screen.findByRole("heading", { name: /LAB-PRY-0012 · Proyektor Aula/ }, { timeout: 3000 })).toBeTruthy();
        expect(log.some((p) => p.url === `/assets/by-uuid/${UUID}`)).toBe(true);
        expect(screen.getByText("Terbaca: LAB-PRY-0012, Proyektor Aula")).toBeTruthy();
        await waitFor(() => expect(stop).toHaveBeenCalled());
        // UX-02: input manual tetap terlihat.
        expect(screen.getByLabelText("Masukkan kode aset manual")).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("hasil pindai → Buka detail aset menuju P-18 (PR-02-45)", async () => {
        server();
        kameraAda();
        isiQr.nilai = `https://sigm4.sekolah.test/a/${UUID}`;
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/scan");
        await user.click(await screen.findByRole("button", { name: "Buka detail aset" }, { timeout: 3000 }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/aset/12"));
    });

    it("QR asing → 'QR tidak dikenali' tanpa memanggil server (FR-05.2 A1)", async () => {
        const log = server();
        kameraAda();
        isiQr.nilai = `https://evil.test/a/${UUID}`;
        await renderAplikasi("/scan");
        expect(await screen.findByText("QR tidak dikenali. Masukkan kode aset secara manual.", undefined, { timeout: 3000 })).toBeTruthy();
        expect(log.some((p) => p.url.startsWith("/assets/by-uuid"))).toBe(false);
    });

    it("izin kamera ditolak → panduan + input manual; kode persis ditemukan, kode lain ditolak jelas (FR-05.2 A4, A1)", async () => {
        server({ cari: (p) => halaman(p.params["q"] === "LAB-PRY-0030" ? [ringkas("30", "LAB-PRY-0030")] : [ringkas("31", "LAB-PRY-00301")]) });
        vi.stubGlobal("navigator", Object.assign(navigator, { mediaDevices: { getUserMedia: vi.fn(() => Promise.reject(new DOMException("ditolak", "NotAllowedError"))) } }));
        const user = userEvent.setup();
        await renderAplikasi("/scan");
        expect(await screen.findByText("Izin kamera ditolak")).toBeTruthy();
        await user.type(screen.getByLabelText("Masukkan kode aset manual"), "LAB-PRY-0030");
        await user.click(screen.getByRole("button", { name: "Cari" }));
        expect(await screen.findByRole("heading", { name: /LAB-PRY-0030 · Aset 30/ })).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Pindai lagi" }));
        await user.type(screen.getByLabelText("Masukkan kode aset manual"), "LAB-PRY-003");
        await user.click(screen.getByRole("button", { name: "Cari" }));
        expect(await screen.findByText("Aset berkode LAB-PRY-003 tidak ditemukan.")).toBeTruthy();
    });

    it("tanpa asset.view → P-08 (PM-04)", async () => {
        server({ me: { ...ME_ADMIN, permissions: { "dashboard.view": "all" } } });
        const { router } = await renderAplikasi("/scan");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});
