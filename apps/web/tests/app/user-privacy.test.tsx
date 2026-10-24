import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import { useImportReportExpired } from "../../src/shared/ui/import-report-retention";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
const target = { id: "5", nama: "Bu Sari", email: "sari@sekolah.test", nip_nis: "12345" as string | null, role_id: "5", work_unit_id: null, telepon: null,
    status: "NONAKTIF", must_change_password: false, login_terakhir_pada: null, consent_guardian_at: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-10-15T03:00:00Z", deactivated_at: "2026-10-15T03:00:00Z", pseudonymized_at: null as string | null };
function serve(options: { role?: string; active?: boolean; erased?: boolean; blocked?: boolean; readOnly?: boolean; expired?: boolean } = {}) {
    let record = { ...target, status: options.active ? "AKTIF" : "NONAKTIF", ...(options.erased ? { nama: "Pengguna Terhapus #5", email: "deleted+5@invalid.local", nip_nis: null, pseudonymized_at: "2026-10-15T03:00:00Z" } : {}) };
    return pasangServer(p => {
        if (p.url === "/me") return sukses({ ...ME_ADMIN, user: { ...ME_ADMIN.user, role_kode: options.role ?? "R-01" }, permissions: { "user.view": "all", "user.create": "all", "asset.create": "all", ...(!options.readOnly ? { "user.update": "all" } : {}) } });
        if (p.url === "/users/5" && p.method === "GET") return sukses(record);
        if (p.url === "/users/5/pseudonymize") {
            if (options.blocked) return gagal(422, "VALIDATION_ERROR", "Pseudonimisasi ditolak — Denda #91 pada PJM-2026-3001 belum lunas.");
            record = { ...record, nama: "Pengguna Terhapus #5", email: "deleted+5@invalid.local", nip_nis: null, pseudonymized_at: "2026-10-15T03:00:00Z" };
            return sukses({ id: "5", pseudonymized_at: record.pseudonymized_at });
        }
        if (p.url === "/users/import/8" || p.url === "/assets/import/8") return sukses({ id: "8", nama_berkas: "identitas-pribadi.csv", status: "SELESAI", total: 3, terproses: 3, sukses: 2, gagal: 1, unit_dibuat: 2,
            laporan_gagal: p.url.startsWith("/users") ? [{ baris: 2, email: "rahasia@sekolah.test", pesan: "Alasan pribadi" }] : [{ baris: 2, nama_barang: "rahasia", pesan: "Alasan pribadi", data: { email: "rahasia" } }],
            pesan_galat: null, selesai_pada: "2026-09-01T00:00:00Z", dibuat_pada: "2026-09-01T00:00:00Z", report_expired: options.expired ?? false,
            report_expires_at: options.expired ? "2026-10-01T00:00:00Z" : new Date(Date.now() + 86400000).toISOString() });
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        return gagal(404, "NOT_FOUND", p.url);
    });
}
afterEach(() => { vi.useRealTimers(); });
describe("PR-05-09/26 — UI privasi pengguna dan retensi laporan", () => {
    it("aksi Administrator memerlukan isian, penjelasan dan konfirmasi sebelum satu permintaan", async () => {
        const calls = serve(), user = userEvent.setup(), { container } = await renderAplikasi("/pengguna/5");
        await user.click(await screen.findByRole("button", { name: "Pseudonimkan akun" }));
        expect(await pelanggaranAxe(container)).toEqual([]);
        await user.click(screen.getByRole("button", { name: "Tinjau pseudonimisasi" }));
        expect(calls.filter(p => p.url.endsWith("/pseudonymize"))).toHaveLength(0);
        await user.type(screen.getByLabelText(/Referensi permintaan terverifikasi/), "DP-2026-001");
        await user.type(screen.getByLabelText(/Alasan pseudonimisasi/), "Permintaan terverifikasi.");
        await user.selectOptions(screen.getByLabelText(/Metode verifikasi identitas/), "KARTU_IDENTITAS_TATAP_MUKA");
        await user.click(screen.getByRole("checkbox", { name: /Saya memahami akun/ }));
        await user.click(screen.getByRole("button", { name: "Tinjau pseudonimisasi" }));
        const dialog = await screen.findByRole("dialog");
        expect(calls.filter(p => p.url.endsWith("/pseudonymize"))).toHaveLength(0);
        expect(await pelanggaranAxe(container)).toEqual([]);
        await user.click(within(dialog).getByRole("button", { name: "Pseudonimkan permanen" }));
        await screen.findByRole("heading", { name: "Pengguna Terhapus #5", level: 1 });
        expect(calls.filter(p => p.url.endsWith("/pseudonymize"))).toHaveLength(1);
        expect(calls.find(p => p.url.endsWith("/pseudonymize"))?.data).toEqual({ alasan: "Permintaan terverifikasi.", referensi_permintaan: "DP-2026-001", metode_verifikasi: "KARTU_IDENTITAS_TATAP_MUKA" });
        expect(screen.queryByRole("button", { name: "Aktifkan" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Ubah" })).toBeNull();
    });
    it.each([{ active: true }, { role: "R-02" }, { readOnly: true }])("aksi tidak tersedia untuk konteks %j", async options => {
        serve(options); await renderAplikasi("/pengguna/5"); await screen.findByRole("heading", { name: "Bu Sari", level: 1 });
        expect(screen.queryByRole("button", { name: "Pseudonimkan akun" })).toBeNull();
    });
    it("akun yang telah dipseudonimkan tidak membuka form lewat deep link aksi", async () => {
        serve({ erased: true }); await renderAplikasi("/pengguna/5?aksi=ubah"); await screen.findByRole("heading", { name: "Pengguna Terhapus #5", level: 1 });
        expect(screen.getByText(/Identitas tidak dapat dipulihkan/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Simpan perubahan" })).toBeNull();
    });
    it.each(["/pengguna/impor?job=8", "/aset/impor?job=8"])("%s menyembunyikan rincian/download kedaluwarsa dan tetap menampilkan hitungan", async path => {
        serve({ expired: true }); const { container } = await renderAplikasi(path);
        await screen.findByText(/Retensi laporan 30 hari telah berakhir/);
        expect(screen.getByText("Baris berhasil")).toBeTruthy(); expect(screen.getByText("Baris gagal")).toBeTruthy();
        expect(screen.queryByText("identitas-pribadi.csv")).toBeNull(); expect(screen.queryByText(/rahasia@/)).toBeNull();
        expect(screen.queryByRole("button", { name: "Unduh laporan" })).toBeNull(); expect(screen.queryByRole("button", { name: "Unduh berkas koreksi" })).toBeNull();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });
    it("laporan yang masih berlaku menyediakan tenggat WIB dan unduhan", async () => {
        serve(); await renderAplikasi("/pengguna/impor?job=8"); await screen.findByRole("button", { name: "Unduh laporan" });
        expect(screen.getByText(/Tersedia sampai .*WIB/)).toBeTruthy();
    });
    it("tab terbuka melewati tenggat ikut menutup akses tanpa menunggu worker/refetch", async () => {
        vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T03:00:00Z"));
        function Probe() { const expired = useImportReportExpired("2026-10-15T03:00:00.100Z", false); return <p>{expired ? "tertutup" : "terbuka"}</p>; }
        render(<Probe />); expect(screen.getByText("terbuka")).toBeTruthy();
        await act(async () => { await vi.advanceTimersByTimeAsync(100); }); expect(screen.getByText("tertutup")).toBeTruthy();
    });
    it("penolakan kewajiban dari server tetap menampilkan referensi spesifik", async () => {
        serve({ blocked: true }); await renderAplikasi("/pengguna/5"); fireEvent.click(await screen.findByRole("button", { name: "Pseudonimkan akun" }));
        fireEvent.change(screen.getByLabelText(/Referensi permintaan terverifikasi/), { target: { value: "DP-2026-001" } });
        fireEvent.change(screen.getByLabelText(/Alasan pseudonimisasi/), { target: { value: "Permintaan terverifikasi." } });
        fireEvent.change(screen.getByLabelText(/Metode verifikasi identitas/), { target: { value: "KARTU_IDENTITAS_TATAP_MUKA" } });
        fireEvent.click(screen.getByRole("checkbox", { name: /Saya memahami akun/ })); fireEvent.click(screen.getByRole("button", { name: "Tinjau pseudonimisasi" }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Pseudonimkan permanen" }));
        await waitFor(() => expect(within(screen.getByRole("dialog")).getByText(/Denda #91 pada PJM-2026-3001/)).toBeTruthy());
    });
});
