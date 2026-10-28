// Panel "Kelola Jadwal Tetap & Blokade" — aksi sekunder P-27 (FR-07.5, alur F-11; PR-03-13, keputusan
// 19 log phase-03): aplikasi utuh lewat router, gerbang sesi, dan klien HTTP produksi; server tiruan.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RoomAvailability, RoomBlockList, RoomBlockPreview } from "@sigm4/schemas";
import { describe, expect, it } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

// Kotak centang Radix DI DALAM <form> merender input gelembung ber-ResizeObserver, yang tak ada di jsdom.
globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
};

const KALENDER: RoomAvailability = {
    dari: "2027-09-05T17:00:00.000Z",
    sampai: "2027-09-06T17:00:00.000Z",
    zona_waktu: "Asia/Jakarta",
    granularitas_menit: 30,
    jam_operasional: { hari: [1, 2, 3, 4, 5], mulai: "06:00", selesai: "18:00" },
    hari_libur: [],
    ruangan: [{ id: "10", kode: "R-10", nama: "Kelas XI-A", jenis: "KELAS", kapasitas: 36, gedung: { id: "1", nama: "Gedung A" } }],
    slot: [],
};
const DAFTAR: RoomBlockList = {
    jadwal_tetap: [{ id: "123", hari: 1, jam_mulai: "07:00", jam_selesai: "09:00", berlaku_mulai: "2027-09-06", berlaku_sampai: "2027-12-17", label_kegiatan: "KBM Kelas XI-A", status: "AKTIF" }],
    blokade_manual: [],
};
const PRATINJAU: RoomBlockPreview = {
    kemunculan: [{ mulai: "2027-09-13T00:00:00.000Z", selesai: "2027-09-13T02:00:00.000Z" }],
    dilewati: [{ tanggal: "2027-09-20", alasan: "Hari libur: Libur Uji." }],
    bentrok_reservasi: [],
    bentrok_lain: [],
};
const BENTROK = { reservation_id: "77", nomor: "RSV-RG-2027-0077", status: "DISETUJUI", pemohon: "Pak Budi", nama_kegiatan: "Rapat Komite", mulai: "2027-09-15T03:00:00.000Z", selesai: "2027-09-15T04:00:00.000Z" };

const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "reservation.view": "all", "reservation.fixed_schedule": "all" } };

function server(o: { me?: unknown; pratinjau?: (p: Permintaan) => Jawaban; buat?: (p: Permintaan) => Jawaban } = {}) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(o.me ?? ME);
        if (p.url === "/rooms/availability") return sukses(KALENDER);
        if (p.url === "/rooms/10/blocks" && p.method === "GET") return sukses(DAFTAR);
        if (p.url === "/rooms/10/blocks/preview") return o.pratinjau?.(p) ?? sukses(PRATINJAU);
        if (p.url === "/rooms/10/blocks") return o.buat?.(p) ?? { status: 201, data: { success: true, data: { jenis: "JADWAL_TETAP", ids: ["124"], slot_dibuat: 14, reservasi_dibatalkan: [] }, meta: null } };
        if (p.url === "/room-fixed-schedules/123/status") return sukses({ id: "123", status: "NONAKTIF", slot_dilepas: 9 });
        return { status: 404 };
    });
}

async function isiJadwalTetap(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/^Label kegiatan/), "KBM Kelas XI-B");
    await user.click(screen.getByRole("checkbox", { name: "Senin" }));
    await user.type(screen.getByLabelText(/^Berlaku mulai/), "2027-09-06");
    await user.type(screen.getByLabelText(/^Berlaku sampai/), "2027-12-17");
    await user.click(screen.getByRole("button", { name: "Periksa blokade" }));
}

describe("Kelola Jadwal Tetap & Blokade (aksi sekunder P-27)", () => {
    it("hanya pemegang reservation.fixed_schedule yang melihat aksinya; ?kelola tanpa izin tak membuka panel", async () => {
        server({ me: { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "reservation.view": "all" } } });
        await renderAplikasi("/kalender-ruangan?tanggal=2027-09-06&kelola=true&ruang=10");
        expect(await screen.findByRole("grid")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Kelola Jadwal Tetap & Blokade" })).toBeNull();
        expect(screen.queryByRole("heading", { name: "Kelola Jadwal Tetap & Blokade" })).toBeNull();
    });

    it("membuka panel lewat URL, mendaftar aturan, memeriksa (libur dilewati) lalu menyimpan tanpa pembatalan; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container, router } = await renderAplikasi("/kalender-ruangan?tanggal=2027-09-06");
        await user.click(await screen.findByRole("button", { name: "Kelola Jadwal Tetap & Blokade" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ kelola: true }));
        await user.selectOptions(await screen.findByLabelText(/^Ruangan/), "10");
        await waitFor(() => expect(router.state.location.search).toMatchObject({ kelola: true, ruang: "10" }));
        expect(await screen.findByText("KBM Kelas XI-A")).toBeTruthy();
        expect(screen.getByText(/setiap Senin 07\.00–09\.00 WIB/)).toBeTruthy();

        await isiJadwalTetap(user);
        expect(await screen.findByText("1 kemunculan akan menjadi slot dalam horizon pemesanan.")).toBeTruthy();
        expect(screen.getByText(/Hari libur: Libur Uji\./)).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
        await user.click(screen.getByRole("button", { name: "Simpan blokade" }));
        await waitFor(() => expect(log.find((p) => p.url === "/rooms/10/blocks" && p.method === "POST")?.data).toEqual({ jenis: "JADWAL_TETAP", hari: [1], jam_mulai: "07:00", jam_selesai: "08:00", berlaku_mulai: "2027-09-06", berlaku_sampai: "2027-12-17", label_kegiatan: "KBM Kelas XI-B" }));
        expect(await screen.findByText("Blokade tersimpan: 14 slot terbentuk.")).toBeTruthy();
    });

    it("FR-07.5 A1: bentrok reservasi → daftar + dua pilihan eksplisit; 'Sesuaikan' menutup hasil, 'Batalkan' menuntut alasan dan mengirim batalkan_bentrok", async () => {
        const log = server({ pratinjau: () => sukses({ ...PRATINJAU, bentrok_reservasi: [BENTROK] }), buat: () => ({ status: 201, data: { success: true, data: { jenis: "JADWAL_TETAP", ids: ["124"], slot_dibuat: 14, reservasi_dibatalkan: [{ id: "77", nomor: BENTROK.nomor }] }, meta: null } }) });
        const user = userEvent.setup();
        await renderAplikasi("/kalender-ruangan?tanggal=2027-09-06&kelola=true&ruang=10");
        await screen.findByText("KBM Kelas XI-A");
        await isiJadwalTetap(user);
        const peringatan = await screen.findByText(/Beririsan dengan 1 reservasi/);
        expect(within(peringatan.closest("[role=alert]")!).getByText(/RSV-RG-2027-0077 · Rapat Komite · Pak Budi/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Simpan blokade" })).toBeNull();

        await user.click(screen.getByRole("button", { name: "Sesuaikan blokade" }));
        expect(screen.queryByText(/Beririsan dengan 1 reservasi/)).toBeNull();
        expect(log.some((p) => p.url === "/rooms/10/blocks" && p.method === "POST")).toBe(false);

        await user.click(screen.getByRole("button", { name: "Periksa blokade" }));
        await user.click(await screen.findByRole("button", { name: "Batalkan reservasi tersebut" }));
        const dialog = await screen.findByRole("dialog");
        const kirim = within(dialog).getByRole("button", { name: "Batalkan reservasi & simpan blokade" }) as HTMLButtonElement;
        expect(kirim.disabled).toBe(true);
        await user.type(within(dialog).getByLabelText(/^Alasan pembatalan/), "Ruangan untuk KBM semester ganjil.");
        await user.click(kirim);
        await waitFor(() => expect((log.find((p) => p.url === "/rooms/10/blocks" && p.method === "POST")?.data as { batalkan_bentrok?: unknown } | undefined)?.batalkan_bentrok).toEqual({ alasan: "Ruangan untuk KBM semester ganjil." }));
        expect(await screen.findByText("Blokade tersimpan: 14 slot terbentuk, 1 reservasi dibatalkan dan pemohonnya dinotifikasi.")).toBeTruthy();
    });

    it("bentrok blokade lain → tak dapat disimpan, wajib disesuaikan; galat isian server tampil di field", async () => {
        server({ pratinjau: () => sukses({ ...PRATINJAU, bentrok_lain: [{ asal: "manual_block", label: "Renovasi", mulai: "2027-09-13T00:00:00.000Z", selesai: "2027-09-13T03:00:00.000Z" }] }) });
        const user = userEvent.setup();
        await renderAplikasi("/kalender-ruangan?tanggal=2027-09-06&kelola=true&ruang=10");
        await screen.findByText("KBM Kelas XI-A");
        await isiJadwalTetap(user);
        expect(await screen.findByText("Beririsan dengan blokade lain — sesuaikan rentangnya")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Simpan blokade" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Batalkan reservasi tersebut" })).toBeNull();
    });

    it("mengubah isian setelah diperiksa menggugurkan hasil lama — tak dapat menyimpan berdasar pratinjau usang", async () => {
        server();
        const user = userEvent.setup();
        await renderAplikasi("/kalender-ruangan?tanggal=2027-09-06&kelola=true&ruang=10");
        await screen.findByText("KBM Kelas XI-A");
        await isiJadwalTetap(user);
        expect(await screen.findByRole("button", { name: "Simpan blokade" })).toBeTruthy();
        await user.type(screen.getByLabelText(/^Label kegiatan/), " (revisi)");
        expect(screen.queryByRole("button", { name: "Simpan blokade" })).toBeNull();
        expect(screen.queryByText(/kemunculan akan menjadi slot/)).toBeNull();
    });

    it("galat isian 422 dari server tampil pada field-nya", async () => {
        server({ pratinjau: () => ({ status: 422, data: { success: false, error: { code: "VALIDATION_ERROR", message: "x", details: [{ field: "jam_mulai", message: "Jam harus kelipatan 30 menit." }] }, request_id: "r" } }) });
        const user = userEvent.setup();
        await renderAplikasi("/kalender-ruangan?tanggal=2027-09-06&kelola=true&ruang=10");
        await screen.findByText("KBM Kelas XI-A");
        await isiJadwalTetap(user);
        expect(await screen.findByText("Jam harus kelipatan 30 menit.")).toBeTruthy();
    });

    it("FR-07.5 A3: Nonaktifkan berkonfirmasi → PATCH status NONAKTIF, jumlah slot dilepas dilaporkan", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/kalender-ruangan?tanggal=2027-09-06&kelola=true&ruang=10");
        await screen.findByText("KBM Kelas XI-A");
        await user.click(screen.getByRole("button", { name: "Nonaktifkan" }));
        const dialog = await screen.findByRole("dialog", { name: 'Nonaktifkan "KBM Kelas XI-A"?' });
        await user.click(within(dialog).getByRole("button", { name: "Nonaktifkan blokade" }));
        await waitFor(() => expect(log.find((p) => p.url === "/room-fixed-schedules/123/status")).toMatchObject({ method: "PATCH", data: { status: "NONAKTIF" } }));
        expect(await screen.findByText("Blokade dinonaktifkan; 9 slot mendatang dilepas.")).toBeTruthy();
    });

    it("gagal memuat daftar → keadaan galat dengan Coba lagi", async () => {
        pasangServer((p) => (p.url === "/me" ? sukses(ME) : p.url === "/rooms/availability" ? sukses(KALENDER) : gagal(500, "INTERNAL_ERROR", "x")));
        await renderAplikasi("/kalender-ruangan?tanggal=2027-09-06&kelola=true&ruang=10");
        expect(await screen.findByRole("button", { name: "Coba lagi" })).toBeTruthy();
    });
});
