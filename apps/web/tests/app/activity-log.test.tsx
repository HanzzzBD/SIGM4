// P-73 Activity Log dan P-74 Detail Entri Log (FR-18.2, AL-10; PR-01-25) — aplikasi utuh lewat router dan klien HTTP
// produksi. Fokus: saringan → `filter[...]`, ekspor berizin + pesan galat server, tabel dua kolom berlabel dengan
// sorotan perubahan, penolakan izin, axe.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

const me = (izin: readonly string[]) => ({ ...ME_ADMIN, permissions: { "dashboard.view": "all", "notification.manage_own": "all", ...Object.fromEntries(izin.map((p) => [p, "all"])) } });

const ENTRI = {
    id: "77",
    waktu: "2026-10-10T03:15:00.000Z",
    user_id: "1",
    user_nama: "Admin Uji",
    role: "R-01",
    ip: "10.0.0.5",
    user_agent: "Mozilla/5.0",
    modul: "m02-users",
    aksi: "USER_UPDATED",
    entitas: "users",
    entitas_id: "5",
    nilai_sebelum: { nama: "Bu Sari", telepon: null, work_unit_id: "2", alamat: { kota: "Bandung" } },
    nilai_sesudah: { nama: "Bu Sari W.", telepon: null, work_unit_id: "3", alamat: { kota: "Bandung" } },
    keterangan: null,
    hasil: "SUKSES",
    request_id: "req-77",
};
const ROLE_LOG = { ...ENTRI, id: "78", aksi: "ROLE_PERMISSION_UPDATED", entitas: "roles", entitas_id: "4", nilai_sebelum: [{ kode: "user.view", scope: "ALL" }, { kode: "role.view", scope: "ALL" }], nilai_sesudah: [{ kode: "user.view", scope: "OWN" }, { kode: "damage.view", scope: "ALL" }] };
/** Pelaku sistem: `AuditLogger.writeSystem` menyimpan kode PELAKU_SISTEM sebagai nama. */
const SISTEM = { ...ENTRI, id: "79", user_id: null, user_nama: "SYSTEM", role: "SYSTEM", aksi: "APPROVAL_SLA_REMINDED", nilai_sebelum: null, nilai_sesudah: null, hasil: "GAGAL" };
/** Tanpa sesi: `AuditLogger.writeAnonim` (LOGIN_FAILED) — tanpa pengguna, tanpa nama, tanpa role. */
const ANONIM = { ...ENTRI, id: "80", user_id: null, user_nama: null, role: null, modul: "m01-auth", aksi: "LOGIN_FAILED", entitas: null, entitas_id: null, nilai_sebelum: null, nilai_sesudah: null, hasil: "GAGAL" };

function server(o: { izin?: readonly string[]; ekspor?: (p: Permintaan) => Jawaban } = {}) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(me(o.izin ?? ["activity_log.view", "activity_log.export", "user.view"]));
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        if (p.url === "/activity-logs") return { status: 200, data: { success: true, data: [ENTRI, ROLE_LOG, SISTEM, ANONIM], meta: { page: 1, per_page: 25, total: 60, total_pages: 3 } } };
        if (p.url === "/activity-logs/export") return o.ekspor?.(p) ?? { status: 200, data: new Blob(["xlsx"]) };
        if (p.url === "/activity-logs/77") return sukses(ENTRI);
        if (p.url === "/activity-logs/78") return sukses(ROLE_LOG);
        if (p.url === "/activity-logs/79") return sukses(SISTEM);
        if (p.url === "/activity-logs/404") return gagal(404, "NOT_FOUND", "Entri activity log tidak ditemukan.");
        if (p.url === "/users") return { status: 200, data: { success: true, data: [{ id: "1", nama: "Admin Uji" }, { id: "5", nama: "Bu Sari" }], meta: { page: 1, per_page: 100, total: 2, total_pages: 1 } } };
        return { status: 404 };
    });
}

afterEach(() => vi.unstubAllGlobals());

describe("P-73 Activity Log", () => {
    it("daftar terbaru dengan pelaku (Sistem bila null) & hasil bertulisan; tautan ke P-74; tanpa pelanggaran axe", async () => {
        server();
        const { container } = await renderAplikasi("/activity-log");
        const tabel = await screen.findByRole("table");
        expect(within(tabel).getAllByRole("link")[0]?.getAttribute("href")).toMatch(/^\/activity-log\/77\?kembali=/);
        expect(within(tabel).getByText("Sistem")).toBeTruthy();
        // R1 inspeksi: LOGIN_FAILED tanpa sesi bukan "Sistem".
        expect(within(within(tabel).getByRole("row", { name: /LOGIN_FAILED/ })).getByText("Anonim (tanpa sesi)")).toBeTruthy();
        expect(within(tabel).getAllByText("Gagal").length).toBe(2);
        expect(screen.getByText(/60 entri/)).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("saringan → URL → `filter[...]`; tanggal WIB menjadi batas hari +07:00; alias Riwayat Perubahan (entitas/entitas_id)", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/activity-log?entitas=users&entitas_id=5");
        await screen.findByRole("table");
        expect(log.filter((p) => p.url === "/activity-logs").at(-1)?.params).toMatchObject({ "filter[entitas]": "users", "filter[entitas_id]": "5" });
        await user.type(screen.getByLabelText("Dari tanggal"), "2026-10-01");
        await waitFor(() => expect(router.state.location.search).toMatchObject({ dari: "2026-10-01" }));
        await user.selectOptions(await screen.findByLabelText("Pengguna"), "5");
        await user.type(screen.getByLabelText("Jenis aksi"), "USER_UPDATED");
        await user.click(screen.getByRole("button", { name: "Terapkan saringan" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/activity-logs").at(-1)?.params).toMatchObject({ "filter[dari]": "2026-10-01T00:00:00.000+07:00", "filter[user_id]": "5", "filter[aksi]": "USER_UPDATED", "filter[entitas]": "users" }));
    });

    it("drill-down dashboard `filter[aksi]` diterima sebagai saringan aksi", async () => {
        const log = server();
        await renderAplikasi("/activity-log?filter[aksi]=LOGIN_SUCCESS");
        await screen.findByRole("table");
        expect(log.filter((p) => p.url === "/activity-logs").at(-1)?.params).toMatchObject({ "filter[aksi]": "LOGIN_SUCCESS" });
    });

    it("ekspor XLSX membawa saringan; galat server (FR-18.2 A1) tampil dari badan Blob", async () => {
        vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }));
        const log = server({ ekspor: () => ({ status: 422, data: new Blob([JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "Hasil ekspor melebihi 50.000 baris; persempit rentang tanggal." }, request_id: "r" })], { type: "application/json" }) }) });
        const user = userEvent.setup();
        await renderAplikasi("/activity-log?modul=m02-users");
        await user.click(await screen.findByRole("button", { name: "Ekspor XLSX" }));
        expect(await screen.findByText(/persempit rentang tanggal/)).toBeTruthy();
        expect(log.find((p) => p.url === "/activity-logs/export")?.params).toMatchObject({ "filter[modul]": "m02-users" });
    });

    it("tanpa activity_log.export → tanpa tombol ekspor; tanpa user.view → tanpa saringan pengguna dan tanpa GET /users", async () => {
        const log = server({ izin: ["activity_log.view"] });
        await renderAplikasi("/activity-log");
        await screen.findByRole("table");
        expect(screen.queryByRole("button", { name: "Ekspor XLSX" })).toBeNull();
        expect(screen.queryByLabelText("Pengguna")).toBeNull();
        expect(log.some((p) => p.url === "/users")).toBe(false);
    });

    it("tanpa activity_log.view → P-08 (P-73 dan P-74)", async () => {
        for (const path of ["/activity-log", "/activity-log/77"]) {
            server({ izin: ["user.view"] });
            const { router } = await renderAplikasi(path);
            await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
        }
    });
});

describe("P-74 Detail Entri Log", () => {
    it("tabel dua kolom berlabel; field berubah disorot + 'Berubah'; nilai bersarang berlabel, bukan JSON mentah; tanpa pelanggaran axe", async () => {
        server();
        const { container } = await renderAplikasi("/activity-log/77");
        const tabel = await screen.findByRole("table", { name: "Perbandingan nilai sebelum dan sesudah" });
        const nama = within(tabel).getByRole("row", { name: /^Nama/ });
        expect(within(nama).getByText("Berubah")).toBeTruthy();
        expect(nama.className).toContain("bg-warning-subtle");
        const telepon = within(tabel).getByRole("row", { name: /^Telepon/ });
        expect(within(telepon).queryByText("Berubah")).toBeNull();
        expect(telepon.className).not.toContain("bg-warning-subtle");
        expect(within(tabel).getByRole("row", { name: /^Work unit \(ID\)/ })).toBeTruthy();
        expect(within(tabel).getAllByText("Kota:").length).toBe(2);
        expect(container.textContent).not.toContain("{\"");
        expect(screen.getByRole("link", { name: "users #5" }).getAttribute("href")).toBe("/pengguna/5");
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("ROLE_PERMISSION_UPDATED: per kode dengan status Diubah/Ditambahkan/Dicabut", async () => {
        server();
        await renderAplikasi("/activity-log/78");
        const tabel = await screen.findByRole("table", { name: "Perbandingan nilai sebelum dan sesudah" });
        expect(within(within(tabel).getByRole("row", { name: /user\.view/ })).getByText("Diubah")).toBeTruthy();
        expect(within(within(tabel).getByRole("row", { name: /damage\.view/ })).getByText("Ditambahkan")).toBeTruthy();
        expect(within(within(tabel).getByRole("row", { name: /role\.view/ })).getByText("Dicabut")).toBeTruthy();
    });

    it("tanpa nilai tercatat → pesan; entri tidak ada → keadaan galat", async () => {
        server();
        await renderAplikasi("/activity-log/79");
        expect(await screen.findByText("Tidak ada perubahan nilai yang tercatat untuk entri ini.")).toBeTruthy();
        expect(within(screen.getByRole("main")).getByText("Sistem")).toBeTruthy();
        server();
        await renderAplikasi("/activity-log/404");
        expect(await screen.findByText(/Entri activity log tidak ditemukan|tidak ditemukan/)).toBeTruthy();
    });
});

describe("Riwayat Perubahan dari detail entitas (FR-18.2 A2)", () => {
    const pengguna = { id: "5", nama: "Bu Sari", email: "sari@sekolah.sch.id", nip_nis: "1980", role_id: "5", work_unit_id: null, telepon: null, status: "AKTIF", must_change_password: false, login_terakhir_pada: null, consent_guardian_at: null, created_at: "2026-09-01T01:00:00.000Z", updated_at: "2026-09-01T01:00:00.000Z" };
    const dengan = (izin: readonly string[]) =>
        pasangServer((p) => {
            if (p.url === "/me") return sukses(me(izin));
            if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
            if (p.url === "/users/5") return sukses(pengguna);
            return { status: 404 };
        });

    it("P-63 menautkan Activity Log tersaring entitas itu bagi pemegang activity_log.view", async () => {
        dengan(["user.view", "activity_log.view"]);
        await renderAplikasi("/pengguna/5");
        expect((await screen.findByRole("link", { name: "Riwayat Perubahan" })).getAttribute("href")).toBe("/activity-log?entitas=users&entitas_id=5");
    });

    it("tanpa activity_log.view → tautan tidak tampil (bukan jalan buntu ke P-08)", async () => {
        dengan(["user.view"]);
        await renderAplikasi("/pengguna/5");
        await screen.findByRole("heading", { name: "Bu Sari" });
        expect(screen.queryByRole("link", { name: "Riwayat Perubahan" })).toBeNull();
    });
});

describe("Temuan inspeksi PR-01-25", () => {
    it("R2: potret penelusuran — sesudah halaman 1, URL membawa `snap` dan halaman berikutnya dibatasi `filter[sampai]` = potret", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/activity-log");
        await screen.findByRole("table");
        await waitFor(() => expect(router.state.location.search).toMatchObject({ snap: ENTRI.waktu }));
        expect(screen.getByText(/Menampilkan entri hingga/)).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Berikutnya" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/activity-logs").at(-1)?.params).toMatchObject({ page: 2, "filter[sampai]": ENTRI.waktu }));
        await user.click(screen.getByRole("button", { name: "Muat entri terbaru" }));
        await waitFor(() => expect(router.state.location.search).not.toHaveProperty("page"));
    });

    it("R2: `sampai` pengguna lebih awal dari potret → batas yang lebih awal yang dipakai", async () => {
        const log = server();
        await renderAplikasi(`/activity-log?sampai=2026-10-05&snap=${encodeURIComponent(ENTRI.waktu)}`);
        await screen.findByRole("table");
        expect(log.filter((p) => p.url === "/activity-logs").at(-1)?.params).toMatchObject({ "filter[sampai]": "2026-10-05T23:59:59.999+07:00" });
    });

    it("R4: Kembali menuju daftar yang membuka entri (saringan utuh); tujuan tak sah → /activity-log", async () => {
        server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/activity-log?modul=m02-users");
        await screen.findByRole("table");
        await waitFor(() => expect(router.state.location.search).toHaveProperty("snap"));
        // Klik baris (navigasi dalam aplikasi); <a href> polos tidak dinavigasikan jsdom.
        await user.click(within(screen.getByRole("row", { name: /USER_UPDATED/ })).getByText("Admin Uji"));
        await waitFor(() => expect(router.state.location.pathname).toBe("/activity-log/77"));
        await user.click(await screen.findByRole("button", { name: "Kembali ke Activity Log" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/activity-log"));
        expect(router.state.location.search).toMatchObject({ modul: "m02-users" });
        server();
        const { router: r2 } = await renderAplikasi(`/activity-log/77?kembali=${encodeURIComponent("https://contoh.example/curang")}`);
        await user.click(await screen.findByRole("button", { name: "Kembali ke Activity Log" }));
        // Tujuan luar ditolak: daftar tanpa saringan (P-73 lalu menetapkan potretnya sendiri).
        await waitFor(() => expect(r2.state.location.pathname).toBe("/activity-log"));
        expect(r2.state.location.search).not.toHaveProperty("modul");
    });
});

describe("Temuan inspeksi PR-01-25 ronde 2", () => {
    const dasar = (p: Permintaan): Jawaban | undefined => {
        if (p.url === "/me") return sukses(me(["activity_log.view"]));
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        return undefined;
    };
    const halaman1 = (waktu: string): Jawaban => ({ status: 200, data: { success: true, data: [{ ...ENTRI, waktu }], meta: { page: 1, per_page: 25, total: 1, total_pages: 1 } } });

    it("R1: potret tidak lahir dari data pengganti saringan lama; 'Muat entri terbaru' memasang potret dari respons segar", async () => {
        const T_LAMA = "2026-10-01T05:00:00.000Z";
        let terbaru = "2026-10-10T08:00:00.000Z";
        pasangServer((p) => {
            const d = dasar(p);
            if (d !== undefined) return d;
            if (p.url === "/activity-logs") return halaman1(p.params["filter[dari]"] !== undefined ? T_LAMA : terbaru);
            return { status: 404 };
        });
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/activity-log?sampai=2026-10-01");
        await waitFor(() => expect(router.state.location.search).toMatchObject({ snap: terbaru }));
        await user.type(screen.getByLabelText("Dari tanggal"), "2026-09-01");
        await waitFor(() => expect(router.state.location.search).toMatchObject({ dari: "2026-09-01", snap: T_LAMA }));
        // Hapus saringan: baris lama (T_LAMA) masih tampil sebagai pengganti selama permintaan baru berjalan.
        await user.click(screen.getByRole("button", { name: "Hapus saringan" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ snap: terbaru }));
        terbaru = "2026-10-11T09:00:00.000Z";
        await user.click(screen.getByRole("button", { name: "Muat entri terbaru" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ snap: terbaru }));
    });

    it("R2: entri reservasi (entitas `reservations` dari penulisnya) bertaut ke P-31", async () => {
        pasangServer((p) => {
            const d = dasar(p);
            if (d !== undefined) return d;
            if (p.url === "/activity-logs/90") return sukses({ ...ENTRI, id: "90", modul: "m07-reservation-room", aksi: "RESERVATION_CREATED", entitas: "reservations", entitas_id: "123", nilai_sebelum: null, nilai_sesudah: { status: "DIAJUKAN" } });
            return { status: 404 };
        });
        await renderAplikasi("/activity-log/90");
        expect((await screen.findByRole("link", { name: "reservations #123" })).getAttribute("href")).toBe("/reservasi/123");
    });
});
