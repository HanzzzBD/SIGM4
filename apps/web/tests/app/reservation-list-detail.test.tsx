// P-30 Daftar Reservasi & P-31 Detail Reservasi (FR-07.3, FR-07.4, FR-10.3, UX §7.2–§7.4; PR-03-27,
// keputusan 17 log phase-03) — aplikasi utuh lewat router, gerbang sesi, dan klien HTTP produksi;
// server tiruan pada adapter axios. Id ber-dua-digit lebih dipakai sengaja (regex route, #143).

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReservationDetail, ReservationListItem, RoomAvailability } from "@sigm4/schemas";
import { describe, expect, it } from "vitest";
import { isianDariReservasi } from "../../src/modules/m07-reservation-room/pengajuan";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "reservation.view": "all", "reservation.create": "all", "reservation.cancel_own": "all" } };

const BARIS: ReservationListItem = {
    id: "123",
    nomor: "RSV-RG-2027-0123",
    jenis: "RUANGAN",
    status: "MENUNGGU_PERSETUJUAN",
    nama_kegiatan: "Rapat Komite",
    ruangan: { id: "10", nama: "Aula Utama" },
    pemohon: { id: "1", nama: "Admin Uji" },
    waktu_mulai: "2027-03-02T03:00:00.000Z",
    waktu_selesai: "2027-03-02T04:00:00.000Z",
    diajukan_pada: "2027-02-27T02:00:00.000Z",
    jumlah_tanggal: 0,
};

const DETAIL: ReservationDetail = {
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
    aksi: { batalkan: true, ubah_jadwal: false, ajukan_ulang: false, catat_penggunaan: { kondisi: false, tidak_digunakan: false } },
    riwayat: [
        { waktu: "2027-02-27T02:00:00.000Z", aksi: "RESERVATION_CREATED", pelaku: "Pak Budi", nomor: "RSV-RG-2027-0123", status: "MENUNGGU_PERSETUJUAN", keterangan: null },
        { waktu: "2027-02-27T05:00:00.000Z", aksi: "RESERVATION_UPDATED", pelaku: null, nomor: "RSV-RG-2027-0123", status: "BERLANGSUNG", keterangan: "Waktu mulai tiba (FR-07.4 langkah 1) (pekerjaan terjadwal: slot-activation)" },
    ],
};

const RIWAYAT_APPROVAL = {
    instance_id: 45,
    jenis_pengajuan: "RESERVASI_RUANGAN",
    referensi_id: 123,
    status: "MENUNGGU",
    pemohon: { id: 7, nama: "Pak Budi" },
    aturan: { rule_id: 1, versi: 1 },
    langkah_aktif: 1,
    dibuat_pada: "2027-02-27T02:00:00.000Z",
    diselesaikan_pada: null,
    ditolak_otomatis: false,
    langkah: [
        {
            urutan: 1,
            status: "AKTIF",
            approver: { tipe: "role", role: { id: 2, nama: "Petugas Sarana Prasarana" }, user: null },
            fallback: false,
            catatan: null,
            diputuskan_oleh: null,
            atas_nama: null,
            diputuskan_pada: null,
            alasan_dilewati: null,
            eskalasi: null,
            eskalasi_habis_pada: null,
            sla: { deadline: "2027-02-28T02:00:00.000Z", sisa_menit_kerja: 360, terlambat: false },
            durasi_menit_kerja: null,
        },
    ],
};

interface Opsi {
    readonly me?: unknown;
    readonly daftar?: (p: Permintaan) => Jawaban;
    readonly detail?: ReservationDetail | (() => Jawaban);
    readonly riwayat?: Jawaban;
    readonly batal?: (p: Permintaan) => Jawaban;
    readonly catat?: (p: Permintaan) => Jawaban;
}

function server(o: Opsi = {}) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(o.me ?? ME);
        if (p.url === "/reservations" && p.method === "GET") return o.daftar?.(p) ?? { status: 200, data: { success: true, data: [BARIS], meta: { page: 1, per_page: 25, total: 1, total_pages: 1 } } };
        if (p.url === "/reservations/123") return typeof o.detail === "function" ? o.detail() : sukses(o.detail ?? DETAIL);
        if (p.url === "/reservations/123/cancel") return o.batal?.(p) ?? sukses({ id: "123", nomor: DETAIL.nomor, status: "DIBATALKAN", dibatalkan: [{ id: "123", nomor: DETAIL.nomor }] });
        if (p.url === "/reservations/123/usage") return o.catat?.(p) ?? sukses({ id: "123", nomor: DETAIL.nomor, status: "SELESAI", kondisi_ruangan: "BAIK", catatan: null });
        if (p.url === "/approvals/45/history") return o.riwayat ?? sukses(RIWAYAT_APPROVAL);
        if (p.url === "/rooms/availability") return sukses(KALENDER);
        return { status: 404 };
    });
}

const KALENDER: RoomAvailability = {
    dari: "2027-03-01T17:00:00.000Z",
    sampai: "2027-03-02T17:00:00.000Z",
    zona_waktu: "Asia/Jakarta",
    granularitas_menit: 30,
    jam_operasional: { hari: [1, 2, 3, 4, 5, 6], mulai: "06:00", selesai: "18:00" },
    hari_libur: [],
    ruangan: [{ id: "10", kode: "R-10", nama: "Aula Utama", jenis: "AULA", kapasitas: 200, gedung: { id: "1", nama: "Gedung A" } }],
    slot: [{ ruangan_id: "10", mulai: "2027-03-02T03:00:00.000Z", selesai: "2027-03-02T04:00:00.000Z", keadaan: "MENUNGGU_PERSETUJUAN", label: "Rapat Komite", reservasi: { id: "123", nomor: "RSV-RG-2027-0123", pemohon: "Pak Budi" } }],
};

describe("P-30 Daftar Reservasi", () => {
    it("tabel berstatus Badge, nomor bertaut ke P-31; saringan & kata kunci dikirim sebagai query (URL); tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container, router } = await renderAplikasi("/reservasi");
        expect(await screen.findByRole("heading", { name: "Daftar Reservasi" })).toBeTruthy();
        const tabel = await screen.findByRole("table");
        expect(within(tabel).getByRole("link", { name: "RSV-RG-2027-0123" }).getAttribute("href")).toBe("/reservasi/123");
        expect(within(tabel).getByText("Menunggu Persetujuan")).toBeTruthy();
        expect(screen.getByText("Menampilkan 1–1 dari 1")).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);

        await user.selectOptions(screen.getByLabelText(/^Status/), "DITOLAK");
        await waitFor(() => expect(router.state.location.search).toMatchObject({ status: "DITOLAK" }));
        await user.click(screen.getByRole("checkbox", { name: "Hanya pengajuan saya" }));
        await user.type(screen.getByLabelText("Cari nomor pengajuan atau nama kegiatan"), "komite");
        await user.click(screen.getByRole("button", { name: "Cari" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/reservations").at(-1)?.params).toMatchObject({ status: "DITOLAK", pemohon: "saya", q: "komite", page: 1, per_page: 25 }));
    });

    it("hasil kosong karena saringan → keadaan kosong dengan aksi Hapus saringan", async () => {
        server({ daftar: () => ({ status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 25, total: 0, total_pages: 0 } } }) });
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/reservasi?status=DITOLAK");
        // C-15: keadaan kosong DI DALAM badan tabel (kartu mobile memuat salinannya sendiri).
        expect(within(await screen.findByRole("table")).getByText("Tidak ada reservasi yang cocok")).toBeTruthy();
        await user.click(within(screen.getByRole("table")).getByRole("button", { name: "Hapus saringan" }));
        await waitFor(() => expect(router.state.location.search).toEqual({}));
    });

    it("tanpa reservation.view → halaman tanpa akses", async () => {
        server({ me: ME_ADMIN });
        const { router } = await renderAplikasi("/reservasi");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-30 — tabel C-15", () => {
    const halaman = (n: number, total = 120): Opsi["daftar"] => () => ({ status: 200, data: { success: true, data: [BARIS], meta: { page: n, per_page: 25, total, total_pages: Math.ceil(total / 25) } } });

    it("urut lewat kepala kolom (ikon + aria-sort), klik baris membuka detail, kepala melekat", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/reservasi");
        const tabel = await screen.findByRole("table");
        // Selalu dari tabel yang sedang tampil — tabel dirender ulang setelah kueri berganti.
        const kepala = (nama: string) => within(screen.getByRole("table")).getByRole("columnheader", { name: new RegExp(`^${nama}`) });
        expect(kepala("Diajukan").getAttribute("aria-sort")).toBe("descending");
        expect(kepala("Jadwal").getAttribute("aria-sort")).toBe("none");
        await user.click(within(kepala("Jadwal")).getByRole("button"));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ urut: "mulai" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/reservations").at(-1)?.params).toMatchObject({ urut: "mulai" }));
        await waitFor(() => expect(kepala("Jadwal").getAttribute("aria-sort")).toBe("descending"));
        expect(kepala("Diajukan").getAttribute("aria-sort")).toBe("none");
        expect(kepala("Nomor").className).toContain("sticky");
        expect(tabel.parentElement?.className).not.toMatch(/rounded/);

        await user.click(within(screen.getByRole("table")).getByText("Rapat Komite"));
        await waitFor(() => expect(router.state.location.pathname).toBe("/reservasi/123"));
    });

    it("halaman bernomor + ukuran halaman di URL (25 bawaan, 50/100 tercatat)", async () => {
        const log = server({ daftar: halaman(3) });
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/reservasi?page=3");
        const nav = await screen.findByRole("navigation", { name: "Halaman daftar reservasi" });
        expect(within(nav).getByRole("button", { name: "Halaman 3" }).getAttribute("aria-current")).toBe("page");
        expect(within(nav).getAllByRole("button", { name: /^Halaman \d+$/ }).map((b) => b.textContent)).toEqual(["1", "2", "3", "4", "5"]);
        await user.selectOptions(within(nav).getByLabelText(/^Baris per halaman/), "50");
        await waitFor(() => expect(router.state.location.search).toEqual({ per: 50 }));
        await waitFor(() => expect(log.filter((p) => p.url === "/reservations").at(-1)?.params).toMatchObject({ page: 1, per_page: 50 }));
    });
});

describe("regresi regex route (kelas bug #143) — id tiga digit & tanggal", () => {
    it("P-30: `dari`/`sampai` YYYY-MM-DD dan `page` dari URL sampai ke API; bentuk lain dibuang", async () => {
        const log = server();
        await renderAplikasi("/reservasi?dari=2027-03-01&sampai=2027-03-31&page=3&per=100");
        await waitFor(() => expect(log.filter((p) => p.url === "/reservations").at(-1)?.params).toMatchObject({ dari: "2027-03-01", sampai: "2027-03-31", page: 3, per_page: 100 }));
        const salah = server();
        await renderAplikasi("/reservasi?dari=2027-3-1&sampai=31-03-2027");
        await waitFor(() => expect(salah.some((p) => p.url === "/reservations")).toBe(true));
        const p = salah.filter((x) => x.url === "/reservations").at(-1)?.params ?? {};
        expect([p["dari"], p["sampai"]]).toEqual([undefined, undefined]);
    });

    it("P-31: `/reservasi/123` terbuka; `0123` dan `12a` dialihkan ke Tidak Ditemukan", async () => {
        server();
        const ok = await renderAplikasi("/reservasi/123");
        expect(await screen.findByRole("heading", { name: "RSV-RG-2027-0123", level: 1 })).toBeTruthy();
        expect(ok.router.state.location.pathname).toBe("/reservasi/123");
        ok.unmount();
        for (const salah of ["/reservasi/0123", "/reservasi/12a"]) {
            const { router, unmount } = await renderAplikasi(salah);
            await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-ditemukan"));
            unmount();
        }
    });

    it("P-29: `?dari=123` mengisi wizard dari reservasi itu; `?dari=12a` diabaikan tanpa memanggil API", async () => {
        const log = server();
        const { router, unmount } = await renderAplikasi("/reservasi/baru?dari=123");
        await waitFor(() => expect((screen.getByLabelText(/^Ruangan/) as HTMLSelectElement).value).toBe("10"));
        expect(router.state.location.search).toEqual({ dari: "123" });
        expect(log.some((p) => p.url === "/reservations/123")).toBe(true);
        unmount();
        const abai = server();
        const lain = await renderAplikasi("/reservasi/baru?dari=12a");
        expect(await screen.findByRole("heading", { name: "Ajukan Reservasi Ruangan" })).toBeTruthy();
        expect(lain.router.state.location.search).toEqual({});
        expect(abai.some((p) => p.url.startsWith("/reservations/"))).toBe(false);
    });
});

describe("P-31 Detail Reservasi", () => {
    it("rincian, linimasa C-27, dan riwayat (Sistem untuk pelaku SYSTEM); tanpa pelanggaran axe", async () => {
        server();
        const { container } = await renderAplikasi("/reservasi/123");
        expect(await screen.findByRole("heading", { name: "RSV-RG-2027-0123", level: 1 })).toBeTruthy();
        expect(screen.getByText("Aula Utama · Gedung A")).toBeTruthy();
        expect(screen.getByText("Koordinasi semester")).toBeTruthy();
        expect(await screen.findByText("Langkah 1 — Menunggu")).toBeTruthy();
        expect(screen.getByText("Sisa SLA 6 jam kerja")).toBeTruthy();
        const riwayat = screen.getByRole("heading", { name: "Riwayat perubahan" }).parentElement!;
        expect(within(riwayat).getByText(/Sistem ·/)).toBeTruthy();
        expect(within(riwayat).getByText("Waktu mulai tiba (FR-07.4 langkah 1) (pekerjaan terjadwal: slot-activation)")).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("linimasa di luar hak lihat (403) tidak ditampilkan sama sekali; tombol hanya mengikuti `aksi` server", async () => {
        server({ riwayat: gagal(403, "FORBIDDEN", "Akses ditolak."), detail: { ...DETAIL, aksi: { ...DETAIL.aksi, batalkan: false } } });
        await renderAplikasi("/reservasi/123");
        expect(await screen.findByRole("heading", { name: "Riwayat perubahan" })).toBeTruthy();
        await waitFor(() => expect(screen.queryByText("Memuat linimasa persetujuan")).toBeNull());
        expect(screen.queryByRole("heading", { name: "Linimasa persetujuan" })).toBeNull();
        // Bukan gangguan: tak ada keadaan galat yang menggantikan bagian itu.
        expect(screen.queryByText("Data tidak dapat dimuat")).toBeNull();
        expect(screen.queryByRole("button", { name: "Batalkan" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Ubah jadwal" })).toBeNull();
    });

    it("tak ada / di luar scope (404) → satu pesan yang tak membedakan keduanya (SDD-AUTH-08)", async () => {
        server({ detail: () => gagal(404, "NOT_FOUND", "Reservasi tidak ditemukan.") });
        await renderAplikasi("/reservasi/123");
        expect(await screen.findByText("Reservasi ini tidak ada atau tidak dapat Anda lihat.")).toBeTruthy();
    });

    it("UX §7.2: Batalkan = dialog berkonsekuensi, alasan wajib sebelum tombol aktif; pemohon pihak lain disebut akan dinotifikasi", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/reservasi/123");
        await user.click(await screen.findByRole("button", { name: "Batalkan" }));
        const dialog = await screen.findByRole("dialog", { name: "Batalkan reservasi RSV-RG-2027-0123?" });
        expect(within(dialog).getByText(/Pak Budi \(pemohon\) dinotifikasi beserta alasan ini/)).toBeTruthy();
        const tombol = within(dialog).getByRole("button", { name: "Batalkan reservasi" }) as HTMLButtonElement;
        expect(tombol.disabled).toBe(true);
        await user.type(within(dialog).getByLabelText(/^Alasan pembatalan/), "Aula dipakai rapat dinas.");
        await user.click(tombol);
        await waitFor(() => expect(log.find((p) => p.url === "/reservations/123/cancel")?.data).toEqual({ alasan: "Aula dipakai rapat dinas." }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        // Detail dimuat ulang sesudahnya (aksi & riwayat berubah).
        expect(log.filter((p) => p.url === "/reservations/123").length).toBeGreaterThanOrEqual(2);
    });

    it("BR-024: Ubah jadwal = batalkan beralasan lalu wizard P-29 terisi data reservasi ini", async () => {
        const log = server({ detail: { ...DETAIL, pemohon: { id: "1", nama: "Admin Uji" }, aksi: { ...DETAIL.aksi, ubah_jadwal: true } } });
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/reservasi/123");
        await user.click(await screen.findByRole("button", { name: "Ubah jadwal" }));
        const dialog = await screen.findByRole("dialog", { name: "Ubah jadwal RSV-RG-2027-0123?" });
        await user.type(within(dialog).getByLabelText(/^Alasan pembatalan/), "Pindah hari.");
        await user.click(within(dialog).getByRole("button", { name: "Batalkan & ajukan jadwal baru" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/reservasi/baru"));
        expect(router.state.location.search).toMatchObject({ dari: "123" });
        expect(log.some((p) => p.url === "/reservations/123/cancel")).toBe(true);
        expect(await screen.findByRole("heading", { name: "Ajukan Reservasi Ruangan" })).toBeTruthy();
    });

    it("FR-07.4: pencatatan penggunaan hanya opsi yang diizinkan server, lalu terkirim", async () => {
        const log = server({ detail: { ...DETAIL, status: "BERLANGSUNG", aksi: { ...DETAIL.aksi, batalkan: false, catat_penggunaan: { kondisi: false, tidak_digunakan: true } } } });
        const user = userEvent.setup();
        await renderAplikasi("/reservasi/123");
        const pilihan = (await screen.findByLabelText(/^Hasil penggunaan/)) as HTMLSelectElement;
        expect([...pilihan.options].map((o) => o.value)).toEqual(["", "TIDAK_DIGUNAKAN"]);
        await user.selectOptions(pilihan, "TIDAK_DIGUNAKAN");
        await user.type(screen.getByLabelText("Catatan (tidak wajib)"), "Pemohon tidak hadir.");
        await user.click(screen.getByRole("button", { name: "Simpan pencatatan" }));
        await waitFor(() => expect(log.find((p) => p.url === "/reservations/123/usage")?.data).toEqual({ hasil: "TIDAK_DIGUNAKAN", catatan: "Pemohon tidak hadir." }));
    });
});

describe("tautan ke P-31", () => {
    it("UX §7.6.1: slot terisi yang berincian di kalender bertaut ke Detail Reservasi", async () => {
        server();
        const { router } = await renderAplikasi("/kalender-ruangan?tanggal=2027-03-02");
        fireEvent.mouseDown(await screen.findByRole("gridcell", { name: /Aula Utama, 10\.00–10\.30 WIB, Menunggu Persetujuan/ }));
        fireEvent.click(await screen.findByRole("link", { name: "Lihat detail RSV-RG-2027-0123" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/reservasi/123"));
    });

    it("isian wizard dari reservasi: ruangan, jadwal WIB, dan rincian kegiatan", () => {
        expect(isianDariReservasi(DETAIL)).toMatchObject({ ruangan: "10", tanggal: "2027-03-02", mulai: "10:00", selesai: "11:00", nama_kegiatan: "Rapat Komite", jenis_kegiatan: "Rapat", jumlah_peserta: "25", keperluan: "Koordinasi semester", berulang: false });
    });
});
