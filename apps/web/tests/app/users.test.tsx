// P-60 … P-64 Pengguna (FR-02.1, FR-02.1 A4, SL-02/SL-04, FR-01.3 A5, FR-01.5 A3/A7; PR-01-19) — aplikasi utuh lewat
// router dan klien HTTP produksi. Fokus: aksi mengikuti permission, rahasia sekali tampil (tidak di cache/URL/history),
// dependensi izin lintas endpoint (rencana §1a), dan axe.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

// Kotak centang Radix DI DALAM <form> merender input gelembung ber-ResizeObserver, yang tak ada di jsdom (pola room-blocks).
globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
};

const SEMUA = ["user.view", "user.create", "user.update", "user.reset_password", "user.reset_2fa", "role.view", "setting.view"];
const me = (izin: readonly string[]) => ({ ...ME_ADMIN, permissions: { "dashboard.view": "all", "notification.manage_own": "all", ...Object.fromEntries(izin.map((p) => [p, "all"])) } });

const PENGGUNA = {
    id: "5",
    nama: "Bu Sari",
    email: "sari@sekolah.sch.id",
    nip_nis: "198001012005012001",
    role_id: "5",
    work_unit_id: "2",
    telepon: null,
    status: "AKTIF" as const,
    must_change_password: false,
    login_terakhir_pada: "2026-10-10T01:00:00.000Z",
    consent_guardian_at: null,
    created_at: "2026-09-01T01:00:00.000Z",
    updated_at: "2026-09-01T01:00:00.000Z",
};
const SISWA = { ...PENGGUNA, id: "9", nama: "Andi Siswa", role_id: "7", nip_nis: "0012345678" };
const ROLES = [
    { id: "1", kode: "R-01", nama: "Administrator" },
    { id: "5", kode: "R-05", nama: "Guru" },
    { id: "7", kode: "R-07", nama: "Siswa/OSIS" },
];
const daftar = (data: unknown[]): Jawaban => ({ status: 200, data: { success: true, data, meta: { page: 1, per_page: 25, total: data.length, total_pages: 1 } } });

/** Dua halaman unit kerja (per_page 100): kelas di halaman 2 dan unit NONAKTIF tetap harus terbaca (temuan inspeksi R-02). */
function unitKerja(p: Permintaan): Jawaban {
    const kelas = p.params["filter[jenis]"] === "KELAS";
    const halaman2 = p.params["page"] === 2;
    const data = kelas
        ? [halaman2 ? { id: "130", nama: "Kelas XII-9", kode: "KELAS-XII9", jenis: "KELAS", status: "AKTIF" } : { id: "30", nama: "Kelas XI-1", kode: "KELAS-XI1", jenis: "KELAS", status: "AKTIF" }]
        : [halaman2 ? { id: "2", nama: "Tata Usaha", kode: "TU-01", jenis: "TATA_USAHA", status: "NONAKTIF" } : { id: "3", nama: "Perpustakaan", kode: "PUS-01", jenis: "LAINNYA", status: "AKTIF" }];
    return { status: 200, data: { success: true, data, meta: { page: halaman2 ? 2 : 1, per_page: 100, total: 101, total_pages: 2 } } };
}

function server(o: { izin?: readonly string[]; buat?: (p: Permintaan) => Jawaban | Promise<Jawaban>; promosi?: (p: Permintaan) => Jawaban; reset?: (p: Permintaan) => Jawaban } = {}) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(me(o.izin ?? SEMUA));
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        if (p.url === "/users" && p.method === "GET") return daftar(p.params["filter[role_id]"] === "7" ? [SISWA] : [PENGGUNA]);
        if (p.url === "/users" && p.method === "POST") return o.buat?.(p) ?? { status: 201, data: { success: true, data: { ...PENGGUNA, id: "12", nama: "Pak Baru", password_sementara: "Rahasia-Sekali-123" }, meta: null } };
        if (p.url === "/users/5" && p.method === "GET") return sukses(PENGGUNA);
        if (p.url === "/users/12" && p.method === "GET") return sukses({ ...PENGGUNA, id: "12", nama: "Pak Baru" });
        if (p.url === "/users/5" && p.method === "PUT") return sukses({ ...PENGGUNA, ...(p.data as object), work_unit_id: "2" });
        if (p.url === "/users/5/status") return sukses({ ...PENGGUNA, status: "NONAKTIF" });
        if (p.url === "/users/5/reset-password") return o.reset?.(p) ?? sukses({ user_id: "5", permintaan_id: "3", password_sementara: "Sementara-XYZ-789", berlaku_sampai: "2026-10-12T01:00:00.000Z" });
        if (p.url === "/roles") return sukses(ROLES);
        if (p.url === "/work-units") return unitKerja(p);
        if (p.url === "/academic-years") return daftar([{ id: "4", nama: "2026/2027", is_active: true, tanggal_mulai: "2026-07-13", tanggal_selesai: "2027-06-30", semester: [] }]);
        if (p.url === "/class-promotions") return o.promosi?.(p) ?? sukses({ total: 1, sukses: 0, gagal: 1, baris: [{ user_id: 9, tindakan: "LULUS", status: "GAGAL", pesan: "Masih memiliki kewajiban aktif.", kewajiban: [{ jenis: "PEMINJAMAN", keterangan: "Peminjaman PJM-2026-0001 belum kembali" }] }] });
        if (p.url === "/users/import/template") return { status: 200, data: new Blob(["xlsx"]) };
        if (p.url === "/users/import" && p.method === "POST") return { status: 200, data: { success: true, data: { id: "8", status: "SELESAI", nama_berkas: "guru.csv", total: 2, terproses: 2, sukses: 1, gagal: 1, laporan_gagal: [{ baris: 3, email: "x@sekolah.sch.id", pesan: "Email sudah terdaftar." }], pesan_galat: null }, meta: { idempotent_replay: false } } };
        if (p.url === "/users/import/8") return sukses({ id: "8", status: "SELESAI", nama_berkas: "guru.csv", total: 2, terproses: 2, sukses: 1, gagal: 1, laporan_gagal: [{ baris: 3, email: "x@sekolah.sch.id", pesan: "Email sudah terdaftar." }], pesan_galat: null });
        return { status: 404 };
    });
}

afterEach(() => vi.unstubAllGlobals());

describe("P-60 Pengguna", () => {
    it("tabel dengan nama role & unit, saringan ke URL dan `filter[...]`; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container, router } = await renderAplikasi("/pengguna");
        const tabel = await screen.findByRole("table");
        expect(within(tabel).getByRole("link", { name: "Bu Sari" }).getAttribute("href")).toBe("/pengguna/5");
        await waitFor(() => expect(within(tabel).getByText("Guru")).toBeTruthy());
        expect(within(tabel).getByText("Tata Usaha")).toBeTruthy();
        await user.selectOptions(screen.getByLabelText("Status"), "NONAKTIF");
        await waitFor(() => expect(router.state.location.search).toMatchObject({ status: "NONAKTIF" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/users").at(-1)?.params).toMatchObject({ "filter[status]": "NONAKTIF" }));
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("aksi mengikuti permission: hanya user.view → tanpa Tambah/Impor/Kenaikan, tanpa saringan role/unit dan tanpa GET /roles", async () => {
        const log = server({ izin: ["user.view"] });
        await renderAplikasi("/pengguna");
        await screen.findByRole("table");
        expect(screen.queryByRole("link", { name: "Tambah Pengguna" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Impor Pengguna" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Kenaikan Kelas Massal" })).toBeNull();
        expect(screen.queryByLabelText("Role")).toBeNull();
        expect(log.some((p) => p.url === "/roles" || p.url === "/work-units")).toBe(false);
    });

    it("tautan Role & Permission menuju P-65 bagi pemegang role.view (PR-01-20)", async () => {
        server();
        await renderAplikasi("/pengguna");
        await screen.findByRole("table");
        expect(screen.getByRole("link", { name: "Role & Permission" }).getAttribute("href")).toBe("/role");
        expect(screen.getByRole("link", { name: "Tambah Pengguna" }).getAttribute("href")).toBe("/pengguna/baru");
    });

    it("drill-down dashboard `?filter[status]=AKTIF` (UX §8.3) tersaring sama seperti `?status=`", async () => {
        const log = server();
        await renderAplikasi("/pengguna?filter[status]=AKTIF");
        await screen.findByRole("table");
        expect(log.find((p) => p.url === "/users")?.params).toMatchObject({ "filter[status]": "AKTIF" });
        expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("AKTIF");
    });

    it("tanpa user.view → P-08 (PM-04)", async () => {
        server({ izin: [] });
        const { router } = await renderAplikasi("/pengguna");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-61 Tambah Pengguna", () => {
    it("validasi isian; consent wali wajib bagi Siswa; galat server per isian; tanpa pelanggaran axe", async () => {
        const log = server({ buat: () => ({ status: 422, data: { success: false, error: { code: "VALIDATION_ERROR", message: "Data tidak valid", details: [{ field: "email", message: "Email sudah terdaftar." }] }, request_id: "r" } }) });
        const user = userEvent.setup();
        const { container } = await renderAplikasi("/pengguna/baru");
        await user.click(await screen.findByRole("button", { name: "Simpan pengguna" }));
        expect(screen.getByText("Nama wajib diisi.")).toBeTruthy();
        expect(log.some((p) => p.url === "/users" && p.method === "POST")).toBe(false);
        await user.type(screen.getByLabelText(/Nama lengkap/), "Andi");
        await user.type(screen.getByLabelText(/Email/), "andi@sekolah.sch.id");
        await user.type(screen.getByLabelText(/NIP\/NIS/), "0099");
        await waitFor(() => expect(screen.getByRole("option", { name: "Siswa/OSIS" })).toBeTruthy());
        await user.selectOptions(screen.getByLabelText(/^Role/), "7");
        await user.click(screen.getByRole("button", { name: "Simpan pengguna" }));
        expect(screen.getByText(/wajib disertai persetujuan wali/)).toBeTruthy();
        await user.click(screen.getByRole("checkbox", { name: "Persetujuan wali sudah dikumpulkan sekolah" }));
        await user.click(screen.getByRole("button", { name: "Simpan pengguna" }));
        expect(await screen.findByText("Email sudah terdaftar.")).toBeTruthy();
        expect(log.find((p) => p.url === "/users" && p.method === "POST")?.data).toMatchObject({ role_id: 7, consent_wali: true });
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("sukses → P-63 dengan password sementara SEKALI: tidak di URL, history.state, maupun cache query; Back/Forward tidak menampilkannya lagi", async () => {
        server();
        const user = userEvent.setup();
        const { router, queryClient } = await renderAplikasi("/pengguna/baru");
        await user.type(await screen.findByLabelText(/Nama lengkap/), "Pak Baru");
        await user.type(screen.getByLabelText(/Email/), "baru@sekolah.sch.id");
        await user.type(screen.getByLabelText(/NIP\/NIS/), "1977");
        await waitFor(() => expect(screen.getByRole("option", { name: "Guru" })).toBeTruthy());
        await user.selectOptions(screen.getByLabelText(/^Role/), "5");
        await user.click(screen.getByRole("button", { name: "Simpan pengguna" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/pengguna/12"));
        expect(await screen.findByText("Rahasia-Sekali-123")).toBeTruthy();
        const jejak = JSON.stringify([router.state.location, window.history.state, queryClient.getQueryCache().getAll().map((q) => q.state.data), queryClient.getMutationCache().getAll().map((m) => m.state.data)]);
        expect(jejak).not.toContain("Rahasia-Sekali-123");
        router.history.back();
        await waitFor(() => expect(router.state.location.pathname).toBe("/pengguna/baru"));
        router.history.forward();
        await waitFor(() => expect(router.state.location.pathname).toBe("/pengguna/12"));
        await screen.findByRole("heading", { name: "Pak Baru" });
        expect(screen.queryByText("Rahasia-Sekali-123")).toBeNull();
    });

    it("user.create tanpa role.view → Peringatan, tombol simpan nonaktif, tanpa GET /roles (§1a)", async () => {
        const log = server({ izin: ["user.create"] });
        await renderAplikasi("/pengguna/baru");
        expect(await screen.findByText("Role tidak dapat dipilih")).toBeTruthy();
        expect((screen.getByRole("button", { name: "Simpan pengguna" }) as HTMLButtonElement).disabled).toBe(true);
        expect(log.some((p) => p.url === "/roles")).toBe(false);
    });

    it("role.view tanpa user.view → password ditampilkan di P-61, tidak terdampar di P-08 (§1a)", async () => {
        server({ izin: ["user.create", "role.view"] });
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/pengguna/baru");
        await user.type(await screen.findByLabelText(/Nama lengkap/), "Pak Baru");
        await user.type(screen.getByLabelText(/Email/), "baru@sekolah.sch.id");
        await user.type(screen.getByLabelText(/NIP\/NIS/), "1977");
        await waitFor(() => expect(screen.getByRole("option", { name: "Guru" })).toBeTruthy());
        await user.selectOptions(screen.getByLabelText(/^Role/), "5");
        await user.click(screen.getByRole("button", { name: "Simpan pengguna" }));
        expect(await screen.findByText("Rahasia-Sekali-123")).toBeTruthy();
        expect(router.state.location.pathname).toBe("/pengguna/baru");
    });

    it("tanpa user.create → P-08", async () => {
        server({ izin: ["user.view"] });
        const { router } = await renderAplikasi("/pengguna/baru");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("Temuan inspeksi PR-01-19", () => {
    it("R-01: ubah tanpa setting.view MEMPERTAHANKAN unit kerja lama (PUT pengganti penuh)", async () => {
        const log = server({ izin: ["user.view", "user.update", "role.view"] });
        const user = userEvent.setup();
        await renderAplikasi("/pengguna/5?aksi=ubah");
        await user.clear(await screen.findByLabelText(/Telepon/));
        await user.type(screen.getByLabelText(/Telepon/), "0811");
        await waitFor(() => expect(screen.getByRole("option", { name: "Guru" })).toBeTruthy());
        await user.click(screen.getByRole("button", { name: "Simpan perubahan" }));
        await waitFor(() => expect(log.find((p) => p.url === "/users/5" && p.method === "PUT")?.data).toMatchObject({ work_unit_id: 2, telepon: "0811" }));
    });

    it("R-02: unit kerja dimuat seluruh halaman; unit NONAKTIF tetap bernama; kelas di halaman 2 dapat dipilih", async () => {
        const log = server();
        await renderAplikasi("/pengguna");
        const tabel = await screen.findByRole("table");
        await waitFor(() => expect(within(tabel).getByText("Tata Usaha")).toBeTruthy());
        expect(log.filter((p) => p.url === "/work-units").map((p) => p.params["page"])).toEqual([1, 2]);
        await renderAplikasi("/pengguna/kenaikan-kelas");
        await waitFor(() => expect(screen.getAllByRole("option", { name: "Naik ke Kelas XII-9" }).length).toBeGreaterThan(0));
    });

    it("R-03: password yang tiba sesudah P-61 ditinggalkan tidak dititipkan maupun ditampilkan", async () => {
        let lepas: (j: Jawaban) => void = () => undefined;
        server({ buat: () => new Promise<Jawaban>((r) => { lepas = r; }) });
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/pengguna/baru");
        await user.type(await screen.findByLabelText(/Nama lengkap/), "Pak Baru");
        await user.type(screen.getByLabelText(/Email/), "baru@sekolah.sch.id");
        await user.type(screen.getByLabelText(/NIP\/NIS/), "1977");
        await waitFor(() => expect(screen.getByRole("option", { name: "Guru" })).toBeTruthy());
        await user.selectOptions(screen.getByLabelText(/^Role/), "5");
        await user.click(screen.getByRole("button", { name: "Simpan pengguna" }));
        await router.navigate({ to: "/pengguna" });
        lepas({ status: 201, data: { success: true, data: { ...PENGGUNA, id: "12", nama: "Pak Baru", password_sementara: "Terlambat-456" }, meta: null } });
        await new Promise((r) => setTimeout(r, 20));
        expect(router.state.location.pathname).toBe("/pengguna");
        await router.navigate({ to: "/pengguna/$id", params: { id: "12" } });
        await screen.findByRole("heading", { name: "Pak Baru" });
        expect(screen.queryByText("Terlambat-456")).toBeNull();
    });

    it("R-03: sesi berakhir (cache /me dikosongkan) membuang titipan yang belum diambil", async () => {
        const { titipRahasia, ambilRahasia } = await import("../../src/modules/m02-users/rahasia");
        const { queryClient } = (server(), await renderAplikasi("/pengguna"));
        await screen.findByRole("table");
        titipRahasia("buat:77", "Sisa-Sesi-Lama");
        queryClient.clear();
        expect(ambilRahasia("buat:77")).toBeNull();
    });
});

describe("Temuan inspeksi PR-01-19 ronde 2", () => {
    it("BR-069 di UI: menyunting akun sendiri mengunci email & role; simpan menyegarkan /me", async () => {
        const log = pasangServer((p) => {
            if (p.url === "/me") return sukses({ ...me(SEMUA), user: { ...ME_ADMIN.user, id: "5" } });
            if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
            if (p.url === "/users/5" && p.method === "GET") return sukses(PENGGUNA);
            if (p.url === "/users/5" && p.method === "PUT") return sukses({ ...PENGGUNA, nama: "Bu Sari Baru" });
            if (p.url === "/roles") return sukses(ROLES);
            if (p.url === "/work-units") return unitKerja(p);
            return { status: 404 };
        });
        const user = userEvent.setup();
        await renderAplikasi("/pengguna/5?aksi=ubah");
        expect((await screen.findByLabelText(/^Email/) as HTMLInputElement).disabled).toBe(true);
        await waitFor(() => expect((screen.getByLabelText(/^Role/) as HTMLSelectElement).disabled).toBe(true));
        const sebelum = log.filter((p) => p.url === "/me").length;
        await user.click(screen.getByRole("button", { name: "Simpan perubahan" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/me").length).toBeGreaterThan(sebelum));
    });

    it("galat server BR-068 pada role tampil di isian Role", async () => {
        pasangServer((p) => {
            if (p.url === "/me") return sukses(me(SEMUA));
            if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
            if (p.url === "/users/5" && p.method === "GET") return sukses({ ...PENGGUNA, role_id: "1" });
            if (p.url === "/users/5" && p.method === "PUT") return { status: 422, data: { success: false, error: { code: "VALIDATION_ERROR", message: "Data tidak valid", details: [{ field: "role_id", message: "Penggantian role ditolak — sistem wajib memiliki minimal dua akun Administrator aktif." }] }, request_id: "r" } };
            if (p.url === "/roles") return sukses(ROLES);
            if (p.url === "/work-units") return unitKerja(p);
            return { status: 404 };
        });
        const user = userEvent.setup();
        await renderAplikasi("/pengguna/5?aksi=ubah");
        await waitFor(() => expect(screen.getByRole("option", { name: "Guru" })).toBeTruthy());
        await user.selectOptions(screen.getByLabelText(/^Role/), "5");
        await user.click(screen.getByRole("button", { name: "Simpan perubahan" }));
        expect(await screen.findByText(/minimal dua akun Administrator aktif/)).toBeTruthy();
    });

    it("P-64: siswa yang berhasil diproses keluar dari antrean; tombol kembali ke 0", async () => {
        server({ promosi: () => sukses({ total: 1, sukses: 1, gagal: 0, baris: [{ user_id: 9, tindakan: "LULUS", status: "SUKSES", pesan: null, kewajiban: [] }] }) });
        const user = userEvent.setup();
        await renderAplikasi("/pengguna/kenaikan-kelas");
        await screen.findByRole("row", { name: /Andi Siswa/ });
        await user.selectOptions(screen.getByLabelText("Tahun ajaran", { exact: false }), "4");
        await user.selectOptions(screen.getByLabelText("Tindakan untuk Andi Siswa"), "LULUS");
        await user.click(screen.getByRole("button", { name: "Proses 1 siswa" }));
        expect(await screen.findByText(/1 berhasil, 0 gagal/)).toBeTruthy();
        expect((screen.getByRole("button", { name: "Proses 0 siswa" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByLabelText("Tindakan untuk Andi Siswa") as HTMLSelectElement).value).toBe("");
    });
});

describe("P-62 Impor Pengguna", () => {
    it("unduh templat dari server, unggah, laporan per baris di URL; tanpa pelanggaran axe", async () => {
        vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }));
        const log = server();
        const user = userEvent.setup();
        const { container, router } = await renderAplikasi("/pengguna/impor");
        await user.click(await screen.findByRole("button", { name: "Unduh templat XLSX" }));
        await waitFor(() => expect(log.some((p) => p.url === "/users/import/template")).toBe(true));
        await user.upload(screen.getByLabelText(/Berkas impor/), new File(["nama_lengkap\n"], "guru.csv", { type: "text/csv" }));
        await user.click(screen.getByRole("button", { name: "Mulai impor" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ job: 8 }));
        expect(await screen.findByText("Email sudah terdaftar.")).toBeTruthy();
        expect(log.find((p) => p.url === "/users/import" && p.method === "POST")?.data).toMatchObject({ filename: "guru.csv" });
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("tanpa user.create → P-08", async () => {
        server({ izin: ["user.view"] });
        const { router } = await renderAplikasi("/pengguna/impor");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("P-63 Detail Pengguna", () => {
    it("profil + aksi berizin; tanpa pelanggaran axe", async () => {
        server();
        const { container } = await renderAplikasi("/pengguna/5");
        expect(await screen.findByRole("heading", { name: "Bu Sari" })).toBeTruthy();
        for (const n of ["Ubah", "Nonaktifkan", "Reset Password", "Reset 2FA", "Terbitkan Kode Aktivasi 2FA"]) expect(screen.getByRole("button", { name: n })).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Riwayat Perubahan" })).toBeNull();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("hanya user.view → tidak ada satu pun aksi", async () => {
        server({ izin: ["user.view"] });
        await renderAplikasi("/pengguna/5");
        await screen.findByRole("heading", { name: "Bu Sari" });
        expect(screen.queryByRole("button", { name: /Ubah|Nonaktifkan|Reset|Terbitkan/ })).toBeNull();
    });

    it("nonaktifkan butuh alasan; PATCH membawa alasan", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/pengguna/5");
        await user.click(await screen.findByRole("button", { name: "Nonaktifkan" }));
        const dialog = await screen.findByRole("dialog");
        expect((within(dialog).getByRole("button", { name: "Nonaktifkan" }) as HTMLButtonElement).disabled).toBe(true);
        await user.type(within(dialog).getByLabelText(/Alasan penonaktifan/), "Pindah tugas");
        await user.click(within(dialog).getByRole("button", { name: "Nonaktifkan" }));
        await waitFor(() => expect(log.find((p) => p.url === "/users/5/status")?.data).toEqual({ status: "NONAKTIF", alasan: "Pindah tugas" }));
    });

    it("reset password: metode wajib; password tampil sekali dan tidak masuk cache; galat server ditampilkan", async () => {
        const log = server();
        const user = userEvent.setup();
        const { queryClient, router } = await renderAplikasi("/pengguna/5");
        await user.click(await screen.findByRole("button", { name: "Reset Password" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ aksi: "reset-password" }));
        const drawer = screen.getByRole("dialog", { name: /Reset password/ });
        await user.click(within(drawer).getByRole("button", { name: "Reset password" }));
        expect(screen.getByText("Metode verifikasi wajib dipilih.")).toBeTruthy();
        expect(log.some((p) => p.url === "/users/5/reset-password")).toBe(false);
        await user.selectOptions(within(drawer).getByLabelText(/Metode verifikasi/), "KARTU_IDENTITAS_TATAP_MUKA");
        await user.click(within(drawer).getByRole("button", { name: "Reset password" }));
        expect(await screen.findByText("Sementara-XYZ-789")).toBeTruthy();
        expect(log.find((p) => p.url === "/users/5/reset-password")?.data).toEqual({ metode_verifikasi: "KARTU_IDENTITAS_TATAP_MUKA" });
        expect(JSON.stringify([router.state.location, queryClient.getQueryCache().getAll().map((q) => q.state.data), queryClient.getMutationCache().getAll().map((m) => m.state.data)])).not.toContain("Sementara-XYZ-789");
        await user.click(screen.getByRole("button", { name: "Sudah saya catat, tutup" }));
        expect(screen.queryByText("Sementara-XYZ-789")).toBeNull();
    });

    it("reset password ditolak server → pesan server tampil", async () => {
        server({ reset: () => gagal(403, "INSUFFICIENT_PERMISSION", "Anda tidak memiliki izin untuk aksi ini.") });
        const user = userEvent.setup();
        await renderAplikasi("/pengguna/5?aksi=reset-password");
        const drawer = await screen.findByRole("dialog", { name: /Reset password/ });
        await user.selectOptions(within(drawer).getByLabelText(/Metode verifikasi/), "KARTU_IDENTITAS_TATAP_MUKA");
        await user.click(within(drawer).getByRole("button", { name: "Reset password" }));
        expect(await screen.findByText("Anda tidak memiliki izin untuk aksi ini.")).toBeTruthy();
    });

    it("`?aksi=reset-2fa` tanpa user.reset_2fa → drawer tidak dirender", async () => {
        server({ izin: ["user.view", "user.update"] });
        await renderAplikasi("/pengguna/5?aksi=reset-2fa");
        await screen.findByRole("heading", { name: "Bu Sari" });
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});

describe("P-64 Kenaikan Kelas Massal", () => {
    it("tetapkan tindakan, kirim items, siswa terblokir SL-04 ditampilkan; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container } = await renderAplikasi("/pengguna/kenaikan-kelas");
        await screen.findByRole("row", { name: /Andi Siswa/ });
        await user.selectOptions(screen.getByLabelText("Tahun ajaran", { exact: false }), "4");
        await user.selectOptions(screen.getByLabelText("Tindakan untuk Andi Siswa"), "LULUS");
        await user.click(screen.getByRole("button", { name: "Proses 1 siswa" }));
        expect(await screen.findByText(/Siswa terblokir oleh kewajiban aktif/)).toBeTruthy();
        expect(screen.getByText(/PJM-2026-0001/)).toBeTruthy();
        expect(log.find((p) => p.url === "/class-promotions")?.data).toEqual({ academic_year_id: 4, items: [{ user_id: 9, tindakan: "LULUS" }] });
        expect(log.find((p) => p.url === "/users")?.params).toMatchObject({ "filter[role_id]": "7", "filter[status]": "AKTIF" });
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("naikkan terpilih massal ke kelas", async () => {
        const log = server({ promosi: () => sukses({ total: 1, sukses: 1, gagal: 0, baris: [{ user_id: 9, tindakan: "NAIK", status: "SUKSES", pesan: null, kewajiban: [] }] }) });
        const user = userEvent.setup();
        await renderAplikasi("/pengguna/kenaikan-kelas");
        await screen.findByRole("row", { name: /Andi Siswa/ });
        await user.selectOptions(screen.getByLabelText("Tahun ajaran", { exact: false }), "4");
        await user.click(screen.getByRole("checkbox", { name: "Pilih Andi Siswa" }));
        await user.selectOptions(screen.getByLabelText("Kelas untuk siswa terpilih"), "30");
        await user.click(screen.getByRole("button", { name: "Naikkan terpilih" }));
        await user.click(screen.getByRole("button", { name: "Proses 1 siswa" }));
        await waitFor(() => expect(log.find((p) => p.url === "/class-promotions")?.data).toEqual({ academic_year_id: 4, items: [{ user_id: 9, tindakan: "NAIK", kelas_id: 30 }] }));
    });

    it("user.update + setting.view tanpa user.view/role.view → Peringatan, tanpa GET /users maupun /roles (§1a)", async () => {
        const log = server({ izin: ["user.update", "setting.view"] });
        await renderAplikasi("/pengguna/kenaikan-kelas");
        expect(await screen.findByText(/membutuhkan izin user\.view, role\.view/)).toBeTruthy();
        expect(log.some((p) => p.url === "/users" || p.url === "/roles" || p.url === "/academic-years")).toBe(false);
    });

    it("tanpa user.update → P-08", async () => {
        server({ izin: ["user.view"] });
        const { router } = await renderAplikasi("/pengguna/kenaikan-kelas");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });
});

describe("Perbaikan: P-64 tahun ajaran terkunci selama proses; P-60 halaman di luar jangkauan", () => {
    it("selama kenaikan kelas diproses, tahun ajaran, pilihan, tindakan, dan halaman terkunci; tahun ikut dikirim", async () => {
        let lepas: (j: Jawaban) => void = () => undefined;
        const log = server({ promosi: () => new Promise<Jawaban>((r) => { lepas = r; }) as unknown as Jawaban });
        const user = userEvent.setup();
        await renderAplikasi("/pengguna/kenaikan-kelas");
        await screen.findByRole("row", { name: /Andi Siswa/ });
        await user.selectOptions(screen.getByLabelText("Tahun ajaran", { exact: false }), "4");
        await user.selectOptions(screen.getByLabelText("Tindakan untuk Andi Siswa"), "LULUS");
        await user.click(screen.getByRole("button", { name: "Proses 1 siswa" }));
        await waitFor(() => expect((screen.getByLabelText("Tahun ajaran", { exact: false }) as HTMLSelectElement).disabled).toBe(true));
        expect((screen.getByLabelText("Tindakan untuk Andi Siswa") as HTMLSelectElement).disabled).toBe(true);
        expect((screen.getByRole("checkbox", { name: "Pilih Andi Siswa" }) as HTMLButtonElement).disabled).toBe(true);
        expect(log.find((p) => p.url === "/class-promotions")?.data).toEqual({ academic_year_id: 4, items: [{ user_id: 9, tindakan: "LULUS" }] });
        lepas(sukses({ total: 1, sukses: 1, gagal: 0, baris: [{ user_id: 9, tindakan: "LULUS", status: "SUKSES", pesan: null, kewajiban: [] }] }));
        await waitFor(() => expect((screen.getByLabelText("Tahun ajaran", { exact: false }) as HTMLSelectElement).disabled).toBe(false));
    });

    it("P-60: halaman di luar jangkauan dikembalikan ke halaman terakhir yang ada", async () => {
        server();
        const { router } = await renderAplikasi("/pengguna?page=4");
        await waitFor(() => expect(router.state.location.search).not.toHaveProperty("page"));
        expect(await screen.findByRole("link", { name: "Bu Sari" })).toBeTruthy();
    });
});
