import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID, webcrypto } from "node:crypto";
import type { LoanDetail, ReadyCheckout } from "@sigm4/schemas";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";

const READY: ReadyCheckout = { id: "100", nomor: "RSV-BR-2027-0100", peminjam: { id: "2", nama: "Guru Uji" }, waktu_mulai: "2027-07-05T01:00:00Z", waktu_selesai: "2027-07-05T10:00:00Z", lokasi_penggunaan: "Kelas 1", unit: [{ asset_id: "10", uuid: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", kode_barang: "PRJ-01", nama: "Proyektor", kondisi: "BAIK" }] };
const PHOTO = { file_id: "1", status: "PENDING" as const, url: null };
const LOAN: LoanDetail = { id: "101", nomor: "PJM-2027-0101", reservation_id: "100", nomor_reservasi: READY.nomor, peminjam: READY.peminjam, petugas: { id: "1", nama: "Petugas Uji" }, nama_penerima: "Guru Uji", diwakilkan: false, bypass_approval: false, alasan_bypass: null, tanggal_pinjam: READY.waktu_mulai, tanggal_jatuh_tempo: READY.waktu_selesai, tanggal_kembali: null, status: "DIPINJAM", signature: PHOTO, aksi: { checkin: true }, unit: [{ id: "11", asset_id: "10", allocated_asset_id: "10", alasan_substitusi: null, uuid: READY.unit[0]!.uuid, kode_barang: "PRJ-01", nama: "Proyektor", category_id: "1", kondisi_awal: "BAIK", kondisi_akhir: null, tidak_lengkap: false, status_kembali: "BELUM_KEMBALI", tanggal_kembali: null, catatan: null, foto_awal: [PHOTO], foto_akhir: [], denda: [], damage_report_id: null }] };
const ME = { ...ME_ADMIN, permissions: { "loan.manage": "all", "loan.view": "all", "loan.direct": "all", "reservation.view": "all", "reservation.cancel_own": "own" } };
beforeAll(() => {
    vi.stubGlobal("crypto", { randomUUID, subtle: webcrypto.subtle });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    vi.stubGlobal("createImageBitmap", async () => ({ width: 10, height: 10, close: () => undefined }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ drawImage: () => undefined }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => { const blob = new Blob(["photo"], { type: "image/jpeg" }); Object.defineProperty(blob, "arrayBuffer", { value: async () => new TextEncoder().encode("photo").buffer }); done(blob); });
    vi.spyOn(File.prototype, "arrayBuffer").mockImplementation(async () => new TextEncoder().encode("photo").buffer);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    URL.createObjectURL = vi.fn(() => "blob:private-photo"); URL.revokeObjectURL = vi.fn();
});
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function server(failCheckout = false, own = false) {
    let nextFile = 200, closed = false;
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(own ? { ...ME, user: { ...ME.user, id: "2" }, permissions: { "loan.view": "own", "reservation.view": "all" } } : ME);
        if (p.url === "/loans/ready-checkout") return { status: 200, data: { success: true, data: [READY], meta: { page: 1, per_page: 25, total: 1, total_pages: 1 } } };
        if (p.url === "/loans/borrowers") return { status: 200, data: { success: true, data: [{ id: "2", nama: "Guru Uji", role: "Guru" }], meta: { page: 1, per_page: 25, total: 1, total_pages: 1 } } };
        if (p.url === "/loans/units/resolve") return sukses({ asset_id: "10", uuid: READY.unit[0]!.uuid, kode_barang: "PRJ-01", nama: "Proyektor", category_id: "1", kondisi: "BAIK", layak: true });
        if (p.url === "/files/presign") return sukses({ file_id: String(nextFile++), upload_url: "https://storage.test/upload", object_key: "private", expires_in: 300 });
        if (p.url === "/files/confirm") return sukses({ file_id: "200", scan_status: "PENDING" });
        if (p.url === "/loans/checkout") return failCheckout ? gagal(422, "VALIDATION_ERROR", "Konfigurasi denda belum lengkap.") : sukses({ id: "101", nomor: LOAN.nomor, status: "DIPINJAM" });
        if (p.url === "/loans/101") return sukses({ ...LOAN, status: closed ? "DIKEMBALIKAN" : "DIPINJAM", aksi: { checkin: !closed && !own } });
        if (p.url === "/loans/101/checkin/preview") return sukses({ unit: [{ loan_item_id: "11", hari_terlambat: 2, tarif_per_hari: "1000.00", sebelum_cap: "2000.00", denda: "1500.00", ganti_rugi: "0.00", menunggu_penetapan: false }] });
        if (p.url === "/loans/101/checkin") { closed = true; return sukses({ id: "101", nomor: LOAN.nomor, status: "DIKEMBALIKAN" }); }
        return { status: 404 };
    });
}
async function evidence(label: RegExp, name: string, user: ReturnType<typeof userEvent.setup>) {
    const file = new File(["photo"], name, { type: "image/png" });
    await user.upload(screen.getByLabelText(label), file);
    await waitFor(() => expect(screen.queryByText("Mengunggah bukti…")).toBeNull());
}
async function checkoutReview() {
    const user = userEvent.setup();
    fireEvent.click(await screen.findByRole("button", { name: `Serah terima ${READY.nomor}` }));
    fireEvent.change(screen.getByRole("textbox", { name: /Kode aset atau QR unit 1/ }), { target: { value: "PRJ-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Verifikasi unit 1" }));
    await screen.findByText(/PRJ-01 · Proyektor · Kondisi/);
    await evidence(/Foto kondisi awal unit 1/, "kondisi.png", user);
    await evidence(/Unggah tanda tangan PNG sebagai alternatif/, "tanda-tangan.png", user);
    await waitFor(() => expect((screen.getByRole("button", { name: "Tinjau serah terima" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Tinjau serah terima" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Tinjau serah terima" }), document.querySelector("main")?.textContent).not.toBeNull());
}
describe("PR-05-01..04 — UI serah terima dan pengembalian", () => {
    it("verifikasi/foto/tanda tangan wajib, tinjauan sebelum POST, bukti receipt dan axe", async () => {
        const calls = server(); const { container } = await renderAplikasi("/peminjaman/serah-terima");
        await checkoutReview(); expect(calls.filter((p) => p.url === "/loans/checkout")).toHaveLength(0);
        expect(await pelanggaranAxe(container)).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: "Serahkan" })); await screen.findByRole("heading", { name: LOAN.nomor });
        const sent = calls.find((p) => p.url === "/loans/checkout")!; expect(sent.data).toMatchObject({ reservation_id: 100, unit: [{ asset_id: 10, verification_code: "PRJ-01" }] }); expect(sent.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
        expect(within(screen.getByRole("region", { name: "Unit peminjaman" })).queryAllByRole("img")).toHaveLength(0); await screen.findByText(/Tanda tangan 1: Menunggu pemindaian/);
    });
    it("peminjaman langsung memilih peminjam, mencatat alasan dan tidak mengirim reservation_id", async () => {
        const calls = server(), user = userEvent.setup(); await renderAplikasi("/peminjaman/serah-terima");
        fireEvent.click(await screen.findByRole("button", { name: "Peminjaman langsung" }));
        await screen.findByRole("option", { name: /Guru Uji/ });
        await user.selectOptions(screen.getByRole("combobox", { name: /Peminjam aktif/ }), "2");
        fireEvent.change(screen.getByLabelText(/Jatuh tempo \(WIB\)/), { target: { value: "2027-07-05T17:00" } });
        fireEvent.change(screen.getByRole("textbox", { name: /Keperluan/ }), { target: { value: "Mengajar" } });
        fireEvent.change(screen.getByRole("textbox", { name: /Lokasi penggunaan/ }), { target: { value: "Kelas 1" } });
        fireEvent.change(screen.getByRole("textbox", { name: /Alasan peminjaman langsung/ }), { target: { value: "Pengganti alat kelas." } });
        fireEvent.change(screen.getByRole("textbox", { name: /Kode aset atau QR unit 1/ }), { target: { value: "PRJ-01" } });
        fireEvent.click(screen.getByRole("button", { name: "Verifikasi unit 1" })); await screen.findByText(/PRJ-01.*Kondisi/);
        await evidence(/Foto kondisi awal unit 1/, "kondisi.png", user); await evidence(/Unggah tanda tangan PNG sebagai alternatif/, "tanda-tangan.png", user);
        fireEvent.click(screen.getByRole("button", { name: "Tinjau serah terima" })); await screen.findByRole("heading", { name: "Tinjau serah terima" });
        expect(calls.filter((p) => p.url === "/loans/checkout")).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", { name: "Serahkan" })); await screen.findByRole("heading", { name: LOAN.nomor });
        const payload = calls.find((p) => p.url === "/loans/checkout")!.data;
        expect(payload).toMatchObject({ langsung: { peminjam_id: 2, tanggal_jatuh_tempo: "2027-07-05T17:00:00+07:00", alasan: "Pengganti alat kelas." } });
        expect(payload).not.toHaveProperty("reservation_id");
    });
    it("konfigurasi belum lengkap ditampilkan dan retry mempertahankan kunci", async () => {
        const calls = server(true); await renderAplikasi("/peminjaman/serah-terima"); await checkoutReview();
        fireEvent.click(screen.getByRole("button", { name: "Serahkan" })); await screen.findByText("Konfigurasi denda belum lengkap.");
        fireEvent.click(screen.getByRole("button", { name: "Serahkan" })); await waitFor(() => expect(calls.filter((p) => p.url === "/loans/checkout")).toHaveLength(2)); const sent = calls.filter((p) => p.url === "/loans/checkout"); expect(sent[0]!.headers["Idempotency-Key"]).toBe(sent[1]!.headers["Idempotency-Key"]);
    });
    it("pengembalian menampilkan hitungan dan cap sebelum menyimpan lalu memperbarui receipt", async () => {
        const calls = server(), user = userEvent.setup(); await renderAplikasi("/peminjaman/101");
        fireEvent.click(await screen.findByRole("button", { name: "Proses Pengembalian" }));
        fireEvent.change(screen.getByRole("textbox", { name: /Verifikasi kode atau QR PRJ-01/ }), { target: { value: "PRJ-01" } });
        await evidence(/Foto kondisi akhir PRJ-01/, "kembali.png", user);
        fireEvent.click(screen.getByRole("button", { name: "Tinjau pengembalian" })); await screen.findByText(/2 hari kalender × Rp1.000 = Rp2.000/); await screen.findByText(/Denda: Rp1.500/); expect(calls.filter((p) => p.url === "/loans/101/checkin")).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", { name: "Konfirmasi Pengembalian" })); await screen.findByText(/Pengembalian tercatat. Kondisi dan ketersediaan/); await waitFor(() => expect(screen.queryByRole("button", { name: "Proses Pengembalian" })).toBeNull());
    });
    it("pemilik bisa melihat receipt tanpa aksi pengelola", async () => {
        server(false, true); await renderAplikasi("/peminjaman/101"); await screen.findByRole("heading", { name: LOAN.nomor }); expect(screen.queryByRole("button", { name: "Proses Pengembalian" })).toBeNull(); expect(screen.queryByRole("link", { name: "Antrean Serah Terima" })).toBeNull();
    });
    it("foto atau tanda tangan belum ada mencegah pengiriman", async () => {
        const calls = server(); await renderAplikasi("/peminjaman/serah-terima"); fireEvent.click(await screen.findByRole("button", { name: `Serah terima ${READY.nomor}` })); expect((screen.getByRole("button", { name: "Tinjau serah terima" }) as HTMLButtonElement).disabled).toBe(true); expect(calls.filter((p) => p.url === "/loans/checkout")).toHaveLength(0);
    });
});
