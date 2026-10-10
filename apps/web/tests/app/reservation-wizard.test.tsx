// P-29 Wizard Pengajuan Reservasi (FR-07.2, UX §7.6.2, UXD-04, PATTERNS §4.3–4.4; PR-03-10) —
// aplikasi utuh lewat router, gerbang sesi, dan klien HTTP produksi; server tiruan pada adapter axios.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RoomAvailability, RoomReservationPreview } from "@sigm4/schemas";
import { describe, expect, it } from "vitest";
import { bodyDari, isianDariSlot, ruanganCukup, saranSlot } from "../../src/modules/m07-reservation-room/pengajuan";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

const ruang = (id: string, nama: string, kapasitas: number) => ({ id, kode: `R-${id}`, nama, jenis: "AULA", kapasitas, gedung: { id: "1", nama: "Gedung A" } });
// Senin 1 Maret 2027 WIB: Aula 07.00–08.00 menunggu, 09.00–10.00 disetujui.
const DATA: RoomAvailability = {
    dari: "2027-02-28T17:00:00.000Z",
    sampai: "2027-03-01T17:00:00.000Z",
    zona_waktu: "Asia/Jakarta",
    granularitas_menit: 30,
    jam_operasional: { hari: [1, 2, 3, 4, 5, 6], mulai: "06:00", selesai: "18:00" },
    hari_libur: [{ tanggal: "2027-03-03", nama: "Hari Raya Nyepi" }],
    ruangan: [ruang("10", "Aula Utama", 40), ruang("11", "Aula Besar", 200), ruang("12", "Lab Kimia", 30)],
    slot: [
        { ruangan_id: "10", mulai: "2027-03-01T00:00:00.000Z", selesai: "2027-03-01T01:00:00.000Z", keadaan: "MENUNGGU_PERSETUJUAN", label: "Rapat", reservasi: null },
        { ruangan_id: "10", mulai: "2027-03-01T02:00:00.000Z", selesai: "2027-03-01T03:00:00.000Z", keadaan: "DISETUJUI", label: "Latihan", reservasi: null },
        { ruangan_id: "11", mulai: "2027-03-01T03:00:00.000Z", selesai: "2027-03-01T04:00:00.000Z", keadaan: "DISETUJUI", label: "Seminar", reservasi: null },
    ],
};
const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "reservation.view": "all", "reservation.create": "all" } };
const PRATINJAU: RoomReservationPreview = {
    tanggal: [{ tanggal: "2027-03-01", mulai: "2027-03-01T03:00:00.000Z", selesai: "2027-03-01T04:00:00.000Z", keadaan: "TERSEDIA", alasan: null }],
    jalur_persetujuan: [{ urutan: 1, approver: "Petugas Sarana Prasarana", sla_jam: 24, fallback: false, akan_dilewati: null }],
    kuota: { berjalan: 1, batas: 5 },
};
const DIBUAT = {
    id: "77",
    nomor: "RSV-RG-2027-0042",
    status: "MENUNGGU_PERSETUJUAN",
    tanggal: [{ id: "77", nomor: "RSV-RG-2027-0042", mulai: "2027-03-01T03:00:00.000Z", selesai: "2027-03-01T04:00:00.000Z" }],
    approval: { instance_id: 9, langkah_aktif: 1 },
};
const DETAIL = {
    id: "77",
    nomor: "RSV-RG-2027-0042",
    jenis: "RUANGAN",
    status: "MENUNGGU_PERSETUJUAN",
    ruangan: { id: "10", nama: "Aula Utama", gedung: "Gedung A" },
    pemohon: { id: "1", nama: "Admin Uji" },
    nama_kegiatan: "Rapat Komite",
    jenis_kegiatan: "Rapat",
    jumlah_peserta: 20,
    keperluan: null,
    kebutuhan_tambahan: null,
    keterangan: null,
    waktu_mulai: "2027-03-01T03:00:00.000Z",
    waktu_selesai: "2027-03-01T04:00:00.000Z",
    diajukan_pada: "2027-02-27T02:00:00.000Z",
    induk: null,
    tanggal: [],
    penggunaan: null,
    approval_instance_id: 9,
    aksi: { batalkan: true, ubah_jadwal: true, ajukan_ulang: false, catat_penggunaan: { kondisi: false, tidak_digunakan: false } },
    riwayat: [],
};
const URL_WIZARD = "/reservasi/baru?ruangan=10&mulai=2027-03-01T03%3A00%3A00.000Z&selesai=2027-03-01T04%3A00%3A00.000Z";

function server(o: { me?: unknown; pratinjau?: (p: Permintaan) => Jawaban; ajukan?: (p: Permintaan) => Jawaban } = {}) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(o.me ?? ME);
        if (p.url === "/rooms/availability") return sukses(DATA);
        if (p.url === "/reservations/preview") return o.pratinjau?.(p) ?? sukses(PRATINJAU);
        if (p.url === "/reservations") return o.ajukan?.(p) ?? { status: 201, data: { success: true, data: DIBUAT, meta: null } };
        // UXD-06 (PR-03-27): setelah terbentuk, P-31 memuat detailnya; linimasa di luar hak lihat → disembunyikan.
        if (p.url === "/reservations/77") return sukses(DETAIL);
        if (p.url === "/approvals/9/history") return gagal(403, "FORBIDDEN", "Akses ditolak.");
        return { status: 404 };
    });
}

async function keLangkah2(user: ReturnType<typeof userEvent.setup>) {
    expect(await screen.findByRole("heading", { name: "Ajukan Reservasi Ruangan" })).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText(/^Ruangan/) as HTMLSelectElement).value).toBe("10"));
    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    await user.type(await screen.findByLabelText(/^Nama kegiatan/), "Rapat Komite");
    await user.type(screen.getByLabelText(/^Jenis kegiatan/), "Rapat");
    await user.type(screen.getByLabelText(/^Perkiraan jumlah peserta/), "20");
}

describe("logika wizard (WIB)", () => {
    it("isian awal dari slot terpilih kalender: tanggal & jam WIB, bukan UTC", () => {
        expect(isianDariSlot("10", "2027-02-28T23:00:00.000Z", "2027-03-01T00:30:00.000Z")).toMatchObject({ ruangan: "10", tanggal: "2027-03-01", mulai: "06:00", selesai: "07:30" });
        expect(isianDariSlot(undefined, "bukan-waktu", undefined)).toMatchObject({ ruangan: "", tanggal: "", mulai: "" });
    });

    it("body kontrak: waktu ISO dari jam WIB; pola mingguan & lewati hanya bila berulang", () => {
        const i = { ...isianDariSlot("10", "2027-03-01T03:00:00.000Z", "2027-03-01T04:00:00.000Z"), nama_kegiatan: "Rapat", jenis_kegiatan: "Rapat", jumlah_peserta: "20", keperluan: "  " };
        expect(bodyDari(i)).toEqual({ room_id: 10, waktu_mulai: "2027-03-01T03:00:00.000Z", waktu_selesai: "2027-03-01T04:00:00.000Z", nama_kegiatan: "Rapat", jenis_kegiatan: "Rapat", jumlah_peserta: 20, keperluan: null, kebutuhan_tambahan: null, keterangan: null });
        expect(bodyDari({ ...i, berulang: true, hari: [3, 1], sampai: "2027-03-31", lewati: ["2027-03-15"] })).toMatchObject({ pengulangan: { hari: [1, 3], sampai: "2027-03-31" }, lewati: ["2027-03-15"] });
    });

    it("FR-07.2 A1: saran slot kosong TERDEKAT berdurasi sama; tak ada saran pada hari libur", () => {
        // 09.00–10.00 diminta (bentrok); 08.00 dan 10.00 sama dekat → yang lebih awal.
        expect(saranSlot(DATA, "10", "2027-03-01", "09:00", "10:00")).toEqual({ mulai: "08:00", selesai: "09:00" });
        expect(saranSlot(DATA, "10", "2027-03-01", "09:30", "10:30")).toEqual({ mulai: "10:00", selesai: "11:00" });
        expect(saranSlot(DATA, "10", "2027-03-01", "07:00", "08:00")).toEqual({ mulai: "06:00", selesai: "07:00" });
        expect(saranSlot(DATA, "10", "2027-03-03", "07:00", "08:00")).toBeNull();
    });

    it("FR-07.2 A2: ruangan lain berkapasitas cukup DAN kosong pada rentang itu", () => {
        const i = isianDariSlot("10", "2027-03-01T03:00:00.000Z", "2027-03-01T04:00:00.000Z");
        // Aula Besar (200) terpakai 10.00–11.00; Lab (30) cukup bagi 25.
        expect(ruanganCukup(DATA, i, 25).map((r) => r.nama)).toEqual(["Lab Kimia"]);
        expect(ruanganCukup(DATA, i, 100)).toEqual([]);
    });
});

describe("P-29 Wizard Pengajuan Reservasi", () => {
    it("tanpa reservation.create → halaman tanpa akses; kalender tanpa tombol Ajukan", async () => {
        const meLihat = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "reservation.view": "all" } };
        server({ me: meLihat });
        await renderAplikasi(URL_WIZARD);
        expect(await screen.findByRole("heading", { name: /akses/i })).toBeTruthy();
    });

    it("tanpa reservation.create → slot terpilih di P-27 tidak menawarkan Ajukan reservasi", async () => {
        server({ me: { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "reservation.view": "all" } } });
        await renderAplikasi("/kalender-ruangan?tanggal=2027-03-01");
        const user = userEvent.setup();
        await user.click(await screen.findByRole("gridcell", { name: /Aula Utama, 10\.00–10\.30/ }));
        expect(screen.getByRole("status").textContent).toContain("Terpilih: Aula Utama, 10.00–10.30 WIB");
        expect(screen.queryByRole("button", { name: "Ajukan reservasi" })).toBeNull();
    });

    it("UX F-09: slot kosong terpilih di P-27 → wizard langkah 1 terisi otomatis", async () => {
        server();
        await renderAplikasi("/kalender-ruangan?tanggal=2027-03-01");
        const user = userEvent.setup();
        await user.click(await screen.findByRole("gridcell", { name: /Aula Utama, 10\.00–10\.30/ }));
        await user.click(screen.getByRole("button", { name: "Ajukan reservasi" }));
        expect(await screen.findByRole("heading", { name: "Ajukan Reservasi Ruangan" })).toBeTruthy();
        await waitFor(() => expect((screen.getByLabelText(/^Ruangan/) as HTMLSelectElement).value).toBe("10"));
        expect((screen.getByLabelText(/^Jam mulai/) as HTMLSelectElement).value).toBe("10:00");
        expect((screen.getByLabelText(/^Jam selesai/) as HTMLSelectElement).value).toBe("10:30");
        expect(screen.getByRole("listitem", { current: "step" }).textContent).toContain("Langkah 1: Pilih Ruangan & Waktu");
    });

    it("alur utuh: langkah 1 bentrok ditolak + saran; langkah 2 wajib diisi; tinjau dari pratinjau server; Ajukan ber-Idempotency-Key; tanpa pelanggaran axe", async () => {
        const log = server();
        const { container } = await renderAplikasi("/reservasi/baru?ruangan=10&mulai=2027-03-01T02%3A00%3A00.000Z&selesai=2027-03-01T03%3A00%3A00.000Z");
        const user = userEvent.setup();
        await waitFor(() => expect((screen.getByLabelText(/^Ruangan/) as HTMLSelectElement).value).toBe("10"));
        await user.click(screen.getByRole("button", { name: "Lanjut" }));
        expect(await screen.findByText("Ruangan sudah terpakai pada rentang ini.")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Pakai 08.00–09.00 WIB" }));
        await user.click(screen.getByRole("button", { name: "Lanjut" }));

        await user.click(await screen.findByRole("button", { name: "Lanjut ke Tinjau" }));
        expect(await screen.findByText("Nama kegiatan wajib diisi.")).toBeTruthy();
        expect(log.some((p) => p.url === "/reservations/preview")).toBe(false);
        await user.type(screen.getByLabelText(/^Nama kegiatan/), "Rapat Komite");
        await user.type(screen.getByLabelText(/^Jenis kegiatan/), "Rapat");
        await user.type(screen.getByLabelText(/^Perkiraan jumlah peserta/), "20");
        await user.click(screen.getByRole("button", { name: "Lanjut ke Tinjau" }));

        expect(await screen.findByText("Langkah 1: Petugas Sarana Prasarana")).toBeTruthy();
        expect(screen.getByText("Tersedia")).toBeTruthy();
        expect(screen.getByText("Satu pengajuan, satu keputusan")).toBeTruthy();
        expect(log.find((p) => p.url === "/reservations/preview")?.data).toMatchObject({ room_id: 10, waktu_mulai: "2027-03-01T01:00:00.000Z", nama_kegiatan: "Rapat Komite", jumlah_peserta: 20 });
        expect(await pelanggaranAxe(container)).toEqual([]);

        await user.click(screen.getByRole("button", { name: "Ajukan" }));
        expect(await screen.findByText("Pengajuan terkirim — nomor RSV-RG-2027-0042")).toBeTruthy();
        const kirim = log.filter((p) => p.url === "/reservations");
        expect(kirim).toHaveLength(1);
        expect(String(kirim[0]?.headers["Idempotency-Key"])).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("BR-023a: kuota penuh menghentikan di langkah 2 dengan jumlah berjalan & batasnya", async () => {
        server({ pratinjau: () => sukses({ ...PRATINJAU, kuota: { berjalan: 2, batas: 2 } }) });
        await renderAplikasi(URL_WIZARD);
        const user = userEvent.setup();
        await keLangkah2(user);
        await user.click(screen.getByRole("button", { name: "Lanjut ke Tinjau" }));
        expect(await screen.findByText(/sudah penuh: 2 dari batas 2/)).toBeTruthy();
        expect(screen.getByRole("listitem", { current: "step" }).textContent).toContain("Langkah 2");
    });

    it("BR-019 / FR-07.2 A2: kapasitas terlampaui → galat di field peserta + saran ruangan yang cukup", async () => {
        server({ pratinjau: () => ({ status: 422, data: { success: false, error: { code: "VALIDATION_ERROR", message: "Pengajuan reservasi tidak sah.", details: [{ field: "jumlah_peserta", message: "Jumlah peserta melebihi kapasitas ruangan (40 orang)." }] }, request_id: "r" } }) });
        await renderAplikasi(URL_WIZARD);
        const user = userEvent.setup();
        await keLangkah2(user);
        await user.click(screen.getByRole("button", { name: "Lanjut ke Tinjau" }));
        expect(await screen.findByText("Jumlah peserta melebihi kapasitas ruangan (40 orang).")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Lab Kimia (30 orang)" }));
        expect(screen.queryByText("Jumlah peserta melebihi kapasitas ruangan (40 orang).")).toBeNull();
    });

    it("BR-030: pemohon terblokir → wizard berhenti dengan daftar kewajiban", async () => {
        server({ pratinjau: () => ({ status: 422, data: { success: false, error: { code: "BORROWER_BLOCKED", message: "Selesaikan kewajiban terlebih dahulu.", details: [{ field: "pemohon", message: "Denda Rp25.000 belum lunas." }] }, request_id: "r" } }) });
        await renderAplikasi(URL_WIZARD);
        const user = userEvent.setup();
        await keLangkah2(user);
        await user.click(screen.getByRole("button", { name: "Lanjut ke Tinjau" }));
        const alert = await screen.findByRole("alert");
        expect(within(alert).getByText("Selesaikan kewajiban terlebih dahulu")).toBeTruthy();
        expect(within(alert).getByText("Denda Rp25.000 belum lunas.")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Lanjut ke Tinjau" })).toBeNull();
    });

    it("FR-07.2 A1: 409 saat Ajukan → tetap di Tinjau, saran slot terdekat memperbarui waktu dan memeriksa ulang", async () => {
        let ke = 0;
        const log = server({ ajukan: () => (ke++ === 0 ? gagal(409, "RESERVATION_CONFLICT", "Slot baru saja dipesan pengguna lain.") : { status: 201, data: { success: true, data: DIBUAT, meta: null } }) });
        await renderAplikasi(URL_WIZARD);
        const user = userEvent.setup();
        await keLangkah2(user);
        await user.click(screen.getByRole("button", { name: "Lanjut ke Tinjau" }));
        await user.click(await screen.findByRole("button", { name: "Ajukan" }));
        expect(await screen.findByText("Slot baru saja dipesan pengguna lain")).toBeTruthy();
        // 10.00–11.00 diminta; 10.30 kosong dan terdekat.
        await user.click(screen.getByRole("button", { name: "Pakai slot terdekat 10.30–11.30 WIB" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/reservations/preview").at(-1)?.data).toMatchObject({ waktu_mulai: "2027-03-01T03:30:00.000Z" }));
        await user.click(await screen.findByRole("button", { name: "Ajukan" }));
        expect(await screen.findByText("Pengajuan terkirim — nomor RSV-RG-2027-0042")).toBeTruthy();
        const [a, b] = log.filter((p) => p.url === "/reservations");
        // ID-04: body berbeda = kunci berbeda.
        expect(a?.headers["Idempotency-Key"]).not.toBe(b?.headers["Idempotency-Key"]);
    });

    it("BR-024a A4: tanggal bentrok memblokir Ajukan; 'Lewati tanggal ini' memeriksa ulang dengan `lewati`", async () => {
        const log = server({
            pratinjau: (p) => {
                const lewati = ((p.data as { lewati?: string[] }).lewati ?? []).includes("2027-03-08");
                return sukses({
                    ...PRATINJAU,
                    tanggal: [
                        PRATINJAU.tanggal[0],
                        { tanggal: "2027-03-08", mulai: "2027-03-08T03:00:00.000Z", selesai: "2027-03-08T04:00:00.000Z", keadaan: lewati ? "DILEWATI" : "BENTROK", alasan: lewati ? null : "Ruangan sudah terpakai pada rentang ini." },
                    ],
                });
            },
        });
        await renderAplikasi(URL_WIZARD);
        const user = userEvent.setup();
        await keLangkah2(user);
        await user.click(screen.getByRole("checkbox", { name: "Ulangi setiap minggu" }));
        expect((screen.getByRole("checkbox", { name: "Senin" }) as HTMLButtonElement).getAttribute("data-state")).toBe("checked");
        await user.type(screen.getByLabelText(/^Sampai tanggal/), "2027-03-08");
        await user.click(screen.getByRole("button", { name: "Lanjut ke Tinjau" }));
        expect(await screen.findByText("Bentrok")).toBeTruthy();
        expect((screen.getByRole("button", { name: "Ajukan" }) as HTMLButtonElement).disabled).toBe(true);
        await user.click(screen.getByRole("button", { name: "Lewati tanggal ini" }));
        expect(await screen.findByText("Dilewati")).toBeTruthy();
        expect(log.filter((p) => p.url === "/reservations/preview").at(-1)?.data).toMatchObject({ pengulangan: { hari: [1], sampai: "2027-03-08" }, lewati: ["2027-03-08"] });
        await waitFor(() => expect((screen.getByRole("button", { name: "Ajukan" }) as HTMLButtonElement).disabled).toBe(false));
    });

    it("Batal dengan isian → konfirmasi dulu, lalu kembali ke kalender tanggal itu", async () => {
        server();
        const { router } = await renderAplikasi(URL_WIZARD);
        const user = userEvent.setup();
        await keLangkah2(user);
        await user.click(screen.getByRole("button", { name: "Batal" }));
        await user.click(await screen.findByRole("button", { name: "Ya, batalkan" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/kalender-ruangan"));
        expect(router.state.location.search).toMatchObject({ tanggal: "2027-03-01" });
    });
});
