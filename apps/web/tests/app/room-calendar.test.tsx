// P-27 Kalender Ruangan (FR-07.1, UX §7.6.1, C-24, CAL-UI-01…09; PR-03-09) — aplikasi utuh lewat
// router, gerbang sesi, dan klien HTTP produksi; server tiruan pada adapter axios.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RoomAvailability } from "@sigm4/schemas";
import { describe, expect, it } from "vitest";
import { geserTampilan, keadaanSel, kepadatanHari, kolomHarian, rentangTampilan } from "../../src/modules/m07-reservation-room/kalender";
import { ME_ADMIN, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";

const ruang = (id: string, nama: string, kapasitas: number, gedung = { id: "1", nama: "Gedung A" }) => ({ id, kode: `R-${id}`, nama, jenis: "AULA", kapasitas, gedung });
const DATA: RoomAvailability = {
    dari: "2027-02-28T17:00:00.000Z",
    sampai: "2027-03-01T17:00:00.000Z",
    zona_waktu: "Asia/Jakarta",
    granularitas_menit: 30,
    jam_operasional: { hari: [1, 2, 3, 4, 5, 6], mulai: "06:00", selesai: "18:00" },
    hari_libur: [{ tanggal: "2027-03-03", nama: "Hari Raya Nyepi" }],
    ruangan: [ruang("10", "Aula Utama", 200), ruang("11", "Lab Kimia", 30, { id: "2", nama: "Gedung B" })],
    slot: [
        // Senin 1 Maret 2027: 07.00–08.00 menunggu, 09.00–10.00 disetujui (WIB).
        { ruangan_id: "10", mulai: "2027-03-01T00:00:00.000Z", selesai: "2027-03-01T01:00:00.000Z", keadaan: "MENUNGGU_PERSETUJUAN", label: "Rapat Komite", reservasi: { id: "5", nomor: "RSV-RG-2027-0001", pemohon: "Bu Sari" } },
        { ruangan_id: "10", mulai: "2027-03-01T02:00:00.000Z", selesai: "2027-03-01T03:00:00.000Z", keadaan: "DISETUJUI", label: "Latihan Paduan Suara", reservasi: { id: "6", nomor: "RSV-RG-2027-0002", pemohon: "Pak Budi" } },
        { ruangan_id: "11", mulai: "2027-03-01T00:00:00.000Z", selesai: "2027-03-01T02:00:00.000Z", keadaan: "JADWAL_TETAP", label: null, reservasi: null },
    ],
};
const ME = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "reservation.view": "all" } };

function server(data: RoomAvailability = DATA, me: unknown = ME) {
    return pasangServer((p) => (p.url === "/me" ? sukses(me) : p.url === "/rooms/availability" ? sukses(data) : { status: 404 }));
}
const sel = (nama: RegExp) => screen.findByRole("gridcell", { name: nama });

describe("logika kalender (WIB)", () => {
    it("CAL-UI-01: rentang harian, mingguan Senin–Minggu, bulanan 6 minggu (42 hari, keputusan 12d)", () => {
        expect(rentangTampilan("harian", "2027-03-01")).toMatchObject({ dari: "2027-02-28T17:00:00.000Z", sampai: "2027-03-01T17:00:00.000Z" });
        const minggu = rentangTampilan("mingguan", "2027-03-04");
        expect(minggu.hari[0]).toBe("2027-03-01");
        expect(minggu.hari).toHaveLength(7);
        const bulan = rentangTampilan("bulanan", "2027-03-15");
        expect(bulan.hari[0]).toBe("2027-03-01");
        expect(bulan.hari).toHaveLength(42);
        expect(Date.parse(bulan.sampai) - Date.parse(bulan.dari)).toBe(42 * 86_400_000);
        expect(geserTampilan("bulanan", "2027-01-31", 1)).toBe("2027-02-01");
        expect(geserTampilan("mingguan", "2027-03-01", -1)).toBe("2027-02-22");
    });

    it("CAL-UI-02: kolom mengikuti granularitas di dalam jam operasional", () => {
        expect(kolomHarian("2027-03-01", DATA)).toHaveLength(24);
        expect(kolomHarian("2027-03-01", { ...DATA, granularitas_menit: 15 })).toHaveLength(48);
        const [pertama] = kolomHarian("2027-03-01", { ...DATA, granularitas_menit: 60 });
        expect(pertama).toMatchObject({ label: "06.00", awalJam: true });
        expect(pertama?.mulai.toISOString()).toBe("2027-02-28T23:00:00.000Z");
    });

    it("CAL-UI-05: slot mengalahkan libur; libur dan bukan hari kerja tanpa slot", () => {
        const [k] = kolomHarian("2027-03-03", DATA);
        expect(keadaanSel(DATA, "10", k!)).toMatchObject({ keadaan: "LIBUR", label: "Hari Raya Nyepi" });
        const [minggu] = kolomHarian("2027-03-07", DATA);
        expect(keadaanSel(DATA, "10", minggu!).keadaan).toBe("TUTUP");
        const tujuh = kolomHarian("2027-03-01", DATA)[2]!;
        expect(keadaanSel(DATA, "10", tujuh)).toMatchObject({ keadaan: "MENUNGGU_PERSETUJUAN", label: "Rapat Komite" });
        expect(kepadatanHari(DATA, "2027-03-01")).toBeCloseTo(4 / 24);
        expect(kepadatanHari(DATA, "2027-03-03")).toBeNull();
    });
});

describe("P-27 Kalender Ruangan", () => {
    it("tanpa reservation.view → halaman tanpa akses, ketersediaan tak pernah diminta", async () => {
        const log = server(DATA, ME_ADMIN);
        await renderAplikasi("/kalender-ruangan?tanggal=2027-03-01");
        expect(await screen.findByRole("heading", { name: /akses/i })).toBeTruthy();
        expect(log.some((p) => p.url === "/rooms/availability")).toBe(false);
    });

    it("harian: rentang WIB, lima keadaan dibedakan teks, nama kegiatan & pemohon, penanda WIB, tanpa pelanggaran axe", async () => {
        const log = server();
        const { container } = await renderAplikasi("/kalender-ruangan?tanggal=2027-03-01");
        expect(await sel(/Aula Utama, 07\.00–07\.30 WIB, Menunggu Persetujuan: Rapat Komite, pemohon Bu Sari/)).toBeTruthy();
        expect(await sel(/Aula Utama, 09\.00–09\.30 WIB, Disetujui: Latihan Paduan Suara/)).toBeTruthy();
        expect(await sel(/Lab Kimia, 07\.00–07\.30 WIB, Jadwal Tetap$/)).toBeTruthy();
        expect(await sel(/Aula Utama, 06\.00–06\.30 WIB, Kosong/)).toBeTruthy();
        expect(within(screen.getByRole("grid")).getAllByText("WIB").length).toBeGreaterThan(0);
        expect(screen.getByRole("list", { name: "Keterangan keadaan slot" })).toBeTruthy();
        const p = log.find((x) => x.url === "/rooms/availability");
        expect(p?.params).toMatchObject({ dari: "2027-02-28T17:00:00.000Z", sampai: "2027-03-01T17:00:00.000Z" });
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("CAL-UI-08: panah memindah fokus, Enter memilih, Shift+Panah memperluas sampai sel terisi; Esc membatalkan", async () => {
        server();
        await renderAplikasi("/kalender-ruangan?tanggal=2027-03-01");
        const awal = await sel(/Aula Utama, 06\.00–06\.30/);
        awal.focus();
        const user = userEvent.setup();
        await user.keyboard("{Enter}");
        expect(screen.getByRole("status").textContent).toContain("Terpilih: Aula Utama, 06.00–06.30 WIB");
        await user.keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}");
        // 07.00 terisi — perluasan berhenti di 06.30–07.00.
        expect(screen.getByRole("status").textContent).toContain("06.00–07.00 WIB");
        await user.keyboard("{Escape}");
        expect(screen.getByRole("status").textContent).toContain("Pilih slot kosong");
        await user.keyboard("{ArrowDown}");
        await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Lab Kimia, 06\.30–07\.00/));
    });

    it("CAL-UI-03: seret lintas slot kosong berdampingan; slot terisi tak dapat dipilih", async () => {
        server();
        await renderAplikasi("/kalender-ruangan?tanggal=2027-03-01");
        const a = await sel(/Aula Utama, 08\.00–08\.30/);
        const b = await sel(/Aula Utama, 08\.30–09\.00/);
        fireEvent.mouseDown(a);
        fireEvent.mouseEnter(b);
        fireEvent.mouseUp(b);
        expect(screen.getByRole("status").textContent).toContain("Aula Utama, 08.00–09.00 WIB");
        fireEvent.mouseDown(await sel(/Aula Utama, 09\.00–09\.30/));
        expect(screen.getByRole("status").textContent).toContain("08.00–09.00 WIB");
    });

    it("FR-07.1 A1 / CAL-UI-06: Siswa/OSIS melihat 'Terpakai' tanpa pemohon", async () => {
        const terbatas: RoomAvailability = { ...DATA, slot: DATA.slot.map((s) => ({ ...s, label: null, reservasi: null })) };
        server(terbatas, { ...ME, permissions: { "reservation.view": "restricted" } });
        await renderAplikasi("/kalender-ruangan?tanggal=2027-03-01");
        expect(await sel(/Aula Utama, 07\.00–07\.30 WIB, Menunggu Persetujuan: Terpakai$/)).toBeTruthy();
        expect(screen.queryByText(/Bu Sari|Rapat Komite/)).toBeNull();
    });

    it("mingguan & bulanan meminta 7 / 42 hari; klik hari membuka tampilan harian", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/kalender-ruangan?tanggal=2027-03-03&tampilan=mingguan");
        expect(await screen.findByText(/07\.00–08\.00 Rapat Komite/)).toBeTruthy();
        expect(screen.getAllByText("Hari Raya Nyepi").length).toBeGreaterThan(0);
        expect(log.at(-1)?.params).toMatchObject({ dari: "2027-02-28T17:00:00.000Z", sampai: "2027-03-07T17:00:00.000Z" });
        await user.click(screen.getByRole("button", { name: "Bulanan" }));
        expect(await screen.findByRole("button", { name: /Senin, 1 Maret 2027: 17% terpakai/ })).toBeTruthy();
        expect(log.at(-1)?.params).toMatchObject({ sampai: "2027-04-11T17:00:00.000Z" });
        await user.click(screen.getByRole("button", { name: /Rabu, 3 Maret 2027: Hari Raya Nyepi/ }));
        expect(await screen.findByRole("grid", { name: /Rabu, 3 Maret 2027/ })).toBeTruthy();
    });

    it("FR-07.1 langkah 3: filter jenis & kapasitas dikirim ke server; gedung dari jawaban", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/kalender-ruangan?tanggal=2027-03-01");
        await sel(/Aula Utama, 06\.00/);
        await user.selectOptions(screen.getByLabelText("Gedung"), "2");
        await waitFor(() => expect(log.at(-1)?.params).toMatchObject({ gedung_id: "2" }));
        await user.selectOptions(screen.getByLabelText("Jenis ruangan"), "LABORATORIUM");
        await waitFor(() => expect(log.at(-1)?.params).toMatchObject({ gedung_id: "2", jenis: "LABORATORIUM" }));
        await user.type(screen.getByLabelText("Kapasitas minimum"), "25");
        await waitFor(() => expect(log.at(-1)?.params).toMatchObject({ kapasitas_min: 25 }));
    });

    it("keadaan kosong: belum ada ruangan yang dapat direservasi", async () => {
        server({ ...DATA, ruangan: [], slot: [] });
        await renderAplikasi("/kalender-ruangan?tanggal=2027-03-01");
        expect(await screen.findByRole("heading", { name: "Belum ada ruangan yang dapat direservasi" })).toBeTruthy();
    });
});
