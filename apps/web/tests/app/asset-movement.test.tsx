import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssetMovementDocument } from "@sigm4/schemas";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Permintaan } from "../helpers";

const me = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "asset.update": "all", "asset.view": "all", "location.view": "all", "asset_movement_document.view": "all" } };
const location = { id: "2", nama: "Gudang", kode: "GD-2", gedung: "Gedung A", area: "Lantai 1" };
const doc: AssetMovementDocument = { id: "12", status: "SIAP", pesan_galat: null, selesai_pada: "2026-10-08T03:00:00Z", snapshot: {
    versi: 1, tanggal_mutasi: "2026-10-08", dicatat_pada: "2026-10-08T03:00:00Z", pelaku: { id: "1", nama: "Petugas" }, alasan: "Penataan ruang", tujuan: location,
    aset: [{ id: "1", kode_barang: "AST-1", nama: "Kursi", nomor_seri: null, asal: { ...location, nama: "Kelas" }, penanggung_jawab_lama: null, penanggung_jawab_baru: null }],
} };
const listing = (data = [{ id: "1", kode_barang: "AST-1", nama: "Kursi", status: "TERSEDIA" }, { id: "2", kode_barang: "AST-2", nama: "Meja", status: "DIPINJAM" }], page = 1, pages = 1) => ({ status: 200, data: { success: true, data, meta: { page, total: data.length, total_pages: pages } } });
function masters(request: Permintaan) {
    if (request.url === "/me") return sukses(me);
    if (request.url === "/assets") return listing();
    if (request.url === "/locations/tree") return sukses([{ nama: "Gedung A", areas: [{ nama: "Lantai 1", rooms: [{ ...location, status: "AKTIF" }, { id: "3", nama: "Ruang tutup", kode: "RG-3", status: "NONAKTIF" }] }] }]);
    if (request.url === "/users") return listing([], 1, 1);
    if (request.url === "/assets/movements/12/document") return sukses(doc);
    return gagal(404, "NOT_FOUND", "Tidak ditemukan.");
}
async function fill() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "AST-1 — Kursi" }));
    await user.selectOptions(screen.getByLabelText(/Lokasi tujuan/), "2");
    await user.type(screen.getByLabelText(/Tanggal mutasi/), "2026-10-08");
    await user.type(screen.getByLabelText(/Alasan mutasi/), "Penataan ruang");
    return user;
}
afterEach(() => vi.restoreAllMocks());
describe("P-20 — mutasi dan berita acara", () => {
    it("tanpa kedua permission ditolak sebelum membaca data", async () => {
        const requests = pasangServer((request) => request.url === "/me" ? sukses(ME_ADMIN) : gagal(404, "NOT_FOUND", "Tidak ada."));
        await renderAplikasi("/aset/mutasi?document=12");
        expect(await screen.findByRole("heading", { name: /akses/i })).toBeTruthy();
        expect(requests.some((request) => request.url.startsWith("/assets"))).toBe(false);
    });
    it("Pimpinan membaca hasil dari URL tanpa form atau master data; PDF melalui endpoint berizin", async () => {
        const user = userEvent.setup(), click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        const requests = pasangServer((request) => {
            if (request.url === "/me") return sukses({ ...ME_ADMIN, permissions: { "asset_movement_document.view": "all" } });
            if (request.url.endsWith("/download")) return sukses({ url: "https://storage.test/private.pdf?signature=abc", expires_at: "2026-10-08T03:15:00Z", nama_berkas: "berita-acara-mutasi-12.pdf" });
            return masters(request);
        });
        const app = await renderAplikasi("/aset/mutasi?document=12");
        expect(await screen.findByText("PDF siap diunduh")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Simpan mutasi" })).toBeNull();
        expect(requests.some((request) => ["/assets", "/locations/tree", "/users"].includes(request.url))).toBe(false);
        await user.click(screen.getByRole("button", { name: "Unduh PDF" }));
        await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
        expect(requests.some((request) => request.url === "/assets/movements/12/document/download")).toBe(true);
        expect(await pelanggaranAxe(app.container)).toEqual([]);
    });
    it("form mengirim satu operasi, menyimpan ID di URL, menolak aset dipinjam/lokasi nonaktif dan lolos axe", async () => {
        const requests = pasangServer((request) => request.method === "POST" && request.url === "/assets/move" ? { status: 200, data: { success: true, data: [], meta: { jumlah_aset: 1, berita_acara: { id: "12", status: "MENUNGGU" } } } } : masters(request));
        const app = await renderAplikasi("/aset/mutasi"), user = await fill();
        expect((screen.getByRole("checkbox", { name: "AST-2 — Meja" }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByRole("option", { name: /Ruang tutup/ })).toBeNull();
        expect(await pelanggaranAxe(app.container)).toEqual([]);
        await user.click(screen.getByRole("button", { name: "Simpan mutasi" }));
        await screen.findByRole("heading", { name: "Berita acara mutasi #12" });
        await waitFor(() => expect(app.router.state.location.search).toEqual({ document: 12 }));
        expect(requests.find((request) => request.method === "POST")?.data).toEqual({ asset_ids: [1], room_tujuan_id: 2, tanggal_mutasi: "2026-10-08", alasan: "Penataan ruang", penanggung_jawab_baru_id: null });
        expect(screen.queryByRole("button", { name: "Simpan mutasi" })).toBeNull();
        await user.click(screen.getByRole("button", { name: "Mutasi baru" }));
        expect(await screen.findByRole("heading", { name: "Pilih aset dan tujuan" })).toBeTruthy();
        expect((screen.getByRole("button", { name: "Simpan mutasi" }) as HTMLButtonElement).disabled).toBe(true);
    });
    it("validasi lokal menautkan pesan tanggal/alasan dan tidak mengirim mutasi", async () => {
        const requests = pasangServer(masters), user = userEvent.setup();
        await renderAplikasi("/aset/mutasi");
        await user.click(await screen.findByRole("checkbox", { name: "AST-1 — Kursi" }));
        await user.click(screen.getByRole("button", { name: "Simpan mutasi" }));
        expect(await screen.findByText("Isi tanggal mutasi.")).toBeTruthy();
        expect(screen.getByLabelText(/Alasan mutasi/).getAttribute("aria-invalid")).toBe("true");
        expect(requests.some((request) => request.method === "POST")).toBe(false);
    });
    it("mutasi gagal mempertahankan isian dan tidak membuka laporan baru", async () => {
        const requests = pasangServer((request) => request.method === "POST" ? gagal(422, "VALIDATION_ERROR", "Aset sedang dipinjam.") : masters(request));
        const app = await renderAplikasi("/aset/mutasi"), user = await fill();
        await user.click(screen.getByRole("button", { name: "Simpan mutasi" }));
        expect(await screen.findByText("Aset sedang dipinjam.")).toBeTruthy();
        expect((screen.getByLabelText(/Alasan mutasi/) as HTMLInputElement).value).toBe("Penataan ruang");
        expect(app.router.state.location.search).toEqual({});
        expect(requests.some((request) => request.url.includes("/movements/"))).toBe(false);
    });
    it("status dipantau hingga siap; tidak memanggil mutasi lagi", async () => {
        let polls = 0;
        const requests = pasangServer((request) => {
            if (request.url === "/assets/movements/12/document") { polls++; return sukses({ ...doc, status: polls === 1 ? "BERJALAN" : "SIAP" }); }
            return masters(request);
        });
        await renderAplikasi("/aset/mutasi?document=12");
        await screen.findByText("PDF sedang dibuat");
        expect(await screen.findByRole("button", { name: "Unduh PDF" }, { timeout: 4000 })).toBeTruthy();
        expect(polls).toBe(2); expect(requests.some((request) => request.method === "POST")).toBe(false);
    });
    it("PDF gagal menunjukkan mutasi tetap tersimpan tanpa tombol proses ulang", async () => {
        const requests = pasangServer((request) => request.url.includes("/movements/") ? sukses({ ...doc, status: "GAGAL", pesan_galat: "Mutasi tersimpan; hubungi Administrator." }) : masters(request));
        await renderAplikasi("/aset/mutasi?document=12");
        expect(await screen.findByText("PDF gagal dibuat")).toBeTruthy();
        expect(screen.getByText("Mutasi tersimpan; hubungi Administrator.")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Unduh PDF" })).toBeNull();
        expect(screen.queryByRole("button", { name: /ulang|Coba lagi/ })).toBeNull();
        expect(requests.some((request) => request.method === "POST")).toBe(false);
    });
    it("pilihan lintas halaman tetap tersimpan dan unit ke-51 tidak dapat dipilih", async () => {
        const user = userEvent.setup();
        pasangServer((request) => {
            if (request.url === "/assets") {
                const page = Number(request.params["page"]), start = (page - 1) * 25;
                return listing(Array.from({ length: page === 3 ? 1 : 25 }, (_, i) => ({ id: String(start + i + 1), kode_barang: `AST-${start + i + 1}`, nama: "Aset", status: "TERSEDIA" })), page, 3);
            }
            return masters(request);
        });
        await renderAplikasi("/aset/mutasi");
        await screen.findByRole("checkbox", { name: "AST-1 — Aset" });
        for (let page = 1; page <= 2; page++) {
            for (let n = (page - 1) * 25 + 1; n <= page * 25; n++) await user.click(screen.getByRole("checkbox", { name: `AST-${n} — Aset` }));
            await user.click(screen.getByRole("button", { name: "Aset berikutnya" }));
            await screen.findByRole("checkbox", { name: `AST-${page * 25 + 1} — Aset` });
        }
        expect((screen.getByRole("checkbox", { name: "AST-51 — Aset" }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText("50 dari maksimal 50 aset dipilih.")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Hapus AST-1 dari pilihan" }));
        expect((screen.getByRole("checkbox", { name: "AST-51 — Aset" }) as HTMLButtonElement).disabled).toBe(false);
    }, 15000);
    it("404 dan kegagalan unduh memberi galat aman serta aksi baca ulang", async () => {
        pasangServer((request) => request.url.includes("/movements/") ? gagal(404, "NOT_FOUND", "Berita acara tidak ditemukan.") : masters(request));
        await renderAplikasi("/aset/mutasi?document=999");
        expect(await screen.findByText("Berita acara tidak ditemukan.")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Coba lagi" })).toBeTruthy();
    });
    it("pengguna tanpa izin dokumen tidak membocorkan status hasil dari URL", async () => {
        const requests = pasangServer((request) => request.url === "/me" ? sukses({ ...me, permissions: { "asset.update": "all" } }) : masters(request));
        await renderAplikasi("/aset/mutasi?document=12");
        expect(await screen.findByRole("heading", { name: "Akses dibatasi" })).toBeTruthy();
        expect(screen.queryByText("Mutasi tersimpan")).toBeNull();
        expect(requests.some((request) => request.url.includes("/movements/"))).toBe(false);
    });
});
