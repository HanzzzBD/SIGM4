// P-65 Role & Permission, P-66 Matriks Permission (FR-02.2, A1, A2, BR-069a, PM-01; PR-01-20) — aplikasi utuh lewat
// router dan klien HTTP produksi. Fokus: terbaca dengan `role.view`, diubah hanya dengan `role.update`, permission
// inti Administrator terkunci, salin role, tujuan sidebar cadangan, dan axe.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";
import { navigasiTerlihat } from "../../src/shared/navigasi";

const me = (izin: readonly string[]) => ({ ...ME_ADMIN, permissions: { "dashboard.view": "all", "notification.manage_own": "all", ...Object.fromEntries(izin.map((p) => [p, "all"])) } });

const KATALOG = [
    { kode: "role.update", modul: "Role", aksi: "update", deskripsi: "Mengubah matriks permission", inti: true },
    { kode: "role.view", modul: "Role", aksi: "view", deskripsi: "Melihat role & matriks permission", inti: false },
    { kode: "user.view", modul: "User", aksi: "view", deskripsi: "Melihat daftar & detail pengguna", inti: false },
];
const ROLES = [
    { id: "1", kode: "R-01", nama: "Administrator", deskripsi: null, is_system: true, role_version: "3", jumlah_pengguna: 2, permissions: [{ kode: "role.update", scope: "ALL" }, { kode: "role.view", scope: "ALL" }, { kode: "user.view", scope: "ALL" }] },
    { id: "2", kode: "R-02", nama: "Petugas Sarpras", deskripsi: "Pengelola aset", is_system: true, role_version: "1", jumlah_pengguna: 5, permissions: [{ kode: "user.view", scope: "ALL" }] },
    { id: "7", kode: "R-07", nama: "Siswa/OSIS", deskripsi: null, is_system: true, role_version: "1", jumlah_pengguna: 300, permissions: [] },
];

function server(o: { izin?: readonly string[]; put?: (p: Permintaan) => Jawaban; post?: (p: Permintaan) => Jawaban; roles?: unknown[] } = {}) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(me(o.izin ?? ["role.view", "role.update", "user.view"]));
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        if (p.url === "/roles" && p.method === "GET") return sukses(o.roles ?? ROLES);
        if (p.url === "/roles" && p.method === "POST") return o.post?.(p) ?? { status: 201, data: { success: true, data: { id: "12", kode: "RK-12", nama: "Wali Kelas", deskripsi: null, is_system: false, role_version: "1", jumlah_pengguna: 0, permissions: [{ kode: "user.view", scope: "ALL" }] }, meta: null } };
        if (p.url === "/permissions") return sukses(KATALOG);
        if (p.url === "/roles/2/permissions") return o.put?.(p) ?? sukses({ ...ROLES[1], role_version: "2", permissions: (p.data as { permissions: unknown[] }).permissions });
        if (p.url === "/roles/1/permissions") return o.put?.(p) ?? sukses(ROLES[0]);
        return { status: 404 };
    });
}

describe("P-65 Role & Permission", () => {
    it("daftar role dengan jumlah pengguna & permission aktif; R-01/R-07 tidak menawarkan salin (BR-069a); tanpa pelanggaran axe", async () => {
        server();
        const { container } = await renderAplikasi("/role");
        const tabel = await screen.findByRole("table");
        const petugas = within(tabel).getByRole("row", { name: /Petugas Sarpras/ });
        expect(within(petugas).getByText("5")).toBeTruthy();
        expect(within(petugas).getByRole("button", { name: "Salin sebagai templat" })).toBeTruthy();
        expect(within(within(tabel).getByRole("row", { name: /Administrator/ })).queryByRole("button")).toBeNull();
        expect(within(within(tabel).getByRole("row", { name: /Siswa\/OSIS/ })).queryByRole("button")).toBeNull();
        expect(within(tabel).getByRole("link", { name: "Petugas Sarpras" }).getAttribute("href")).toBe("/role/2");
        expect(within(petugas).getByText("R-02")).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("salin role → POST /roles lalu membuka matriks role baru (FR-02.2 A2)", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/role");
        await user.click(await screen.findByRole("button", { name: "Salin sebagai templat" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Buat role" }));
        expect(within(dialog).getByText("Nama role wajib diisi.")).toBeTruthy();
        await user.type(within(dialog).getByLabelText(/Nama role/), "Wali Kelas");
        await user.click(within(dialog).getByRole("button", { name: "Buat role" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/role/12"));
        expect(log.find((p) => p.url === "/roles" && p.method === "POST")?.data).toEqual({ sumber_role_id: 2, nama: "Wali Kelas", deskripsi: null });
    });

    it("nama bentrok → pesan server tampil di dialog", async () => {
        server({ post: () => gagal(409, "DUPLICATE_CODE", "Nama role sudah digunakan.") });
        const user = userEvent.setup();
        await renderAplikasi("/role");
        await user.click(await screen.findByRole("button", { name: "Salin sebagai templat" }));
        const dialog = await screen.findByRole("dialog");
        await user.type(within(dialog).getByLabelText(/Nama role/), "Petugas Sarpras");
        await user.click(within(dialog).getByRole("button", { name: "Buat role" }));
        expect(await within(dialog).findByText("Nama role sudah digunakan.")).toBeTruthy();
    });

    it("hanya role.view → tanpa kolom aksi salin", async () => {
        server({ izin: ["role.view"] });
        await renderAplikasi("/role");
        await screen.findByRole("table");
        expect(screen.queryByRole("button", { name: "Salin sebagai templat" })).toBeNull();
    });

    it("tanpa role.view → P-08 (PM-04)", async () => {
        server({ izin: ["user.view"] });
        const { router } = await renderAplikasi("/role");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-66 Matriks Permission", () => {
    it("terbaca per modul, ubah + cakupan, simpan PUT pengganti penuh → P-65 dengan pesan sukses; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container, router } = await renderAplikasi("/role/2");
        expect(await screen.findByRole("heading", { name: "Matriks Permission: Petugas Sarpras" })).toBeTruthy();
        const tabelRole = screen.getByRole("table", { name: "Role" });
        // FR-02.2 langkah 3: modul × aksi — aksi baku berurutan view → update.
        expect(within(tabelRole).getAllByRole("row").slice(1).map((r) => (r as HTMLTableRowElement).cells[1]?.textContent)).toEqual(["Lihat", "Ubah"]);
        expect(await pelanggaranAxe(container)).toEqual([]);
        await user.click(screen.getByRole("checkbox", { name: "Melihat role & matriks permission" }));
        await user.selectOptions(screen.getByLabelText("Cakupan data: Melihat daftar & detail pengguna"), "OWN");
        await user.click(screen.getByRole("button", { name: "Simpan matriks" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/role"));
        // Izin sesi sendiri dimuat ulang sesudah simpan (temuan inspeksi R-002).
        const put = log.findIndex((p) => p.url === "/roles/2/permissions");
        expect(log.slice(put).some((p) => p.url === "/me")).toBe(true);
        expect(log.find((p) => p.url === "/roles/2/permissions")?.data).toEqual({ permissions: [{ kode: "user.view", scope: "OWN" }, { kode: "role.view", scope: "ALL" }] });
        expect(await screen.findByText("Matriks permission Petugas Sarpras tersimpan.")).toBeTruthy();
    });

    it("hanya role.view → seluruh kontrol nonaktif dan tanpa Simpan; tidak ada PUT", async () => {
        const log = server({ izin: ["role.view"] });
        await renderAplikasi("/role/2");
        await screen.findByRole("heading", { name: /Matriks Permission/ });
        for (const c of screen.getAllByRole("checkbox")) expect((c as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByRole("button", { name: "Simpan matriks" })).toBeNull();
        expect(log.some((p) => p.method === "PUT")).toBe(false);
    });

    it("FR-02.2 A1: permission inti Administrator terkunci; yang bukan inti tetap dapat diubah", async () => {
        server();
        await renderAplikasi("/role/1");
        await screen.findByRole("heading", { name: /Administrator/ });
        expect((screen.getByRole("checkbox", { name: "Mengubah matriks permission" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("checkbox", { name: "Melihat role & matriks permission" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("penolakan server (CORE_PERMISSION_LOCKED) tampil apa adanya", async () => {
        server({ put: () => gagal(422, "CORE_PERMISSION_LOCKED", "Permission inti tidak dapat dicabut dari Administrator: user.view.") });
        const user = userEvent.setup();
        await renderAplikasi("/role/1");
        await user.click(await screen.findByRole("checkbox", { name: "Melihat daftar & detail pengguna" }));
        await user.click(screen.getByRole("button", { name: "Simpan matriks" }));
        expect(await screen.findByText(/Permission inti tidak dapat dicabut/)).toBeTruthy();
    });

    it("refetch latar dengan versi baru tidak membuang suntingan; pilihan muat versi terbaru tersedia (temuan inspeksi R-001)", async () => {
        let roles: unknown[] = ROLES;
        const log = pasangServer((p) => {
            if (p.url === "/me") return sukses(me(["role.view", "role.update"]));
            if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
            if (p.url === "/roles") return sukses(roles);
            if (p.url === "/permissions") return sukses(KATALOG);
            return { status: 404 };
        });
        const user = userEvent.setup();
        const { queryClient } = await renderAplikasi("/role/2");
        const kotak = await screen.findByRole("checkbox", { name: "Melihat role & matriks permission" });
        await user.click(kotak);
        roles = ROLES.map((r) => (r.id === "2" ? { ...r, role_version: "5" } : r));
        await queryClient.invalidateQueries({ queryKey: ["roles"] });
        await waitFor(() => expect(log.filter((p) => p.url === "/roles").length).toBeGreaterThan(1));
        expect(await screen.findByText("Role ini baru saja diubah di tempat lain")).toBeTruthy();
        expect(screen.getByRole("checkbox", { name: "Melihat role & matriks permission" }).getAttribute("aria-checked")).toBe("true");
        await user.click(screen.getByRole("button", { name: "Muat versi terbaru" }));
        expect(screen.getByRole("checkbox", { name: "Melihat role & matriks permission" }).getAttribute("aria-checked")).toBe("false");
    });

    it("role tidak ada → keadaan kosong, bukan layar rusak", async () => {
        server();
        await renderAplikasi("/role/99");
        expect(await screen.findByText("Role tidak ditemukan")).toBeTruthy();
    });

    it("tanpa role.view → P-08", async () => {
        server({ izin: ["user.view"] });
        const { router } = await renderAplikasi("/role/2");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("Sidebar Pengguna & Role — tujuan cadangan (UX §5.3)", () => {
    const can = (...izin: string[]) => (p: string) => izin.includes(p);
    const entri = (izin: string[]) => navigasiTerlihat(can(...izin)).flatMap((g) => g.entri).find((e) => e.label === "Pengguna & Role");

    it("user.view → P-60 (tujuan utama); hanya role.view → P-65; tanpa keduanya → tak ada entri", () => {
        expect(entri(["role.view"])?.halaman).toBe("P-65");
        expect(entri(["user.view", "role.view"])?.halaman).toBe("P-60");
        expect(entri(["user.view"])?.halaman).toBe("P-60");
        expect(entri([])).toBeUndefined();
    });

    it("sidebar aplikasi: pemegang role.view melihat Pengguna & Role menuju /role", async () => {
        server({ izin: ["role.view"] });
        await renderAplikasi("/");
        const nav = await screen.findByRole("navigation", { name: "Navigasi utama" });
        expect(within(nav).getByRole("link", { name: "Pengguna & Role" }).getAttribute("href")).toBe("/role");
    });
});

describe("Perbaikan: scope permission inti Administrator terkunci (FR-02.2 A1, SDD-AUTH-10)", () => {
    it("pemilih cakupan data permission inti Administrator nonaktif; permission bukan inti tetap dapat diubah", async () => {
        server();
        await renderAplikasi("/role/1");
        await screen.findByRole("heading", { name: /Administrator/ });
        expect((screen.getByLabelText("Cakupan data: Mengubah matriks permission") as HTMLSelectElement).disabled).toBe(true);
        expect((screen.getByLabelText("Cakupan data: Melihat role & matriks permission") as HTMLSelectElement).disabled).toBe(false);
    });
});
