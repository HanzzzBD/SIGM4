// P-39 Laporan Kerusakan, P-40 Lapor Kerusakan, P-41 Detail Tiket (FR-11.1–FR-11.3, FR-07.4 A2, UX F-16;
// PR-03-32, keputusan 25 log phase-03) — aplikasi utuh lewat router dan klien HTTP produksi. Unggah foto
// (PUT ke URL bertanda tangan) ditiru lewat `fetch`.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DamageReportDetail, DamageReportListItem, ReservationDetail } from "@sigm4/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "damage.view": "all", "damage.create": "all", "damage.verify": "all", "asset.update_condition": "all", "location.view": "all", "asset.view": "all", "reservation.view": "all" } };

const BARIS: DamageReportListItem = {
    id: "7",
    nomor: "KRS-2027-0007",
    status: "DILAPORKAN",
    urgensi: "KRITIS",
    objek: { jenis: "ASET", id: "12", label: "Proyektor Aula (LAB-PRY-0012)", lokasi: "Aula, Gedung A" },
    pelapor: { id: "5", nama: "Pak Budi" },
    dilaporkan_pada: "2027-11-08T02:00:00.000Z",
    diverifikasi_pada: null,
    batas_sla: "2027-11-10T10:00:00.000Z",
    melampaui_sla: true,
};

const DETAIL: DamageReportDetail = {
    id: "7",
    nomor: "KRS-2027-0007",
    status: "DILAPORKAN",
    urgensi: "KRITIS",
    deskripsi: "Lampu proyektor pecah",
    objek: { jenis: "ASET", id: "12", label: "Proyektor Aula (LAB-PRY-0012)", lokasi: "Aula, Gedung A" },
    pelapor: { id: "5", nama: "Pak Budi" },
    dilaporkan_pada: "2027-11-08T02:00:00.000Z",
    diverifikasi_oleh: null,
    diverifikasi_pada: null,
    catatan_verifikasi: null,
    foto: [
        { file_id: "31", urutan: 1, status: "CLEAN", url: "https://minio.test/foto-31.webp" },
        { file_id: "32", urutan: 2, status: "BELUM_TERUNGGAH", url: null },
    ],
    foto_tertunda: 1,
    catatan: [{ id: "3", keterangan: "Kabel daya juga terkelupas", penulis: { id: "9", nama: "Siswa Penemu" }, dibuat_pada: "2027-11-08T04:00:00.000Z", foto: [] }],
    reservasi: { id: "123", nomor: "RSV-RG-2027-0123" },
    garansi: [{ dokumen_id: "4", nama_berkas: "garansi-proyektor.pdf", garansi_selesai: "2028-01-31" }],
};

const daftar = (data: DamageReportListItem[]): Jawaban => ({ status: 200, data: { success: true, data, meta: { page: 1, per_page: 25, total: data.length, total_pages: 1, jumlah_per_status: { DILAPORKAN: data.length, DIVERIFIKASI: 2, DALAM_PERBAIKAN: 0, SELESAI: 5, DITOLAK: 1 } } } });

function server(o: { me?: unknown; daftar?: (p: Permintaan) => Jawaban; detail?: Jawaban; terbuka?: unknown; lapor?: (p: Permintaan) => Jawaban; verify?: (p: Permintaan) => Jawaban } = {}) {
    let berkas = 40;
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(o.me ?? ME);
        if (p.url === "/damage-reports" && p.method === "GET") return o.daftar?.(p) ?? daftar([BARIS]);
        if (p.url === "/damage-reports" && p.method === "POST") return o.lapor?.(p) ?? { status: 201, data: { success: true, data: { id: "8", nomor: "KRS-2027-0008", status: "DILAPORKAN", foto_tertunda: 0 }, meta: null } };
        if (p.url === "/damage-reports/open") return sukses(o.terbuka ?? null);
        if (p.url === "/damage-reports/7") return o.detail ?? sukses(DETAIL);
        if (p.url === "/damage-reports/8") return sukses({ ...DETAIL, id: "8", nomor: "KRS-2027-0008", catatan: [], reservasi: null, garansi: null });
        if (p.url === "/damage-reports/7/notes") return { status: 201, data: { success: true, data: { id: "4", keterangan: "x", penulis: { id: "1", nama: "Admin Uji" }, dibuat_pada: "2027-11-08T05:00:00.000Z", foto: [] }, meta: null } };
        if (p.url === "/damage-reports/7/verify") return o.verify?.(p) ?? sukses({ id: "7", nomor: "KRS-2027-0007", status: "DITOLAK", diverifikasi_pada: "2027-11-08T06:00:00.000Z", kondisi_aset: null });
        if (p.url === "/files/presign") return sukses({ upload_url: `https://minio.test/unggah/${String(++berkas)}`, object_key: "k", file_id: String(berkas), expires_in: 300 });
        if (p.url === "/files/confirm") return sukses({ file_id: "41", scan_status: "PENDING" });
        if (p.url === "/assets/12") return sukses({ kode_barang: "LAB-PRY-0012", nama: "Proyektor Aula" });
        if (p.url === "/locations/tree") return sukses([{ id: "1", nama: "Gedung A", areas: [{ rooms: [{ id: "10", nama: "Aula" }] }] }]);
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        return { status: 404 };
    });
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))));
    if (globalThis.crypto.subtle === undefined) vi.stubGlobal("crypto", { ...globalThis.crypto, subtle: { digest: () => Promise.resolve(new ArrayBuffer(32)) } });
});
afterEach(() => vi.unstubAllGlobals());

const fotoUji = () => new File(["\x89PNG"], "retak.png", { type: "image/png" });

describe("P-39 Laporan Kerusakan", () => {
    it("tab status berjumlah, nomor bertaut ke P-41, penanda melewati batas waktu bertulisan; tanpa pelanggaran axe", async () => {
        server();
        const { container } = await renderAplikasi("/kerusakan");
        const tabel = await screen.findByRole("table");
        expect(within(tabel).getByRole("link", { name: "KRS-2027-0007" }).getAttribute("href")).toBe("/kerusakan/7");
        expect(within(tabel).getByText("Melewati batas waktu")).toBeTruthy();
        expect(within(tabel).getByText("Kritis")).toBeTruthy();
        expect(screen.getByRole("tab", { name: /Selesai\s*5/ })).toBeTruthy();
        expect(screen.getByRole("tab", { name: /Semua\s*9/ })).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("tab, saringan, dan pencarian → URL dan query (FR-11.3 langkah 2–4)", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/kerusakan");
        await screen.findByRole("table");
        await user.click(screen.getByRole("tab", { name: /Diverifikasi/ }));
        await user.selectOptions(screen.getByLabelText("Urgensi"), "TINGGI");
        await user.click(screen.getByRole("checkbox", { name: "Hanya yang melewati batas waktu" }));
        await user.type(screen.getByLabelText(/Cari nomor tiket/), "KRS-2027");
        await user.click(screen.getByRole("button", { name: "Cari" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ status: "DIVERIFIKASI", urgensi: "TINGGI", sla: true, q: "KRS-2027" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/damage-reports").at(-1)?.params).toMatchObject({ status: "DIVERIFIKASI", urgensi: "TINGGI", melampaui_sla: "true", q: "KRS-2027", urut: "dilaporkan" }));
    });

    it("tanpa damage.view → P-08 (PM-04)", async () => {
        server({ me: { ...ME_ADMIN, permissions: { "dashboard.view": "all" } } });
        const { router } = await renderAplikasi("/kerusakan");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-40 Lapor Kerusakan", () => {
    it("aset dari `?aset=`; validasi deskripsi/urgensi/foto (BR-044); unggah foto lalu kirim → P-41; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container, router } = await renderAplikasi("/kerusakan/baru?aset=12");
        expect(await screen.findByText("Aset: Proyektor Aula (LAB-PRY-0012)")).toBeTruthy();
        await user.click(await screen.findByRole("button", { name: "Kirim laporan" }));
        expect(screen.getByText("Deskripsi kerusakan wajib diisi.")).toBeTruthy();
        expect(screen.getByText("Pilih tingkat urgensi.")).toBeTruthy();
        expect(screen.getByText("Unggah minimal satu foto kerusakan.")).toBeTruthy();
        expect(log.some((p) => p.url === "/damage-reports" && p.method === "POST")).toBe(false);
        expect(await pelanggaranAxe(container)).toEqual([]);

        await user.type(screen.getByLabelText(/Deskripsi kerusakan/), "Lampu proyektor pecah");
        await user.selectOptions(screen.getByLabelText(/Tingkat urgensi/), "TINGGI");
        await user.upload(screen.getByLabelText(/Foto kerusakan/), fotoUji());
        expect(await screen.findByText("Terunggah")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Kirim laporan" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/kerusakan/8"));
        expect(log.find((p) => p.url === "/damage-reports" && p.method === "POST")?.data).toEqual({ asset_id: 12, deskripsi: "Lampu proyektor pecah", urgensi: "TINGGI", foto_file_ids: [41] });
        expect(log.some((p) => p.url === "/files/presign" && (p.data as { jenis: string }).jenis === "DAMAGE_PHOTO")).toBe(true);
    });

    it("unggahan gagal tetap dipakai sebagai foto tertunda (FR-11.1 A2)", async () => {
        server();
        vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("jaringan putus"))));
        const user = userEvent.setup();
        await renderAplikasi("/kerusakan/baru?aset=12");
        await user.upload(await screen.findByLabelText(/Foto kerusakan/), fotoUji());
        expect(await screen.findByText("Unggahan tertunda")).toBeTruthy();
    });

    it("objek sudah bertiket terbuka → formulir berganti 'Tambahkan informasi' (FR-11.1 A1)", async () => {
        const log = server({ terbuka: { id: "7", nomor: "KRS-2027-0007", status: "DIVERIFIKASI", urgensi: "TINGGI", dilaporkan_pada: "2027-11-08T02:00:00.000Z", milik_sendiri: false } });
        const user = userEvent.setup();
        await renderAplikasi("/kerusakan/baru?aset=12");
        expect(await screen.findByText("Sudah ada laporan terbuka: KRS-2027-0007")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Kirim laporan" })).toBeNull();
        await user.type(screen.getByLabelText(/Informasi tambahan/), "Kabel daya terkelupas");
        await user.click(screen.getByRole("button", { name: "Tambahkan informasi" }));
        expect(await screen.findByText("Informasi ditambahkan ke laporan KRS-2027-0007")).toBeTruthy();
        expect(log.find((p) => p.url === "/damage-reports/7/notes")?.data).toEqual({ keterangan: "Kabel daya terkelupas", foto_file_ids: [] });
    });

    it("dari P-31: ruangan + reservasi terisi → reservation_id ikut terkirim (FR-07.4 A2)", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/kerusakan/baru?ruang=10&reservasi=123");
        expect(await screen.findByText(/akan tertaut ke reservasi/)).toBeTruthy();
        await user.type(screen.getByLabelText(/Deskripsi kerusakan/), "Kursi patah");
        await user.selectOptions(screen.getByLabelText(/Tingkat urgensi/), "SEDANG");
        await user.upload(screen.getByLabelText(/Foto kerusakan/), fotoUji());
        await screen.findByText("Terunggah");
        await user.click(screen.getByRole("button", { name: "Kirim laporan" }));
        await waitFor(() => expect(log.find((p) => p.url === "/damage-reports" && p.method === "POST")?.data).toMatchObject({ room_id: 10, reservation_id: 123 }));
    });

    it("tanpa damage.create → P-08", async () => {
        server({ me: { ...ME, permissions: { "damage.view": "own" } } });
        const { router } = await renderAplikasi("/kerusakan/baru");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-41 Detail Tiket", () => {
    it("foto (tertunda ditandai), garansi aktif (BR-052), catatan, reservasi asal bertaut ke P-31; tanpa pelanggaran axe", async () => {
        server();
        const { container } = await renderAplikasi("/kerusakan/7");
        expect(await screen.findByRole("heading", { name: /Laporan KRS-2027-0007/ })).toBeTruthy();
        expect(screen.getByText("Aset masih dalam masa garansi")).toBeTruthy();
        expect(screen.getByRole("img", { name: "Foto kerusakan 1" }).getAttribute("src")).toBe("https://minio.test/foto-31.webp");
        expect(screen.getByText("Unggahan tertunda")).toBeTruthy();
        expect(screen.getByText("Kabel daya juga terkelupas")).toBeTruthy();
        expect(screen.getByRole("link", { name: "RSV-RG-2027-0123" }).getAttribute("href")).toBe("/reservasi/123");
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("drawer verifikasi `?aksi=verifikasi`: Tolak menuntut alasan; terkirim beserta kondisi aset opsional", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/kerusakan/7");
        await user.click(await screen.findByRole("button", { name: "Verifikasi" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ aksi: "verifikasi" }));
        const panel = await screen.findByRole("dialog", { name: /Verifikasi laporan KRS-2027-0007/ });
        await user.selectOptions(within(panel).getByLabelText(/Tindak lanjut/), "TOLAK");
        await user.click(within(panel).getByRole("button", { name: "Tolak laporan" }));
        expect(within(panel).getByText("Alasan penolakan wajib diisi.")).toBeTruthy();
        expect(log.some((p) => p.url === "/damage-reports/7/verify")).toBe(false);
        await user.type(within(panel).getByLabelText(/Alasan penolakan/), "Bukan kerusakan, kabel lepas");
        await user.selectOptions(within(panel).getByLabelText(/Kondisi aset/), "BAIK");
        await user.click(within(panel).getByRole("button", { name: "Tolak laporan" }));
        await waitFor(() => expect(log.find((p) => p.url === "/damage-reports/7/verify")?.data).toEqual({ keputusan: "TOLAK", catatan: "Bukan kerusakan, kabel lepas", kondisi_aset: { kondisi: "BAIK" } }));
        expect(await screen.findByText("Laporan KRS-2027-0007 kini Ditolak.")).toBeTruthy();
    });

    it("tanpa damage.verify atau status bukan Dilaporkan → tombol Verifikasi tidak ada; tambah informasi di detail", async () => {
        const log = server({ me: { ...ME, permissions: { ...ME.permissions, "damage.verify": undefined } } });
        const user = userEvent.setup();
        await renderAplikasi("/kerusakan/7");
        await screen.findByRole("heading", { name: /Laporan KRS-2027-0007/ });
        expect(screen.queryByRole("button", { name: "Verifikasi" })).toBeNull();
        await user.type(screen.getByRole("textbox", { name: /Informasi tambahan/ }), "Masih berkedip");
        await user.click(screen.getByRole("button", { name: "Tambahkan informasi" }));
        await waitFor(() => expect(log.find((p) => p.url === "/damage-reports/7/notes")?.data).toEqual({ keterangan: "Masih berkedip", foto_file_ids: [] }));
        expect(await screen.findByText("Informasi tambahan tersimpan.")).toBeTruthy();
    });

    it("404 → tidak ditemukan (SDD-AUTH-08); tiket ditutup tanpa form tambah informasi", async () => {
        server({ detail: gagal(404, "NOT_FOUND", "x") });
        await renderAplikasi("/kerusakan/7");
        expect(await screen.findByText("Laporan tidak ditemukan")).toBeTruthy();
        server({ detail: sukses({ ...DETAIL, status: "SELESAI" }) });
        await renderAplikasi("/kerusakan/7");
        expect((await screen.findAllByRole("heading", { name: /Laporan KRS-2027-0007/ })).length).toBeGreaterThan(0);
        expect(screen.queryByRole("button", { name: "Tambahkan informasi" })).toBeNull();
    });
});

describe("Sambungan dari P-31 dan P-18", () => {
    it("P-31 berpenggunaan 'Perlu Perhatian' menautkan P-40 terisi ruangan + reservasi", async () => {
        const RESV: ReservationDetail = {
            id: "123", nomor: "RSV-RG-2027-0123", jenis: "RUANGAN", status: "SELESAI", ruangan: { id: "10", nama: "Aula", gedung: "Gedung A" }, pemohon: { id: "1", nama: "Admin Uji" },
            nama_kegiatan: "Seminar", jenis_kegiatan: "Seminar", jumlah_peserta: 40, keperluan: null, kebutuhan_tambahan: null, keterangan: null,
            waktu_mulai: "2027-11-07T01:00:00.000Z", waktu_selesai: "2027-11-07T03:00:00.000Z", diajukan_pada: "2027-11-01T01:00:00.000Z", induk: null, tanggal: [],
            penggunaan: { kondisi_ruangan: "PERLU_PERHATIAN", catatan: "Kursi patah", dicatat_oleh: "Admin Uji", dicatat_pada: "2027-11-07T04:00:00.000Z" },
            approval_instance_id: null, aksi: { batalkan: false, ubah_jadwal: false, ajukan_ulang: false, catat_penggunaan: { kondisi: false, tidak_digunakan: false } }, riwayat: [],
        };
        pasangServer((p) => (p.url === "/me" ? sukses(ME) : p.url === "/reservations/123" ? sukses(RESV) : { status: 404 }));
        await renderAplikasi("/reservasi/123");
        expect((await screen.findByRole("link", { name: "Laporkan kerusakan ruangan" })).getAttribute("href")).toBe("/kerusakan/baru?ruang=10&reservasi=123");
    });
});
