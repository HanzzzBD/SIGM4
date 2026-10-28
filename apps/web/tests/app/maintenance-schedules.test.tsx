import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ME_ADMIN, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";

const row = { id: "1", nama: "Servis kipas", asset_id: null, category_id: "2", interval_hari: 30, tanggal_mulai: "2027-11-21", checklist: ["Bersihkan filter"], teknisi_default_id: "3", status: "AKTIF", jatuh_tempo_berikutnya: "2027-11-22" };
const me = { ...ME_ADMIN, permissions: { "maintenance.manage": "all" } };
const options = { categories: [{ id: "2", nama: "Elektronik", interval_preventif_hari: 45 }], technicians: [{ id: "3", nama: "Budi Teknisi" }] };
const server = (p: { url: string }) => p.url === "/me" ? sukses(me) : p.url.endsWith("/work-orders") ? sukses([]) : p.url === "/maintenance-schedules/options" ? sukses(options) : p.url === "/maintenance-schedules/1" ? sukses(row) : p.url === "/maintenance-schedules" ? { status: 200, data: { success: true, data: [row], meta: { page: 1, per_page: 20, total: 1, total_pages: 1 } } } : { status: 404 };

describe("PR-04-07 schedules P-45/P-46", () => {
    it("renders list and keeps filters in URL; passes axe", async () => {
        const calls = pasangServer(server);
        const { router, container } = await renderAplikasi("/jadwal-pemeliharaan");
        await screen.findByRole("link", { name: "Servis kipas" });
        fireEvent.change(screen.getByRole("combobox", { name: "Status jadwal" }), { target: { value: "AKTIF" } });
        await waitFor(() => expect(router.state.location.search).toMatchObject({ status: "AKTIF" }));
        await waitFor(() => expect(calls.some(c => c.params["filter[status]"] === "AKTIF")).toBe(true));
        expect(await pelanggaranAxe(container)).toEqual([]);
    });
    it("offers category interval, permits override and sends checklist/technician with an idempotency key", async () => {
        const calls = pasangServer(p => p.method === "POST" && p.url === "/maintenance-schedules" ? sukses(row) : server(p));
        const { container } = await renderAplikasi("/jadwal-pemeliharaan");
        fireEvent.click(await screen.findByRole("button", { name: "Buat jadwal" }));
        await screen.findByRole("option", { name: "Elektronik" });
        fireEvent.change(screen.getByRole("combobox", { name: "Kategori" }), { target: { value: "2" } });
        expect((screen.getByRole("spinbutton", { name: /Interval \(hari\)/ }) as HTMLInputElement).value).toBe("45");
        fireEvent.change(screen.getByRole("spinbutton", { name: /Interval \(hari\)/ }), { target: { value: "60" } });
        fireEvent.change(screen.getByLabelText(/Nama jadwal/), { target: { value: "Servis kipas" } });
        fireEvent.change(screen.getByRole("combobox", { name: /Teknisi penanggung jawab/ }), { target: { value: "3" } });
        fireEvent.change(screen.getByLabelText(/Checklist pekerjaan/), { target: { value: "Bersihkan filter\nPeriksa kabel" } });
        expect(await pelanggaranAxe(container)).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: "Buat jadwal" }));
        await waitFor(() => expect(calls.find(c => c.method === "POST")?.data).toMatchObject({ category_id: 2, interval_hari: 60, teknisi_default_id: 3, checklist: ["Bersihkan filter", "Periksa kabel"] }));
        expect(calls.find(c => c.method === "POST")?.headers["Idempotency-Key"]).toBeTruthy();
    });
    it("requires a reason before skipping a cycle; detail passes axe", async () => {
        const calls = pasangServer(p => p.url.endsWith("/skip") ? sukses(row) : server(p));
        const { container } = await renderAplikasi("/jadwal-pemeliharaan/1");
        await screen.findByRole("heading", { name: "Servis kipas" });
        expect(await pelanggaranAxe(container)).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: "Lewati sekali" }));
        const buttons = await screen.findAllByRole("button", { name: "Lewati sekali" });
        expect((buttons[buttons.length - 1] as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText(/Alasan/), { target: { value: "Pemeriksaan sudah dilakukan" } });
        fireEvent.click(buttons[buttons.length - 1]!);
        await waitFor(() => expect(calls.find(c => c.url.endsWith("/skip"))?.data).toEqual({ alasan: "Pemeriksaan sudah dilakukan" }));
    });
    it("denies users without maintenance.manage before fetching schedules", async () => {
        const calls = pasangServer(p => p.url === "/me" ? sukses({ ...ME_ADMIN, permissions: {} }) : { status: 404 });
        const { router } = await renderAplikasi("/jadwal-pemeliharaan");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
        expect(calls.some(c => c.url.startsWith("/maintenance-schedules"))).toBe(false);
    });
});
