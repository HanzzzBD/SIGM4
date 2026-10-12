import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DokumenAset } from "@sigm4/schemas";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Penangan } from "../helpers";
import { periksaBerkas } from "../../src/modules/m06-documents/api";
import { penandaGaransi } from "../../src/modules/m06-documents/garansi";

const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "asset.view": "all", "asset_document.view": "all", "asset_document.manage": "all" } };
const DOC: DokumenAset = { id: "3", jenis: "GARANSI", nama_berkas: "garansi-proyektor.pdf", keterangan: "Garansi unit laboratorium", garansi_mulai: "2026-01-01", garansi_selesai: "2026-11-01", mime: "application/pdf", ukuran: 1024, scan_status: "CLEAN", diunggah_oleh: "1", diunggah_pada: "2026-10-01T02:00:00Z", jumlah_aset: 2 };
const DETAIL = { id: "12", uuid: "3f2b1c9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c", kode_barang: "LAB-PRY-0012", nama: "Proyektor Aula", kategori: { id: "3", nama: "Proyektor" }, merek: null, model: null, nomor_seri: null, tahun_perolehan: 2023, lokasi: { room_id: "10", ruang: "Aula", area: "Lantai 1", gedung: "Gedung A" }, kondisi: "BAIK", status: "TERSEDIA", dapat_dipinjam: true, boleh_dipinjam_siswa: false, penanggung_jawab: null, qr_url: "https://sigm4.sekolah.test/a/3f2b1c9a-1d2e-4f5a-8b6c-7d8e9f0a1b2c", qr_terpasang: false, dihapuskan: false, tanggal_penghapusan: null, created_at: "2026-10-01T03:00:00Z" };
const ASSET = { id: "12", kode_barang: "LAB-PRY-0012", nama: "Proyektor Aula" };
function server(options: { me?: unknown; docs?: readonly DokumenAset[]; extra?: (p: Parameters<Penangan>[0]) => ReturnType<Penangan> | undefined } = {}) {
    return pasangServer(async (p) => {
        const extra = await options.extra?.(p);
        if (extra) return extra;
        if (p.url === "/me") return sukses(options.me ?? ME);
        if (p.url === "/assets/12") return sukses(DETAIL);
        if (p.url === "/assets/12/documents") return sukses(options.docs ?? [DOC]);
        if (p.url === "/asset-documents") return { status: 200, data: { success: true, data: (options.docs ?? [DOC]).map((d) => ({ ...d, aset: ASSET })), meta: { page: 1, per_page: 25, total: 1, total_pages: 1 } } };
        if (p.url === "/asset-categories") return sukses([{ id: "3", parent_id: null, nama: "Proyektor" }]);
        if (p.url === "/assets") return sukses([{ id: "21", kode_barang: "LAB-PRY-0021", nama: "Proyektor Kelas" }]);
        if (p.url.endsWith("/download")) return sukses({ url: "https://storage.example.test/signed-document?signature=abc", expires_at: "2026-10-11T03:15:00Z" });
        if (p.url === "/assets/12/documents/3" && p.method === "DELETE") return sukses({ dokumen_dihapus: false });
        return gagal(404, "NOT_FOUND", "Tidak ditemukan.");
    });
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("PR-03-29 dokumen aset", () => {
    it("P-26 mempertahankan filter URL sampai API, dengan aksesibilitas daftar", async () => {
        const log = server();
        const { container, router } = await renderAplikasi("/dokumen-aset?q=garansi&jenis=GARANSI&kategori=3&garansi=BERAKHIR_30_HARI&urut=garansi_selesai&page=2");
        await screen.findByText(DOC.nama_berkas);
        expect(log.find((p) => p.url === "/asset-documents")?.params).toMatchObject({ q: "garansi", "filter[jenis]": "GARANSI", "filter[kategori_id]": "3", "filter[garansi]": "BERAKHIR_30_HARI", sort: "garansi_selesai", page: 2 });
        expect(await pelanggaranAxe(container)).toEqual([]);
        await userEvent.selectOptions(screen.getByLabelText("Jenis dokumen"), "MANUAL");
        await waitFor(() => expect(router.state.location.search).toMatchObject({ jenis: "MANUAL" }));
        expect(router.state.location.search).not.toHaveProperty("page");
    });
    it("drill-down garansi legacy dikenali dan reset saringan menghapusnya", async () => {
        const log = server();
        const { router } = await renderAplikasi("/dokumen-aset?filter[garansi_berakhir_hari]=30");
        await screen.findByText(DOC.nama_berkas);
        expect(log.find((p) => p.url === "/asset-documents")?.params["filter[garansi]"]).toBe("BERAKHIR_30_HARI");
        await userEvent.click(screen.getByRole("button", { name: "Reset saringan" }));
        await waitFor(() => expect(router.state.location.search).not.toHaveProperty("garansi"));
        expect(router.state.location.search).not.toHaveProperty("filter[garansi_berakhir_hari]");
    });
    it("tanpa izin dokumen: route ditolak, tab/menu tidak terlihat, API dokumen tidak dipanggil", async () => {
        const me = { ...ME_ADMIN, user: { ...ME_ADMIN.user, role_kode: "R-07" }, permissions: { "dashboard.view": "all", "asset.view": "restricted" } };
        const log = server({ me });
        await renderAplikasi("/aset/12");
        await screen.findByRole("heading", { name: /LAB-PRY-0012/ });
        expect(screen.queryByRole("link", { name: "Dokumen" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Dokumen Aset" })).toBeNull();
        expect(log.some((p) => p.url.includes("documents"))).toBe(false);
    });
    it("route dokumen langsung menolak izin yang tidak dimiliki sebelum API", async () => {
        const log = server({ me: ME_ADMIN });
        await renderAplikasi("/dokumen-aset");
        await screen.findByRole("heading", { name: /akses/i });
        expect(log.some((p) => p.url === "/asset-documents")).toBe(false);
    });
    it("lihat saja tanpa asset.view tidak mengambil kategori, menampilkan upload/lepas, atau tautan detail", async () => {
        const log = server({ me: { ...ME_ADMIN, permissions: { "asset_document.view": "all" } } });
        await renderAplikasi("/dokumen-aset");
        await screen.findByText(DOC.nama_berkas);
        expect(screen.queryByRole("button", { name: "Unggah Dokumen" })).toBeNull();
        expect(screen.queryByRole("button", { name: /Lepas .* dari aset/ })).toBeNull();
        expect(log.some((p) => p.url === "/asset-categories")).toBe(false);
        expect(screen.queryByRole("link", { name: /LAB-PRY-0012/ })).toBeNull();
    });
    it.each(["PENDING", "INFECTED", "FAILED"] as const)("%s: unduh nonaktif tanpa meminta signed URL", async (scan_status) => {
        const log = server({ docs: [{ ...DOC, scan_status }] });
        await renderAplikasi("/aset/12/dokumen");
        const button = await screen.findByRole("button", { name: /Unduh garansi/ });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        await userEvent.click(button);
        expect(log.some((p) => p.url.endsWith("/download"))).toBe(false);
    });
    it("CLEAN: signed URL diperoleh saat klik, tanpa menaruhnya di daftar", async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        const log = server();
        await renderAplikasi("/aset/12/dokumen");
        await userEvent.click(await screen.findByRole("button", { name: /Unduh garansi/ }));
        await waitFor(() => expect(click).toHaveBeenCalledOnce());
        expect(log.some((p) => p.url === "/assets/12/documents/3/download")).toBe(true);
        expect(screen.queryByRole("link", { name: /signature/ })).toBeNull();
    });
    it("lepas memerlukan konfirmasi; gagal tetap di dialog, berhasil mempertahankan tautan lain", async () => {
        let gagalSekali = true;
        const log = server({ extra: (p) => {
            if (p.method !== "DELETE") return undefined;
            if (gagalSekali) { gagalSekali = false; return gagal(403, "FORBIDDEN", "Tidak dapat melepas dokumen ini."); }
            return sukses({ dokumen_dihapus: false });
        } });
        await renderAplikasi("/aset/12/dokumen");
        await userEvent.click(await screen.findByRole("button", { name: /Lepas garansi/ }));
        const dialog = await screen.findByRole("dialog");
        expect(log.some((p) => p.method === "DELETE")).toBe(false);
        await userEvent.click(within(dialog).getByRole("button", { name: "Lepas dokumen" }));
        await within(dialog).findByText("Tidak dapat melepas dokumen ini.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Lepas dokumen" }));
        await screen.findByText(/Tautan ke aset lain tetap tersedia/);
        expect(screen.queryByRole("dialog")).toBeNull();
    });
    it("unggah satu berkas untuk banyak aset; retry penautan tidak mengunggah ulang", async () => {
        const put = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal("fetch", put);
        vi.stubGlobal("crypto", { subtle: { digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)) } });
        let gagalSekali = true;
        const log = server({ extra: (p) => {
            if (p.url === "/files/presign") return sukses({ upload_url: "https://storage.example.test/upload", file_id: "9" });
            if (p.url === "/files/confirm") return sukses({ file_id: "9", scan_status: "PENDING" });
            if (p.url === "/assets/12/documents" && p.method === "POST") {
                if (gagalSekali) { gagalSekali = false; return gagal(422, "VALIDATION_ERROR", "Aset tambahan belum dapat ditautkan."); }
                return sukses({ ...DOC, scan_status: "PENDING" });
            }
            return undefined;
        } });
        await renderAplikasi("/aset/12/dokumen");
        await userEvent.click(await screen.findByRole("button", { name: "Unggah Dokumen" }));
        const form = await screen.findByRole("form", { name: "Unggah dokumen aset" });
        expect(await pelanggaranAxe(form)).toEqual([]);
        const file = new File(["%PDF-1.7"], "faktur.pdf", { type: "application/pdf" });
        Object.defineProperty(file, "arrayBuffer", { value: () => Promise.resolve(new ArrayBuffer(8)) });
        await userEvent.upload(within(form).getByLabelText(/Berkas dokumen/), file);
        expect((within(form).getByLabelText(/Berkas dokumen/) as HTMLInputElement).files).toHaveLength(1);
        await userEvent.type(within(form).getByLabelText("Cari aset (nama atau kode)"), "Proyektor");
        await userEvent.click(within(form).getByRole("button", { name: "Cari aset" }));
        await userEvent.click(await within(form).findByRole("button", { name: "Pilih LAB-PRY-0021" }));
        // JSDOM does not implement native validation for the synthetic FileList.
        fireEvent.submit(form);
        await within(form).findByText("Aset tambahan belum dapat ditautkan.");
        fireEvent.submit(form);
        await screen.findByText(/Dokumen tersimpan/);
        expect(put).toHaveBeenCalledOnce();
        expect(put.mock.calls[0]?.[1]).toMatchObject({ method: "PUT", credentials: "omit", headers: { "content-type": "application/pdf" } });
        expect(log.filter((p) => p.url === "/files/presign")).toHaveLength(1);
        expect(log.find((p) => p.url === "/files/confirm")?.data).toMatchObject({ file_id: 9, checksum: "0".repeat(64) });
        expect(log.find((p) => p.method === "POST" && p.url === "/assets/12/documents")?.data).toMatchObject({ file_id: 9, jenis: "FAKTUR", nama_berkas: "faktur.pdf", asset_ids_tambahan: [21] });
    });
    it("validasi format, MIME, ukuran, kosong dan tanggal garansi WIB", () => {
        expect(() => periksaBerkas(new File(["abc"], "a.exe"))).toThrow(/PDF/);
        expect(() => periksaBerkas(new File(["abc"], "a.pdf", { type: "image/png" }))).toThrow(/jenis/);
        expect(() => periksaBerkas(new File([], "a.pdf", { type: "application/pdf" }))).toThrow(/kosong/);
        expect(() => periksaBerkas(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "a.pdf", { type: "application/pdf" }))).toThrow(/10 MB/);
        expect(penandaGaransi(DOC, new Date("2026-10-31T17:00:00Z"))?.label).toBe("Garansi berakhir hari ini");
        expect(penandaGaransi(DOC, new Date("2026-11-01T17:00:00Z"))?.label).toBe("Garansi berakhir");
    });
    it("tanggal garansi terbalik ditolak sebelum presign; isian tetap tersedia", async () => {
        const log = server();
        await renderAplikasi("/aset/12/dokumen");
        await userEvent.click(await screen.findByRole("button", { name: "Unggah Dokumen" }));
        const form = await screen.findByRole("form", { name: "Unggah dokumen aset" });
        await userEvent.upload(within(form).getByLabelText(/Berkas dokumen/), new File(["%PDF"], "garansi.pdf", { type: "application/pdf" }));
        await userEvent.selectOptions(within(form).getByLabelText("Jenis dokumen"), "GARANSI");
        fireEvent.change(within(form).getByLabelText(/Tanggal mulai garansi/), { target: { value: "2026-11-10" } });
        fireEvent.change(within(form).getByLabelText(/Tanggal berakhir garansi/), { target: { value: "2026-11-01" } });
        fireEvent.submit(form);
        await within(form).findByText(/tanggal berakhir tidak boleh sebelum tanggal mulai/);
        expect(log.some((p) => p.url === "/files/presign")).toBe(false);
        expect((within(form).getByLabelText(/Tanggal mulai garansi/) as HTMLInputElement).value).toBe("2026-11-10");
    });
});
