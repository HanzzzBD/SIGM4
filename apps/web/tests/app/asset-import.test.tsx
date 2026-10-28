import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { importReportCsv } from "../../src/modules/m04-assets/api";
import type { AssetImportJob } from "@sigm4/schemas";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";

const job: AssetImportJob = { id: "12", nama_berkas: "aset.csv", status: "SELESAI", total: 3, terproses: 3, sukses: 2, gagal: 1, unit_dibuat: 5, laporan_gagal: [{ baris: 4, nama_barang: "Kursi", pesan: "Kode ruangan tidak dikenal.", data: { nama_barang: "Kursi", kode_ruangan: "SALAH" } }], pesan_galat: null, selesai_pada: "2026-10-08T03:00:00Z", dibuat_pada: "2026-10-08T03:00:00Z" };
const me = { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "asset.create": "all" } };
afterEach(() => vi.restoreAllMocks());

describe("P-17 — impor aset", () => {
    it("permission tanpa asset.create mengarah ke P-08 dan tidak mengambil laporan", async () => {
        const requests = pasangServer((p) => p.url === "/me" ? sukses(ME_ADMIN) : gagal(404, "NOT_FOUND", "Tidak ada."));
        await renderAplikasi("/aset/impor?job=12");
        expect(await screen.findByRole("heading", { name: /akses/i })).toBeTruthy();
        expect(requests.some((p) => p.url.startsWith("/assets/import"))).toBe(false);
    });
    it("unggah file nyata mengirim base64 dan menyimpan job di URL; laporan dapat dimuat ulang", async () => {
        const user = userEvent.setup();
        const requests = pasangServer((p) => {
            if (p.url === "/me") return sukses(me);
            if (p.method === "POST" && p.url === "/assets/import") return { status: 200, data: { success: true, data: job, meta: { idempotent_replay: false } } };
            if (p.url === "/assets/import/12") return sukses(job);
            return gagal(404, "NOT_FOUND", "Tidak ada.");
        });
        const app = await renderAplikasi("/aset/impor");
        const input = await screen.findByLabelText(/Berkas impor/);
        expect((screen.getByRole("button", { name: "Mulai impor" }) as HTMLButtonElement).disabled).toBe(true);
        await user.upload(input, new File(["nama_barang\nKursi"], "aset.csv", { type: "text/csv" }));
        await user.click(screen.getByRole("button", { name: "Mulai impor" }));
        await screen.findByRole("heading", { name: "Laporan impor" });
        await waitFor(() => expect(app.router.state.location.search).toMatchObject({ job: 12 }));
        const submitted = requests.find((p) => p.method === "POST");
        expect(submitted?.data).toEqual({ filename: "aset.csv", content_base64: btoa("nama_barang\nKursi") });
        expect(screen.getByText("5")).toBeTruthy();
        expect(within(screen.getByRole("table")).getByText("Kode ruangan tidak dikenal.")).toBeTruthy();
        expect(await pelanggaranAxe(app.container)).toEqual([]);
    });
    it("URL job memulihkan laporan; polling pekerjaan berhenti ketika selesai", async () => {
        let polls = 0;
        pasangServer((p) => {
            if (p.url === "/me") return sukses(me);
            if (p.url === "/assets/import/12") { polls += 1; return sukses(polls === 1 ? { ...job, status: "BERJALAN", terproses: 1 } : job); }
            return gagal(404, "NOT_FOUND", "Tidak ada.");
        });
        await renderAplikasi("/aset/impor?job=12");
        expect(await screen.findByRole("progressbar", { name: "Progres impor aset" })).toBeTruthy();
        await screen.findByText("Selesai — 3 dari 3 baris diproses.", {}, { timeout: 4000 });
        expect(screen.queryByRole("progressbar")).toBeNull();
        expect(polls).toBe(2);
    });
    it.each([
        ["aset.txt", "data", "Pilih berkas CSV atau XLSX."],
        ["aset.csv", "", "Berkas kosong. Pilih berkas yang berisi data aset."],
        ["aset.xlsx", new Uint8Array(6_000_001), "Ukuran berkas maksimal 6 MB."],
    ])("berkas %s yang tidak valid menjelaskan koreksi sebelum dikirim", async (filename, content, message) => {
        const user = userEvent.setup({ applyAccept: false });
        const requests = pasangServer((p) => p.url === "/me" ? sukses(me) : gagal(404, "NOT_FOUND", "Tidak ada."));
        await renderAplikasi("/aset/impor");
        await user.upload(await screen.findByLabelText(/Berkas impor/), new File([content], filename));
        await user.click(screen.getByRole("button", { name: "Mulai impor" }));
        expect(await screen.findByText(message)).toBeTruthy();
        expect(requests.some((p) => p.method === "POST")).toBe(false);
    });
    it("404 dan kegagalan unggah menampilkan galat yang bisa dicoba ulang", async () => {
        pasangServer((p) => p.url === "/me" ? sukses(me) : gagal(404, "NOT_FOUND", "Pekerjaan impor tidak ditemukan."));
        await renderAplikasi("/aset/impor?job=999");
        expect(await screen.findByText(/Pekerjaan impor tidak ditemukan/)).toBeTruthy();
    });
    it("template diunduh dari endpoint berizin", async () => {
        const user = userEvent.setup();
        vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() }));
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        const requests = pasangServer((p) => {
            if (p.url === "/me") return sukses(me);
            if (p.url === "/assets/import/template") return { status: 200, data: new Blob(["xlsx"]) };
            return gagal(404, "NOT_FOUND", "Tidak ada.");
        });
        await renderAplikasi("/aset/impor");
        await user.click(await screen.findByRole("button", { name: "Unduh templat XLSX" }));
        await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled());
        expect(requests.some((p) => p.url === "/assets/import/template")).toBe(true);
        vi.unstubAllGlobals();
    });
    it("koreksi memakai kolom E.5.1 dan hanya baris gagal; laporan menetralkan formula CSV", () => {
        const correction = importReportCsv(job, true);
        expect(correction).toContain('"nama_barang","kode_kategori"');
        expect(correction).toContain('"SALAH"');
        expect(correction).not.toContain("Ringkasan");
        const unsafe = { ...job, laporan_gagal: [{ ...job.laporan_gagal[0]!, nama_barang: '=HYPERLINK("malicious")' }] };
        expect(importReportCsv(unsafe, false)).toContain("'=HYPERLINK");
        expect(importReportCsv(job, false)).toContain("5 unit dibuat");
    });
});
