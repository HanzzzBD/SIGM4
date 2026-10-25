import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RoomAvailability, RoomScheduleImportJob } from "@sigm4/schemas";
import { scheduleFailureCsv } from "../../src/modules/m07-reservation-room/import-api";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";

const job: RoomScheduleImportJob = { id: "12", nama_berkas: "jadwal.csv", status: "SELESAI", total: 3, terproses: 3, sukses: 2, gagal: 1, laporan_gagal: [{ baris: 4, kode_ruangan: "R-1", pesan: "Jadwal bentrok.", data: { kode_ruangan: "R-1", hari: "Senin" } }], pesan_galat: null, selesai_pada: "2026-10-15T03:00:00Z", dibuat_pada: "2026-10-15T03:00:00Z", report_expires_at: "2099-01-01T00:00:00Z", report_expired: false };
const calendar: RoomAvailability = { dari: "2027-09-05T17:00:00Z", sampai: "2027-09-06T17:00:00Z", zona_waktu: "Asia/Jakarta", granularitas_menit: 30, jam_operasional: { hari: [1, 2, 3, 4, 5], mulai: "06:00", selesai: "18:00" }, hari_libur: [], ruangan: [], slot: [] };
const me = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "reservation.view": "all", "reservation.fixed_schedule": "all" } };
const route = "/kalender-ruangan?tanggal=2027-09-06&kelola=true";
function mock(v: RoomScheduleImportJob = job, allow = true) {
    return pasangServer(p => {
        if (p.url === "/me") return sukses(allow ? me : { ...me, permissions: { "reservation.view": "all" } });
        if (p.url === "/rooms/availability") return sukses(calendar);
        if (p.url === "/room-fixed-schedules/import" && p.method === "POST") return { status: 200, data: { success: true, data: v, meta: { idempotent_replay: false } } };
        if (p.url === "/room-fixed-schedules/import/12") return sukses(v);
        if (p.url === "/room-fixed-schedules/import/template") return { status: 200, data: new Blob(["kode_ruangan,hari"]) };
        return gagal(404, "NOT_FOUND", "Laporan tidak ditemukan.");
    });
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("PR-03-35 — impor CSV dari panel kalender", () => {
    it("unggah CSV mengirim base64, menyimpan URL job, laporan dan aksesibilitas", async () => {
        const user = userEvent.setup(), requests = mock(), app = await renderAplikasi(route);
        await user.upload(await screen.findByLabelText("Berkas jadwal tetap", {}, { timeout: 10000 }), new File(["kode_ruangan,hari\nR-1,Senin"], "jadwal.csv", { type: "text/csv" }));
        await user.click(screen.getByRole("button", { name: "Mulai impor jadwal" }));
        const report = await screen.findByRole("region", { name: "Laporan impor jadwal tetap" });
        expect(within(report).getByText("Jadwal bentrok.")).toBeTruthy();
        await waitFor(() => expect(app.router.state.location.search).toMatchObject({ impor: "12" }));
        expect(requests.find(p => p.method === "POST")?.data).toEqual({ filename: "jadwal.csv", content_base64: btoa("kode_ruangan,hari\nR-1,Senin") });
        expect(await pelanggaranAxe(app.container)).toEqual([]);
    });
    it("deep link memulihkan laporan; retensi menyembunyikan rincian dan unduhan", async () => {
        mock({ ...job, report_expired: true, report_expires_at: "2026-01-01T00:00:00Z" });
        await renderAplikasi(route + "&impor=12");
        await screen.findByText(/Retensi laporan 30 hari telah berakhir/);
        expect(screen.queryByText("jadwal.csv")).toBeNull(); expect(screen.queryByText("Jadwal bentrok.")).toBeNull(); expect(screen.queryByRole("button", { name: "Unduh laporan jadwal" })).toBeNull();
    });
    it("tanpa fixed_schedule tidak membuka impor atau mengambil laporannya", async () => {
        const requests = mock(job, false); await renderAplikasi(route + "&impor=12");
        await screen.findByRole("heading", { name: "Kalender Ruangan" });
        expect(screen.queryByLabelText("Berkas jadwal tetap")).toBeNull(); expect(requests.some(p => p.url.startsWith("/room-fixed-schedules/import"))).toBe(false);
    });
    it.each([["bad.txt", "abc"], ["jadwal.csv", ""], ["jadwal.csv", new Uint8Array(6_000_001)]] as const)("berkas %s tidak sah dijelaskan tanpa POST", async (name, content) => {
        const user = userEvent.setup({ applyAccept: false }), requests = mock(); await renderAplikasi(route);
        await user.upload(await screen.findByLabelText("Berkas jadwal tetap"), new File([content], name)); await user.click(screen.getByRole("button", { name: "Mulai impor jadwal" }));
        expect(await screen.findByText("Pilih CSV berisi data, maksimal 6 MB.")).toBeTruthy(); expect(requests.some(p => p.method === "POST")).toBe(false);
    });
    it("template dan koreksi dapat diunduh; CSV menetralkan formula", async () => {
        const user = userEvent.setup(); mock(); vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() }));
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        await renderAplikasi(route + "&impor=12"); await user.click(await screen.findByRole("button", { name: "Unduh templat CSV" })); await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
        await user.click(await screen.findByRole("button", { name: "Unduh berkas koreksi jadwal" })); expect(click).toHaveBeenCalledTimes(2);
        expect(scheduleFailureCsv(job, true)).toContain('"kode_ruangan","hari"');
        expect(scheduleFailureCsv({ ...job, laporan_gagal: [{ ...job.laporan_gagal[0]!, pesan: "  =HYPERLINK(1)" }] }, false)).toContain("'  =HYPERLINK");
    });
    it("laporan milik orang lain memperlihatkan galat aman dan tombol mencoba ulang", async () => {
        mock(); await renderAplikasi(route + "&impor=999"); expect(await screen.findByText("Laporan tidak ditemukan.")).toBeTruthy(); expect(screen.getByRole("button", { name: "Coba lagi" })).toBeTruthy();
    });
});
