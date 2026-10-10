// P-37 Persetujuan Saya & P-38 Detail Keputusan (FR-10.2, FR-10.3, UX §7.6.4, F-07/F-08; PR-02-44,
// keputusan 92 log phase-02) — aplikasi utuh lewat router, gerbang sesi, dan klien HTTP produksi.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReservationDetail } from "@sigm4/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { durasiKerja } from "../../src/modules/m10-approval/linimasa";
import { teksSisaSla } from "../../src/modules/m10-approval/persetujuan";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "approval.decide": "all", "approval.view": "all", "reservation.view": "all" } };

const ITEM = {
    instance_id: 45,
    jenis_pengajuan: "RESERVASI_RUANGAN",
    referensi_id: 123,
    pemohon: { id: 7, nama: "Pak Budi" },
    urutan: 2,
    sla_deadline: "2027-02-28T05:00:00.000Z",
    sla: { sisa_menit_kerja: 190, terlambat: false },
    created_at: "2027-02-27T02:00:00.000Z",
    atas_nama_user_id: null,
};

const LANGKAH = {
    approver: { tipe: "role", role: { id: 2, nama: "Petugas Sarana Prasarana" }, user: null },
    fallback: false,
    catatan: null,
    diputuskan_oleh: null,
    atas_nama: null,
    diputuskan_pada: null,
    alasan_dilewati: null,
    eskalasi: null,
    eskalasi_habis_pada: null,
    sla: null,
    durasi_menit_kerja: null,
};

const RIWAYAT = {
    instance_id: 45,
    jenis_pengajuan: "RESERVASI_RUANGAN",
    referensi_id: 123,
    status: "MENUNGGU",
    pemohon: { id: 7, nama: "Pak Budi" },
    aturan: { rule_id: 1, versi: 1 },
    langkah_aktif: 2,
    dibuat_pada: "2027-02-27T02:00:00.000Z",
    diselesaikan_pada: null,
    ditolak_otomatis: false,
    langkah: [
        { ...LANGKAH, urutan: 1, status: "DILEWATI", alasan_dilewati: "Dilewati — konflik kepentingan", durasi_menit_kerja: 0 },
        { ...LANGKAH, urutan: 2, status: "AKTIF", sla: { deadline: "2027-02-28T05:00:00.000Z", sisa_menit_kerja: 190, terlambat: false } },
    ],
};

const RESERVASI = {
    id: "123",
    nomor: "RSV-RG-2027-0123",
    jenis: "RUANGAN",
    status: "MENUNGGU_PERSETUJUAN",
    ruangan: { id: "10", nama: "Aula Utama", gedung: "Gedung A" },
    pemohon: { id: "7", nama: "Pak Budi" },
    nama_kegiatan: "Rapat Komite",
    jenis_kegiatan: "Rapat",
    jumlah_peserta: 25,
    keperluan: "Koordinasi semester",
    kebutuhan_tambahan: null,
    keterangan: null,
    waktu_mulai: "2027-03-02T03:00:00.000Z",
    waktu_selesai: "2027-03-02T04:00:00.000Z",
    diajukan_pada: "2027-02-27T02:00:00.000Z",
    induk: null,
    tanggal: [],
    penggunaan: null,
    approval_instance_id: 45,
    aksi: { batalkan: false, ubah_jadwal: false, ajukan_ulang: false, catat_penggunaan: { kondisi: false, tidak_digunakan: false } },
    riwayat: [],
} satisfies ReservationDetail;

const kotak = (data: unknown[]): Jawaban => ({ status: 200, data: { success: true, data, meta: { page: 1, per_page: 25, total: data.length, total_pages: 1 } } });

function server(o: { me?: unknown; pending?: unknown[]; riwayat?: Jawaban; decide?: (p: Permintaan) => Jawaban } = {}) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(o.me ?? ME);
        if (p.url === "/approvals/pending") return kotak(o.pending ?? [ITEM]);
        if (p.url === "/approvals/45/history") return o.riwayat ?? sukses(RIWAYAT);
        if (p.url === "/approvals/45/decide") return o.decide?.(p) ?? sukses({ instance_id: 45, urutan: 2, keputusan: (p.data as { keputusan: string }).keputusan, status: "DISETUJUI", langkah_aktif: null, atas_nama_user_id: null });
        if (p.url === "/reservations/123") return sukses(RESERVASI);
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 25, total: 0, total_pages: 1, unread_count: 0 } } };
        return { status: 404 };
    });
}

beforeEach(() => vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: () => "kunci-uji" }));
afterEach(() => vi.unstubAllGlobals());

describe("format jam kerja (CAL-01)", () => {
    it("sisa SLA & durasi dalam jam kerja; terlambat eksplisit", () => {
        expect(teksSisaSla({ sisa_menit_kerja: 190, terlambat: false })).toBe("Sisa 3 jam kerja");
        expect(teksSisaSla({ sisa_menit_kerja: 45, terlambat: false })).toBe("Sisa 45 menit kerja");
        expect(teksSisaSla({ sisa_menit_kerja: 0, terlambat: true })).toBe("Melewati SLA");
        expect(durasiKerja(120)).toBe("2 jam kerja");
        expect(durasiKerja(135)).toBe("2 jam 15 menit kerja");
        expect(durasiKerja(20)).toBe("20 menit kerja");
    });
});

describe("P-37 Persetujuan Saya", () => {
    it("kotak masuk berurgensi sisa SLA jam kerja, terlambat ditandai, delegasi disebut; tanpa pelanggaran axe", async () => {
        server({ pending: [{ ...ITEM, instance_id: 46, sla: { sisa_menit_kerja: 0, terlambat: true }, atas_nama_user_id: 9 }, ITEM] });
        const { container } = await renderAplikasi("/persetujuan");
        const tabel = await screen.findByRole("table");
        const baris = within(tabel).getAllByRole("row").slice(1);
        expect(within(baris[0]!).getByText("Melewati SLA")).toBeTruthy();
        expect(within(baris[0]!).getByText(/sebagai pengganti \(delegasi\)/)).toBeTruthy();
        expect(within(baris[1]!).getByRole("link", { name: "Reservasi Ruangan #123" }).getAttribute("href")).toBe("/persetujuan/45");
        expect(within(baris[1]!).getByText("Sisa 3 jam kerja")).toBeTruthy();
        expect(within(baris[1]!).getByText("Pak Budi")).toBeTruthy();
        expect(within(baris[1]!).getByText(/WIB$/)).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("kosong → keadaan kosong berpenjelasan", async () => {
        server({ pending: [] });
        await renderAplikasi("/persetujuan");
        expect(await screen.findByText("Tidak ada pengajuan yang menunggu")).toBeTruthy();
    });

    it("tanpa approval.decide → P-08 untuk P-37 & P-38, entri sidebar tidak dirender (PM-04)", async () => {
        server({ me: ME_ADMIN });
        const { router } = await renderAplikasi("/persetujuan");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
        expect(screen.queryByRole("link", { name: "Persetujuan Saya" })).toBeNull();
        await router.navigate({ to: "/persetujuan/$id", params: { id: "45" } });
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-38 Detail Keputusan", () => {
    it("konteks reservasi, linimasa dengan langkah dilewati + durasi kerja + sisa SLA; tanpa pelanggaran axe", async () => {
        server();
        const { container } = await renderAplikasi("/persetujuan/45");
        expect(await screen.findByRole("heading", { name: "Reservasi Ruangan #123", level: 1 })).toBeTruthy();
        expect(await screen.findByText("Aula Utama · Gedung A")).toBeTruthy();
        expect(screen.getByText("Koordinasi semester")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Buka detail reservasi RSV-RG-2027-0123" }).getAttribute("href")).toBe("/reservasi/123");
        const linimasa = await screen.findByRole("region", { name: "Linimasa persetujuan" });
        expect(within(linimasa).getByText("Langkah 1 — Dilewati")).toBeTruthy();
        expect(within(linimasa).getByText("Dilewati — konflik kepentingan")).toBeTruthy();
        expect(within(linimasa).getByText("Durasi 0 menit kerja")).toBeTruthy();
        expect(within(linimasa).getByText("Sisa SLA 3 jam kerja")).toBeTruthy();
        expect(screen.getByText(/Riwayat pemohon & ketersediaan objek/)).toBeTruthy();
        // Setujui Sebagian hanya untuk Pengadaan & Penghapusan (UX §7.6.4) — tidak ada, bukan nonaktif.
        expect(await screen.findByRole("button", { name: "Setujui" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Sebagian/ })).toBeNull();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("eskalasi habis → 'Menunggu tindakan manual' eksplisit (BR-039a, F-08)", async () => {
        const habis = { ...RIWAYAT, langkah: [RIWAYAT.langkah[0], { ...RIWAYAT.langkah[1], eskalasi_habis_pada: "2027-02-28T05:00:00.000Z" }] };
        server({ riwayat: sukses(habis) });
        await renderAplikasi("/persetujuan/45");
        expect(await screen.findByText(/^Menunggu tindakan manual sejak .*WIB$/)).toBeTruthy();
    });

    it("Tolak: alasan wajib sebelum terkirim; POST membawa urutan langkah + Idempotency-Key; kembali ke P-37 dengan umpan balik", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/persetujuan/45");
        await user.click(await screen.findByRole("button", { name: "Tolak" }));
        const dialog = await screen.findByRole("dialog", { name: "Tolak pengajuan ini?" });
        const kirim = within(dialog).getByRole("button", { name: "Tolak" });
        expect(kirim.hasAttribute("disabled")).toBe(true);
        await user.type(within(dialog).getByLabelText(/Alasan penolakan/), "Ruangan dipakai ujian");
        await user.click(kirim);
        await waitFor(() => expect(router.state.location.pathname).toBe("/persetujuan"));
        const post = log.find((p) => p.method === "POST" && p.url === "/approvals/45/decide");
        expect(post?.data).toEqual({ urutan: 2, keputusan: "DITOLAK", catatan: "Ruangan dipakai ujian" });
        expect(post?.headers["Idempotency-Key"]).toBe("kunci-uji");
        expect(await screen.findByText("Keputusan atas Reservasi Ruangan #123 tersimpan.")).toBeTruthy();
    });

    it("Setujui tanpa catatan → catatan null; Perlu Revisi menuntut catatan", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/persetujuan/45");
        await user.click(await screen.findByRole("button", { name: "Perlu Revisi" }));
        const revisi = await screen.findByRole("dialog", { name: "Minta revisi?" });
        expect(within(revisi).getByRole("button", { name: "Perlu Revisi" }).hasAttribute("disabled")).toBe(true);
        await user.click(within(revisi).getByRole("button", { name: "Batal" }));
        await user.click(screen.getByRole("button", { name: "Setujui" }));
        const setuju = await screen.findByRole("dialog", { name: "Setujui pengajuan ini?" });
        await user.click(within(setuju).getByRole("button", { name: "Setujui" }));
        await waitFor(() => expect(log.find((p) => p.method === "POST")?.data).toEqual({ urutan: 2, keputusan: "DISETUJUI", catatan: null }));
    });

    it("409 APPROVAL_ALREADY_DECIDED → SIAPA dan KAPAN ditampilkan, tombol keputusan hilang (RE-09)", async () => {
        server({
            decide: () => ({
                status: 409,
                data: { success: false, error: { code: "APPROVAL_ALREADY_DECIDED", message: "Langkah persetujuan ini sudah diputuskan atau tidak lagi aktif.", details: [{ field: "diputuskan_oleh", message: "Approver Satu" }, { field: "diputuskan_pada", message: "2027-02-28T03:00:00.000Z" }] }, request_id: "r-1" },
            }),
        });
        const user = userEvent.setup();
        await renderAplikasi("/persetujuan/45");
        await user.click(await screen.findByRole("button", { name: "Setujui" }));
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Setujui" }));
        const peringatan = await screen.findByRole("alert");
        expect(peringatan.textContent).toMatch(/Diputuskan oleh Approver Satu pada .*WIB/);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByRole("button", { name: "Setujui" })).toBeNull();
    });

    it("objek tak lagi tersedia (BR-043) → penyebab dari server tampil di dialog, bukan galat generik", async () => {
        server({ decide: () => gagal(409, "SLOT_CONFLICT", "Ruangan tidak lagi tersedia pada jadwal ini.") });
        const user = userEvent.setup();
        await renderAplikasi("/persetujuan/45");
        await user.click(await screen.findByRole("button", { name: "Setujui" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Setujui" }));
        expect(await within(dialog).findByText("Ruangan tidak lagi tersedia pada jadwal ini.")).toBeTruthy();
    });

    it("bukan di kotak masuk pemanggil → keterangan, tanpa tombol keputusan", async () => {
        server({ pending: [] });
        await renderAplikasi("/persetujuan/45");
        expect(await screen.findByText(/bukan wewenang Anda saat ini/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Setujui" })).toBeNull();
    });

    it("deep link notifikasi ke pengajuan yang sudah tak ada (404) → P-09 (FR-17.1 A1, UX F-23)", async () => {
        server({ riwayat: gagal(404, "NOT_FOUND", "Tidak ditemukan.") });
        const { router } = await renderAplikasi("/persetujuan/45");
        await waitFor(() => expect(router.state.location.pathname).toBe("/data-tidak-tersedia"));
        expect(await screen.findByText("Data tidak lagi tersedia")).toBeTruthy();
    });

    it("id cacat → Tidak Ditemukan (regex route)", async () => {
        server();
        const { router } = await renderAplikasi("/persetujuan/4a");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-ditemukan"));
    });
});
