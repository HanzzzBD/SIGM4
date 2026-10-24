// UI P-28 → P-29 → P-31 menggunakan router, middleware sesi dan klien HTTP produksi.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssetReservationBody, ReservationDetail, RoomAvailability, RoomReservationPreview } from "@sigm4/schemas";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { gagal, ME_ADMIN, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
const PATH = "/reservasi/baru?mode=aset&kategori=1&jumlah=1&mulai=2027-05-05T08%3A00&selesai=2027-05-05T17%3A00";
const ME = { ...ME_ADMIN, user: { ...ME_ADMIN.user, role_kode: "R-05" }, permissions: { "reservation.view": "all", "reservation.create": "own", "reservation.cancel_own": "own" } };
const ROOM: RoomAvailability = { dari: "2027-05-05T01:00:00Z", sampai: "2027-05-05T10:00:00Z", zona_waktu: "Asia/Jakarta", granularitas_menit: 30, jam_operasional: { hari: [1, 2, 3, 4, 5], mulai: "06:00", selesai: "18:00" }, hari_libur: [], ruangan: [{ id: "10", nama: "Aula", kode: "A1", jenis: "AULA", kapasitas: 100, gedung: { id: "1", nama: "Gedung A" } }], slot: [] };
const REVIEW: RoomReservationPreview = { tanggal: [{ tanggal: "2027-05-05", mulai: "2027-05-05T01:00:00Z", selesai: "2027-05-05T10:00:00Z", keadaan: "TERSEDIA", alasan: null }], jalur_persetujuan: [{ urutan: 1, approver: "Petugas Sarpras", sla_jam: 8, fallback: false, akan_dilewati: null }], kuota: { berjalan: 0, batas: 5 } };
const DETAIL: ReservationDetail = { id: "101", nomor: "RSV-BR-2027-0101", jenis: "ASET", status: "MENUNGGU_PERSETUJUAN", ruangan: null, pemohon: { id: "1", nama: "Admin Uji" }, nama_kegiatan: null, jenis_kegiatan: null, jumlah_peserta: null, keperluan: "Praktik", lokasi_penggunaan: "Kelas 1", kebutuhan_tambahan: null, keterangan: null, waktu_mulai: "2027-05-05T01:00:00Z", waktu_selesai: "2027-05-05T10:00:00Z", diajukan_pada: "2027-05-03T02:00:00Z", induk: null, tanggal: [], penggunaan: null, approval_instance_id: null, aksi: { batalkan: true, ubah_jadwal: false, ajukan_ulang: false, catat_penggunaan: { kondisi: false, tidak_digunakan: false } }, riwayat: [], aset: [{ reservation_id: "101", asset_id: null, kode_barang: null, nama: "Proyektor", category_id: "1", kondisi: "BAIK" }] };
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterAll(() => vi.unstubAllGlobals());
function server(review = REVIEW, failure = false) {
    let canceled = false;
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(ME);
        if (p.url === "/assets/availability") return { status: 200, data: { success: true, data: { dari: "2027-05-05T01:00:00Z", sampai: "2027-05-05T10:00:00Z", zona_waktu: "Asia/Jakarta", horizon_sampai: "2027-08-01T00:00:00Z", kategori: [{ id: "1", nama: "Elektronik" }, { id: "2", nama: "Peralatan" }], kelompok: [{ key: "p", nama: "Proyektor", merek: null, model: null, kategori: { id: "1", nama: "Elektronik" }, jumlah_unit: 2, jumlah_tersedia: 2, tersedia_mulai: "2027-05-05T01:00:00Z", foto_url: null, unit: [{ id: "1", kode_barang: "PRJ-01", kondisi: "BAIK", tersedia: true, tersedia_mulai: "2027-05-05T01:00:00Z" }] }] }, meta: { page: 1, per_page: 100, total: 1, total_pages: 1 } } };
        if (p.url === "/rooms/availability") return sukses(ROOM);
        if (p.url === "/reservations/preview") return sukses(review);
        if (p.url === "/reservations") return failure ? gagal(409, "ASSET_NOT_AVAILABLE", "Aset baru saja dipesan pengguna lain.") : sukses({ id: "101", nomor: DETAIL.nomor, status: "MENUNGGU_PERSETUJUAN", tanggal: [{ id: "101", nomor: DETAIL.nomor, mulai: DETAIL.waktu_mulai, selesai: DETAIL.waktu_selesai }], approval: { instance_id: 10, langkah_aktif: 1 } });
        if (p.url === "/reservations/101") return sukses(canceled ? { ...DETAIL, status: "DIBATALKAN", aksi: { ...DETAIL.aksi, batalkan: false } } : DETAIL);
        if (p.url === "/reservations/101/cancel") { canceled = true; return sukses({ id: "101", nomor: DETAIL.nomor, status: "DIBATALKAN", dibatalkan: [{ id: "101", nomor: DETAIL.nomor }] }); }
        return { status: 404 };
    });
}
async function details() {
    await screen.findByRole("option", { name: "Elektronik" }, { timeout: 10000 });
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan" }));
    fireEvent.change(await screen.findByRole("textbox", { name: /Keperluan/ }), { target: { value: "Praktik" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Lokasi penggunaan/ }), { target: { value: "Kelas 1" } });
}
describe("PR-04-02/03 — UI pengajuan dan pembatalan aset", () => {
    it("tiga langkah, tinjauan wajib, kunci idempotensi dan detail unit tersembunyi; axe lulus", async () => {
        const calls = server(); const { container } = await renderAplikasi(PATH);
        await details(); expect(calls.filter((p) => p.url === "/reservations")).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", { name: "Tinjau pengajuan" }));
        await screen.findByRole("heading", { name: "Jalur persetujuan" });
        expect(await pelanggaranAxe(container)).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: "Ajukan reservasi" }));
        await screen.findByRole("heading", { name: DETAIL.nomor });
        await screen.findByText(/Kode unit ditampilkan setelah disetujui/);
        const sent = calls.find((p) => p.url === "/reservations")!;
        const payload = sent.data as AssetReservationBody;
        expect(payload).toMatchObject({ jenis: "ASET", aset: [{ category_id: 1, jumlah: 1 }], keperluan: "Praktik", lokasi_penggunaan: "Kelas 1", waktu_mulai: "2027-05-05T08:00:00+07:00" });
        expect(sent.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
        expect(calls.filter((p) => p.url === "/assets" || p.url === "/asset-categories")).toHaveLength(0);
    });
    it("pengajuan gabungan memuat ruangan dan rincian kegiatan dalam satu payload", async () => {
        const calls = server(); await renderAplikasi(PATH); await details();
        await screen.findByRole("option", { name: "Aula" });
        fireEvent.change(screen.getByRole("combobox", { name: /Ruangan pendukung/ }), { target: { value: "10" } });
        fireEvent.change(screen.getByRole("textbox", { name: /Nama kegiatan/ }), { target: { value: "Praktik bersama" } });
        fireEvent.change(screen.getByRole("textbox", { name: /Jenis kegiatan/ }), { target: { value: "Pelajaran" } });
        fireEvent.click(screen.getByRole("button", { name: "Tinjau pengajuan" }));
        await screen.findByRole("heading", { name: "Jalur persetujuan" });
        const preview = calls.find((p) => p.url === "/reservations/preview")!;
        expect(preview.data).toMatchObject({ jenis: "ASET", room_id: 10, nama_kegiatan: "Praktik bersama", jenis_kegiatan: "Pelajaran", jumlah_peserta: 1 });
    });
    it("tanggal bentrok tidak bisa diajukan; kembali dan perbaiki isian", async () => {
        const calls = server({ ...REVIEW, tanggal: [{ ...REVIEW.tanggal[0]!, keadaan: "BENTROK", alasan: "Semua unit terpakai." }] });
        await renderAplikasi(PATH); await details(); fireEvent.click(screen.getByRole("button", { name: "Tinjau pengajuan" }));
        await screen.findByText("Semua unit terpakai."); expect((screen.getByRole("button", { name: "Ajukan reservasi" }) as HTMLButtonElement).disabled).toBe(true); expect(calls.filter((p) => p.url === "/reservations")).toHaveLength(0);
    });
    it("isian wajib divalidasi sebelum pratinjau; galat tertaut field", async () => {
        const calls = server(); await renderAplikasi(PATH); await screen.findByRole("option", { name: "Elektronik" });
        fireEvent.click(screen.getByRole("button", { name: "Lanjutkan" })); fireEvent.click(await screen.findByRole("button", { name: "Tinjau pengajuan" }));
        await waitFor(() => expect(screen.getByRole("textbox", { name: /Keperluan/ }).getAttribute("aria-invalid")).toBe("true")); expect(calls.filter((p) => p.url === "/reservations/preview")).toHaveLength(0);
    });
    it("konflik saat pengajuan memberi pesan; percobaan ulang memakai kunci yang sama", async () => {
        const calls = server(REVIEW, true); await renderAplikasi(PATH); await details(); fireEvent.click(screen.getByRole("button", { name: "Tinjau pengajuan" }));
        await screen.findByRole("heading", { name: "Jalur persetujuan" }); fireEvent.click(screen.getByRole("button", { name: "Ajukan reservasi" }));
        await screen.findByText("Aset baru saja dipesan pengguna lain."); fireEvent.click(screen.getByRole("button", { name: "Ajukan reservasi" }));
        await waitFor(() => expect(calls.filter((p) => p.url === "/reservations")).toHaveLength(2)); const attempts = calls.filter((p) => p.url === "/reservations"); expect(attempts[0]!.headers["Idempotency-Key"]).toBe(attempts[1]!.headers["Idempotency-Key"]);
    });
    it("pembatalan aset memakai alasan wajib dan memperbarui detail", async () => {
        const calls = server(); const user = userEvent.setup(); await renderAplikasi("/reservasi/101");
        await user.click(await screen.findByRole("button", { name: "Batalkan" })); const dialog = await screen.findByRole("dialog", { name: `Batalkan reservasi ${DETAIL.nomor}?` });
        const confirm = within(dialog).getByRole("button", { name: "Batalkan reservasi" }); expect((confirm as HTMLButtonElement).disabled).toBe(true);
        await user.type(within(dialog).getByRole("textbox"), "Kegiatan dibatalkan."); await user.click(confirm);
        await waitFor(() => expect(screen.queryByRole("button", { name: "Batalkan" })).toBeNull());
        expect(calls.find((p) => p.url === "/reservations/101/cancel")!.data).toEqual({ alasan: "Kegiatan dibatalkan." });
    });
});
