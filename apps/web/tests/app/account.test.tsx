import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Penangan } from "../helpers";
const ME = { ...ME_ADMIN, user: { ...ME_ADMIN.user, role_kode: "R-02", foto_status: null, foto_url: null }, permissions: { ...ME_ADMIN.permissions, "user.reset_password": "all" } };
const REQUEST = { id: "8", pemohon: { id: "21", nama: "Siti Guru", email: "siti@example.test", nip_nis: "123", role_kode: "R-05" }, status: "MENUNGGU", metode_verifikasi: null, diminta_pada: "2026-10-12T01:00:00Z", diproses_pada: null, kedaluwarsa_pada: null, alasan_penolakan: null };
const CURRENT = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const sessions = [CURRENT, OTHER].map((id, i) => ({ id, platform: i ? "ANDROID" : "WEB", saat_ini: i === 0, ip: "127.0.0.1", user_agent: i ? "Android School Phone" : "Chrome", dibuat_pada: "2026-10-01T00:00:00Z", terakhir_diperbarui: "2026-10-12T00:00:00Z", berlaku_sampai: "2026-11-01T00:00:00Z" }));
function server(extra?: (p: Parameters<Penangan>[0]) => ReturnType<Penangan> | undefined) {
    return pasangServer(async (p) => {
        const override = await extra?.(p); if (override) return override;
        if (p.url === "/me") return sukses({ ...ME, ...(p.method === "PUT" ? { user: { ...ME.user, nama: "Siti Baru" } } : {}) });
        if (p.url === "/auth/2fa/status") return sukses({ aktif: true, diaktifkan_pada: "2026-10-01T00:00:00Z", sisa_kode_cadangan: 2, kode_cadangan_menipis: true });
        if (p.url === "/auth/sessions") return sukses(sessions);
        if (p.method === "DELETE" || p.url === "/auth/logout-all") return { status: 204 };
        if (p.url === "/auth/password/forgot") return { status: 202, data: { success: true, data: { message: "Permintaan diterima" }, meta: null } };
        if (p.url === "/auth/password/requests") return { status: 200, data: { success: true, data: [REQUEST], meta: { total: 1, total_pages: 1 } } };
        if (p.url.endsWith("/issue")) return sukses({ password_sementara: "SekaliTampilRahasia123", permintaan: { ...REQUEST, status: "DITERBITKAN", kedaluwarsa_pada: "2026-10-15T00:00:00Z" } });
        if (p.url.endsWith("/reject")) return sukses({ ...REQUEST, status: "DITOLAK" });
        if (p.url.endsWith("/regenerate")) return sukses({ kode_cadangan: ["BACKUP-ONCE-123"] });
        return sukses([]);
    });
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("PR-02-42 auth dan pengaturan akun", () => {
    it("role opsional dapat memulai 2FA tanpa kode aktivasi Administrator", async () => {
        const log = server((p) => p.url === "/auth/2fa/status" ? sukses({ aktif: false, diaktifkan_pada: null, sisa_kode_cadangan: 0, kode_cadangan_menipis: false }) : p.url === "/auth/2fa/enroll" ? sukses({ secret: "JBSWY3DPEHPK3PXP", otpauth_uri: "otpauth://totp/SIGM4:user?secret=JBSWY3DPEHPK3PXP", kode_cadangan: ["OPTIONAL-ONCE"] }) : undefined);
        await renderAplikasi("/profil/keamanan"); await userEvent.click(await screen.findByRole("link", { name: "Aktifkan 2FA" }));
        expect(screen.queryByLabelText(/^Kode aktivasi/)).toBeNull(); await userEvent.click(await screen.findByRole("button", { name: "Lanjutkan" }));
        await screen.findByRole("img", { name: "Kode QR pendaftaran aplikasi authenticator" }); expect(log.find((p) => p.url === "/auth/2fa/enroll")?.data).toEqual({});
    });
    it("lupa password publik menghasilkan pesan netral dan lolos axe", async () => {
        const log = server(); const { container } = await renderAplikasi("/lupa-password");
        await userEvent.type(await screen.findByLabelText(/^Email/), "unknown@example.test"); await userEvent.click(screen.getByRole("button", { name: "Ajukan reset password" }));
        await screen.findByText(/Permintaan diterima/); expect(log.find((p) => p.url === "/auth/password/forgot")?.data).toEqual({ email: "unknown@example.test" });
        expect(log.some((p) => p.url === "/me")).toBe(false); expect(await pelanggaranAxe(container)).toEqual([]);
    });
    it("profil hanya mengubah nama/telepon; email dan role tidak menjadi isian", async () => {
        const log = server(); const { container } = await renderAplikasi("/profil");
        const input = await screen.findByLabelText(/^Nama/); await userEvent.clear(input); await userEvent.type(input, "Siti Baru"); await userEvent.click(screen.getByRole("button", { name: "Simpan profil" }));
        await screen.findByText("Profil tersimpan."); expect(log.find((p) => p.method === "PUT")?.data).toEqual({ nama: "Siti Baru", telepon: null });
        expect(screen.queryByLabelText(/^Email/)).toBeNull(); expect(screen.queryByLabelText("Role")).toBeNull(); expect(await pelanggaranAxe(container)).toEqual([]);
    });
    it("foto terlalu besar ditolak tanpa unggah; profil tidak dikirim", async () => {
        const log = server(); await renderAplikasi("/profil");
        const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
        await userEvent.upload(await screen.findByLabelText(/Foto profil/), file);
        await screen.findByText(/Pilih foto JPG\/PNG/); expect((screen.getByRole("button", { name: "Simpan profil" }) as HTMLButtonElement).disabled).toBe(true);
        expect(log.some((p) => p.url === "/files/presign" || p.method === "PUT")).toBe(false);
    });
    it("status kode menipis; regenerasi dikonfirmasi dan kode baru hanya ada di state layar", async () => {
        const log = server(); const { queryClient, container } = await renderAplikasi("/profil/keamanan#perangkat");
        await screen.findByText(/Kode cadangan menipis/); expect(screen.queryByRole("button", { name: /Nonaktifkan/ })).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "Buat ulang kode cadangan" }));
        const dialog = await screen.findByRole("dialog"); expect(log.some((p) => p.url.endsWith("/regenerate"))).toBe(false);
        await userEvent.click(within(dialog).getByRole("button", { name: "Buat kode baru" })); await screen.findByText("BACKUP-ONCE-123");
        expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))).not.toContain("BACKUP-ONCE-123");
        await userEvent.click(screen.getByRole("button", { name: "Saya sudah menyimpan kode" })); expect(screen.queryByText("BACKUP-ONCE-123")).toBeNull(); expect(await pelanggaranAxe(container)).toEqual([]);
    });
    it("cabut perangkat lain hanya memanggil ID terpilih setelah konfirmasi", async () => {
        const log = server(); const { router } = await renderAplikasi("/profil/keamanan");
        await userEvent.click(await screen.findByRole("button", { name: "Cabut sesi ANDROID" }));
        expect(log.some((p) => p.method === "DELETE")).toBe(false); await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cabut sesi" }));
        await waitFor(() => expect(log.some((p) => p.url === `/auth/sessions/${OTHER}` && p.method === "DELETE")).toBe(true)); expect(router.state.location.pathname).toBe("/profil/keamanan");
    });
    it("keluar semua menuntut konfirmasi, mengosongkan cache dan kembali Login", async () => {
        const log = server(); const { router, queryClient } = await renderAplikasi("/profil/keamanan");
        await userEvent.click(await screen.findByRole("button", { name: "Keluar dari semua perangkat" }));
        expect(log.some((p) => p.url === "/auth/logout-all")).toBe(false); await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cabut sesi" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/login")); expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });
    it("password dikonfirmasi sebelum dikirim dan keberhasilan mempertahankan perangkat ini", async () => {
        const log = server(); await renderAplikasi("/profil/keamanan");
        await userEvent.type(await screen.findByLabelText(/^Password saat ini/), "OldPassword123"); await userEvent.type(screen.getByLabelText(/^Password baru/), "NewPassword1234"); await userEvent.type(screen.getByLabelText(/^Konfirmasi password baru/), "wrong");
        await userEvent.click(screen.getByRole("button", { name: "Simpan password" })); await screen.findByText("Konfirmasi password tidak sama."); expect(log.some((p) => p.url === "/auth/password/change")).toBe(false);
        await userEvent.clear(screen.getByLabelText(/^Konfirmasi password baru/)); await userEvent.type(screen.getByLabelText(/^Konfirmasi password baru/), "NewPassword1234"); await userEvent.click(screen.getByRole("button", { name: "Simpan password" }));
        await screen.findByText(/Password berubah/); expect(log.find((p) => p.url === "/auth/password/change")?.data).toEqual({ password_lama: "OldPassword123", password_baru: "NewPassword1234" }); expect((screen.getByLabelText(/^Password baru/) as HTMLInputElement).value).toBe("");
    });
    it("antrean reset ditolak tanpa permission sebelum API", async () => {
        const log = server((p) => p.url === "/me" ? sukses(ME_ADMIN) : undefined); await renderAplikasi("/permintaan-reset-password");
        await screen.findByRole("heading", { name: /akses/i }); expect(log.some((p) => p.url === "/auth/password/requests")).toBe(false);
    });
    it("terbitkan password memerlukan metode; tidak dapat dibaca dari query cache sesudahnya", async () => {
        const log = server(); const { queryClient, container } = await renderAplikasi("/permintaan-reset-password"); await screen.findByText("Siti Guru"); expect(await pelanggaranAxe(container)).toEqual([]);
        await userEvent.click(screen.getByRole("button", { name: "Terbitkan password" })); const dialog = await screen.findByRole("dialog");
        expect((within(dialog).getByRole("button", { name: "Terbitkan password" }) as HTMLButtonElement).disabled).toBe(true); expect((within(dialog).getByRole("button", { name: "Batal" }) as HTMLButtonElement).disabled).toBe(false);
        await userEvent.selectOptions(within(dialog).getByLabelText("Metode verifikasi identitas"), "KARTU_IDENTITAS_TATAP_MUKA"); await userEvent.click(within(dialog).getByRole("button", { name: "Terbitkan password" }));
        await screen.findByLabelText("Password sementara"); expect(log.find((p) => p.url.endsWith("/issue"))?.data).toEqual({ metode_verifikasi: "KARTU_IDENTITAS_TATAP_MUKA" }); expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))).not.toContain("SekaliTampilRahasia123");
        await userEvent.click(screen.getByRole("button", { name: "Saya sudah menyerahkan password" })); expect(screen.queryByLabelText("Password sementara")).toBeNull();
    });
    it("tolak memerlukan alasan; gagal tetap berada di dialog", async () => {
        const log = server((p) => p.url.endsWith("/reject") ? gagal(422, "VALIDATION_ERROR", "Permintaan sudah diproses.") : undefined); await renderAplikasi("/permintaan-reset-password"); await userEvent.click(await screen.findByRole("button", { name: "Tolak permintaan" })); const dialog = await screen.findByRole("dialog");
        expect((within(dialog).getByRole("button", { name: "Tolak permintaan" }) as HTMLButtonElement).disabled).toBe(true); await userEvent.type(within(dialog).getByLabelText(/Alasan penolakan/), "Identitas belum terverifikasi"); await userEvent.click(within(dialog).getByRole("button", { name: "Tolak permintaan" }));
        await within(dialog).findByText("Permintaan sudah diproses."); expect(log.find((p) => p.url.endsWith("/reject"))?.data).toEqual({ alasan: "Identitas belum terverifikasi" });
    });
    it("upload foto melalui storage tanpa cookie lalu disimpan ke profil", async () => {
        const put = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", put); vi.stubGlobal("crypto", { subtle: { digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)) } });
        const log = server((p) => p.url === "/files/presign" ? sukses({ file_id: "9", upload_url: "https://storage.example.test/profile" }) : p.url === "/files/confirm" ? sukses({ file_id: "9", scan_status: "PENDING" }) : undefined);
        await renderAplikasi("/profil"); const file = new File(["image"], "photo.png", { type: "image/png" }); Object.defineProperty(file, "arrayBuffer", { value: () => Promise.resolve(new ArrayBuffer(5)) }); await userEvent.upload(await screen.findByLabelText(/Foto profil/), file);
        fireEvent.submit(screen.getByRole("button", { name: "Simpan profil" }).closest("form")!); await screen.findByText("Profil tersimpan."); expect(put.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit", method: "PUT" }); expect(log.find((p) => p.url === "/files/presign")?.data).toMatchObject({ jenis: "USER_PHOTO" }); expect(log.find((p) => p.method === "PUT")?.data).toMatchObject({ foto_file_id: 9 });
    });
});
