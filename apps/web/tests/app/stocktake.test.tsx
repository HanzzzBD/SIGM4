import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ME_ADMIN, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
const session = { id: "1", nomor: "OPN-2026-0001", nama: "Opname Oktober", domain: "ASET", periode_mulai: "2026-10-14", periode_selesai: "2026-10-20", cakupan: { jenis: "SEKOLAH" }, status: "BERJALAN", created_by: "2", finalized_at: "2026-10-14T03:00:00Z", catatan_keputusan: null, disetujui_oleh: null, disetujui_pada: null, target: 1, diperiksa: 0, selisih: 1, temuan_baru: 0, belum_dilengkapi: 1, temuan_belum_dilengkapi: 0, foto_tertunda: 0, pelaksana: [{ id: "2", nama: "Petugas A" }], lokasi: [{ id: "1", nama: "Gudang", selesai: true, target: 1, diperiksa: 0 }], report_status: "BELUM" };
const item = { id: "8", asset_id: "1", nama: "Kipas", kode_barang: "KIP-001", uuid: "cfa153d1-f7b5-442e-afd8-40d6d37a0ccb", room_id_sistem: "1", lokasi_sistem: "Gudang", kondisi_sistem: "BAIK", status_sistem: "TERSEDIA", room_id_aktual: null, kondisi_aktual: null, hasil: "TIDAK_DITEMUKAN", salah_lokasi: false, beda_kondisi: false, keterangan: null, tindakan: null, room_id_sekarang: "1", kondisi_sekarang: "BAIK", diperiksa_oleh: null, diperiksa_pada: null, catatan: null, foto_tertunda: 0 };
const meta = { page: 1, per_page: 20, total: 1, total_pages: 1 };
const list = (rows: unknown[]) => ({ status: 200, data: { success: true, data: rows, meta: { ...meta, total: rows.length } } });
const me = { ...ME_ADMIN, permissions: { "audit.view": "all", "audit.manage": "all" } };
const serve = (p: { url: string }) => p.url === "/me" ? sukses(me) : p.url === "/audit-sessions" ? list([session]) : p.url === "/audit-sessions/1" ? sukses(session) : p.url.endsWith("/results") ? list([item]) : p.url.endsWith("/findings") ? list([]) : p.url.endsWith("/photos") ? sukses([]) : p.url.endsWith("/options") ? sukses({ categories: [{ id: "1", nama: "Elektronik" }], rooms: [{ id: "1", nama: "Gudang", building_id: "1" }], buildings: [{ id: "1", nama: "Gedung A" }], people: [{ id: "2", nama: "Petugas A" }] }) : { status: 404 };
describe("PR-04-19 P-47 sampai P-50", () => {
    it("daftar dan detail menampilkan progres, hasil, dan bukti; keduanya lulus axe", async () => {
        pasangServer(serve); const { router, container } = await renderAplikasi("/opname");
        fireEvent.click(await screen.findByRole("link", { name: "Opname Oktober" })); await screen.findByRole("heading", { name: "Foto bukti pemeriksaan" });
        expect(await screen.findByText("KIP-001 · Kipas")).toBeTruthy(); expect(await pelanggaranAxe(container)).toEqual([]); expect(router.state.location.pathname).toBe("/opname/1");
    });
    it("membekukan cakupan dengan pelaksana dan kunci idempotensi", async () => {
        vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
        const calls = pasangServer(p => p.method === "POST" && p.url === "/audit-sessions" ? sukses(session) : serve(p)); const { container } = await renderAplikasi("/opname/baru");
        fireEvent.change(await screen.findByLabelText(/Nama sesi/), { target: { value: "Opname Oktober" } }); fireEvent.click(screen.getByRole("checkbox", { name: "Petugas A" }));
        expect(await pelanggaranAxe(container)).toEqual([]); fireEvent.click(screen.getByRole("button", { name: "Buat sesi dan bekukan target" }));
        await waitFor(() => expect(calls.find(p => p.method === "POST")?.data).toMatchObject({ nama: "Opname Oktober", cakupan: { jenis: "SEKOLAH" }, pelaksana_ids: [2] })); expect(calls.find(p => p.method === "POST")?.headers["Idempotency-Key"]).toBeTruthy();
    });
    it("wajib keterangan, mengirim basis data terbaru, dan menonaktifkan submit jika ada selisih belum lengkap", async () => {
        const calls = pasangServer(p => p.method === "PUT" ? sukses(session) : serve(p)); const { container } = await renderAplikasi("/opname/1/rekonsiliasi");
        const save = await screen.findByRole("button", { name: "Simpan keterangan KIP-001" }); expect((save as HTMLButtonElement).disabled).toBe(true); expect((screen.getByRole("button", { name: "Kirim ke Pimpinan" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText(/Keterangan KIP-001/), { target: { value: "Tidak ditemukan setelah pemeriksaan ulang" } }); fireEvent.click(save);
        await waitFor(() => expect(calls.find(p => p.method === "PUT")?.data).toMatchObject({ tindakan: "HILANG", basis: { room_id: 1, kondisi: "BAIK" } })); expect(await pelanggaranAxe(container)).toEqual([]);
    });
    it("persetujuan langsung tampil bagi Pimpinan dan diblokir pada sesi milik sendiri", async () => {
        pasangServer(p => p.url === "/me" ? sukses({ ...ME_ADMIN, user: { ...ME_ADMIN.user, id: "2", role_kode: "R-03" }, permissions: { "audit.view": "all", "audit.approve": "all" } }) : p.url === "/audit-sessions/1" ? sukses({ ...session, status: "MENUNGGU_PERSETUJUAN" }) : serve(p));
        await renderAplikasi("/opname/1/rekonsiliasi"); await screen.findByText("Pembuat dan pelaksana tidak dapat menyetujui sesinya sendiri."); expect(screen.queryByRole("button", { name: "Setujui dan terapkan penyesuaian" })).toBeNull();
    });
});
