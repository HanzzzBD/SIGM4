// Acceptance PR-02-30 (keputusan 83): aplikasi utuh di atas router, gerbang sesi, dan klien
// HTTP yang sama dengan produksi — server tiruan pada adapter axios. F-01 (gerbang), P-01,
// P-12 (FR-15.1 AC 4 di sisi klien), sidebar per permission (PM-04), keluar (FR-01.2).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Penangan, Permintaan } from "../helpers";

const MANIFES = {
    templat: "R-01",
    kartu: [
        { id: "permintaan-reset-password", judul: "Permintaan Reset Password", zona: 1, jenis: "AKSI", berperiode: false, drilldown: "P-67" },
        { id: "efek-tertunda-gagal", judul: "Efek Tertunda Gagal", zona: 1, jenis: "PERINGATAN", berperiode: false, drilldown: null },
        { id: "pengguna-aktif", judul: "Total Pengguna Aktif", zona: 2, jenis: "KPI", berperiode: false, drilldown: "P-60?filter[status]=AKTIF" },
        { id: "login-hari-ini", judul: "Login Hari Ini", zona: 2, jenis: "KPI", berperiode: false, drilldown: "P-73" },
        { id: "aktivitas-sistem", judul: "Aktivitas Sistem", zona: 3, jenis: "GRAFIK_GARIS", berperiode: true, drilldown: "P-73" },
    ],
};
const ISI: Record<string, unknown> = {
    "permintaan-reset-password": { jumlah: 2, daftar: [{ id: 1, user_id: 7, nama: "Siti Guru", diminta_pada: "2026-09-30T01:00:00Z" }] },
    "efek-tertunda-gagal": { jumlah: 0, daftar: [] },
    "pengguna-aktif": { total: 4820, per_role: [{ kode: "R-05", nama: "Guru", jumlah: 4800 }, { kode: "R-07", nama: "Siswa / OSIS", jumlah: 20 }] },
    "aktivitas-sistem": { per_hari: [{ tanggal: "2026-09-29", jumlah: 12 }, { tanggal: "2026-09-30", jumlah: 30 }] },
};

let log: Permintaan[] = [];
function server(tambahan?: (p: Permintaan) => ReturnType<Penangan> | undefined) {
    log = pasangServer(async (p) => {
        const t = await tambahan?.(p);
        if (t !== undefined) return t;
        if (p.url === "/me") return sukses(ME_ADMIN);
        if (p.url === "/auth/logout" || p.url === "/auth/logout-all") return { status: 204 };
        if (p.url === "/dashboard") return sukses(MANIFES);
        const kartu = /^\/dashboard\/cards\/(.+)$/.exec(p.url)?.[1];
        if (kartu === "login-hari-ini") return gagal(403, "FORBIDDEN", "Akses ditolak.");
        if (kartu !== undefined) return sukses({ id: kartu, rentang: null, diperbarui_pada: "2026-09-30T02:00:00Z", isi: ISI[kartu] ?? {} });
        return gagal(404, "NOT_FOUND", `Tidak ada: ${p.method} ${p.url}`);
    });
}

describe("gerbang sesi (F-01, SDD-AUTH-09)", () => {
    beforeEach(() => server());

    it("belum masuk → Login dengan tujuan tersimpan; setelah login kembali ke tujuan", async () => {
        let masuk = false;
        server((p) => {
            if (p.url === "/me" && !masuk) return gagal(401, "UNAUTHENTICATED", "Sesi tidak valid.");
            if (p.url === "/auth/refresh") return gagal(401, "UNAUTHENTICATED", "Sesi tidak valid.");
            if (p.url === "/auth/login") {
                masuk = true;
                return sukses({ tokens: null, expires_in: 900, user: { ...ME_ADMIN.user }, permissions: ME_ADMIN.permissions });
            }
            return undefined;
        });
        const { router } = await renderAplikasi("/?rentang=7_hari");
        expect(router.state.location.pathname).toBe("/login");
        expect(router.state.location.search).toMatchObject({ tujuan: "/?rentang=7_hari" });
        await userEvent.type(screen.getByLabelText(/^Email/), "admin@sekolah.sch.id");
        await userEvent.type(screen.getByLabelText(/^Password/), "rahasia");
        await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(router.state.location.search).toMatchObject({ rentang: "7_hari" });
        expect(log.find((p) => p.url === "/auth/login")?.data).toEqual({ email: "admin@sekolah.sch.id", password: "rahasia", platform: "WEB" });
    });

    it.each([
        ["TWO_FACTOR_REQUIRED", "/login/2fa/aktivasi"],
        ["PASSWORD_CHANGE_REQUIRED", "/ganti-password"],
    ])("/me %s → %s (urutan gerbang server)", async (kode, tujuan) => {
        server((p) => (p.url === "/me" ? gagal(403, kode, "Gerbang.") : undefined));
        const { router } = await renderAplikasi("/");
        expect(router.state.location.pathname).toBe(tujuan);
    });

    it("server tak terjangkau → keadaan galat dengan Coba lagi, bukan layar kosong", async () => {
        server((p) => (p.url === "/me" ? gagal(503, "SERVICE_UNAVAILABLE", "x") : undefined));
        await renderAplikasi("/");
        expect(await screen.findByRole("button", { name: /Coba lagi/ })).toBeTruthy();
        expect(screen.getByText("Kode rujukan:")).toBeTruthy();
    });
});

describe("P-01 Login", () => {
    it("401 → satu pesan generik dari server, password dikosongkan; tidak ada navigasi", async () => {
        server((p) => (p.url === "/me" ? gagal(401, "UNAUTHENTICATED", "x") : p.url === "/auth/refresh" ? gagal(401, "UNAUTHENTICATED", "x") : p.url === "/auth/login" ? gagal(401, "UNAUTHENTICATED", "Email atau password salah.") : undefined));
        const { router } = await renderAplikasi("/login");
        await userEvent.type(screen.getByLabelText(/^Email/), "a@b.c");
        await userEvent.type(screen.getByLabelText(/^Password/), "salah");
        await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
        expect((await screen.findByRole("alert")).textContent).toContain("Email atau password salah.");
        expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe("");
        expect(router.state.location.pathname).toBe("/login");
    });

    it("429 → waktu tunggu dari Retry-After (NFR-S-07)", async () => {
        server((p) => (p.url === "/auth/login" ? { ...gagal(429, "RATE_LIMIT_EXCEEDED", "x"), headers: { "retry-after": "37" } } : undefined));
        await renderAplikasi("/login");
        await userEvent.type(screen.getByLabelText(/^Email/), "a@b.c");
        await userEvent.type(screen.getByLabelText(/^Password/), "x");
        await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
        expect((await screen.findByRole("alert")).textContent).toContain("37 detik");
    });

    it.each([
        [{ requires_2fa: true, challenge_token: "c", expires_in: 300 }, "/login/2fa"],
        [{ tokens: null, expires_in: 900, user: { ...ME_ADMIN.user, must_change_password: true }, permissions: {} }, "/ganti-password"],
    ])("akun ber-gerbang → layar gerbangnya", async (data, tujuan) => {
        server((p) => (p.url === "/auth/login" ? sukses(data) : undefined));
        const { router } = await renderAplikasi("/login");
        await userEvent.type(screen.getByLabelText(/^Email/), "a@b.c");
        await userEvent.type(screen.getByLabelText(/^Password/), "x");
        await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
        await waitFor(() => expect(router.state.location.pathname).toBe(tujuan));
    });

    it("identitas: logo SIGM4 ber-alt di halaman masuk; favicon ikon SIGM4 terpasang", async () => {
        server();
        await renderAplikasi("/login");
        expect(screen.getByRole("img", { name: "SIGM4" }).getAttribute("src")).toMatch(/logo-sigm4/);
        const { readFileSync } = await import("node:fs");
        expect(readFileSync("index.html", "utf8")).toContain("<link rel=\"icon\" type=\"image/svg+xml\" href=\"/favicon.svg\" />");
        // Ikon baru putih: tab terang wajib berisi warna gelap agar tetap terlihat, tab gelap putih.
        const favicon = readFileSync("public/favicon.svg", "utf8");
        expect(favicon).toContain("viewBox=\"0 0 375 375\"");
        expect(favicon).toContain("path{fill:#4B5563}@media (prefers-color-scheme:dark){path{fill:#FFFFFF}}");
    });

    it("tujuan hanya path internal (mencegah open redirect)", async () => {
        const { tujuanAman } = await import("../../src/modules/m01-auth");
        expect([tujuanAman("//evil.com"), tujuanAman("https://evil.com"), tujuanAman("/login"), tujuanAman(undefined), tujuanAman("/aset?x=1")]).toEqual(["/", "/", "/", "/", "/aset?x=1"]);
    });

    it("tanpa pelanggaran aksesibilitas otomatis (axe WCAG 2.1 AA)", async () => {
        server();
        const { container } = await renderAplikasi("/login");
        expect(await pelanggaranAxe(container)).toEqual([]);
    });
});

describe("P-12 Dashboard + shell", () => {
    beforeEach(() => server());

    it("kartu manifes dirender per zona; kartu 403 hilang; Efek Tertunda nol tidak dirender; nilai dari server", async () => {
        await renderAplikasi("/");
        expect(await screen.findByText("4.820")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Tindakan" })).toBeTruthy();
        expect(screen.getByText("Siti Guru")).toBeTruthy();
        await waitFor(() => expect(screen.queryByText("Login Hari Ini")).toBeNull());
        expect(screen.queryByText("Efek Tertunda Gagal")).toBeNull();
        // Drill-down belum menjadi tautan: halaman sasarannya belum terdaftar di build ini.
        expect(screen.queryByRole("link", { name: /buka daftar sumbernya/ })).toBeNull();
    });

    it("grafik membawa tabel data alternatif bagi pembaca layar (C-23, NFR-AC-04)", async () => {
        await renderAplikasi("/");
        const tabel = await screen.findByRole("table", { name: "Aktivitas Sistem" });
        expect(within(tabel).getByRole("rowheader", { name: "2026-09-30" })).toBeTruthy();
    });

    it("rentang dari URL dikirim ke kartu berperiode; Muat ulang meminta segarkan=true", async () => {
        await renderAplikasi("/?rentang=semester");
        await screen.findByText("4.820");
        expect(log.find((p) => p.url === "/dashboard/cards/aktivitas-sistem")?.params).toEqual({ rentang: "semester", segarkan: "false" });
        await userEvent.click(screen.getByRole("button", { name: "Muat ulang" }));
        await waitFor(() => expect(log.some((p) => p.url === "/dashboard/cards/pengguna-aktif" && p.params["segarkan"] === "true")).toBe(true));
    });

    it("galat satu kartu tidak menggagalkan kartu lain; galatnya membawa request_id + Coba lagi", async () => {
        server((p) => (p.url === "/dashboard/cards/pengguna-aktif" ? gagal(500, "INTERNAL_ERROR", "rahasia", "req-kartu-9") : undefined));
        await renderAplikasi("/");
        expect(await screen.findByText("req-kartu-9")).toBeTruthy();
        expect(screen.getByText("Siti Guru")).toBeTruthy();
    });

    it("shell menampilkan identitas SIGM4 (wordmark & ikon untuk sidebar ciut)", async () => {
        await renderAplikasi("/");
        const logo = (await screen.findAllByRole("img", { name: "SIGM4" })).map((i) => i.getAttribute("src") ?? "");
        expect(logo.some((x) => x.includes("logo-sigm4"))).toBe(true);
        expect(logo.some((x) => x.includes("ikon-sigm4"))).toBe(true);
    });

    it("sidebar hanya berisi entri yang halamannya ada dan permission-nya dipegang (PM-04)", async () => {
        await renderAplikasi("/");
        const nav = await screen.findByRole("navigation", { name: "Navigasi utama" });
        expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Dashboard"]);
        server((p) => (p.url === "/me" ? sukses({ ...ME_ADMIN, permissions: { "user.view": "all" } }) : undefined));
        await renderAplikasi("/");
        const kosong = (await screen.findAllByRole("navigation", { name: "Navigasi utama" })).at(-1)!;
        expect(within(kosong).queryAllByRole("link")).toEqual([]);
    });

    it("Keluar → POST /auth/logout, cache dibersihkan, kembali ke Login", async () => {
        const { router } = await renderAplikasi("/");
        await userEvent.click(await screen.findByRole("button", { name: /Admin Uji/ }));
        await userEvent.click(await screen.findByRole("menuitem", { name: "Keluar" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
        expect(log.some((p) => p.method === "POST" && p.url === "/auth/logout")).toBe(true);
    });

    it("Keluar dari semua perangkat → POST /auth/logout-all; logout yang gagal tetap membawa ke Login tanpa galat tak tertangani", async () => {
        server((p) => (p.url === "/auth/logout-all" ? gagal(401, "UNAUTHENTICATED", "Sesi tidak valid.") : undefined));
        const { router } = await renderAplikasi("/");
        await userEvent.click(await screen.findByRole("button", { name: /Admin Uji/ }));
        await userEvent.click(await screen.findByRole("menuitem", { name: "Keluar dari semua perangkat" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
        expect(log.some((p) => p.url === "/auth/logout-all")).toBe(true);
    });

    it("tanpa pelanggaran aksesibilitas otomatis pada shell + dashboard (axe WCAG 2.1 AA)", async () => {
        const { container } = await renderAplikasi("/");
        await screen.findByText("4.820");
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("route tak dikenal → P-11 dengan jalan kembali ke Dashboard", async () => {
        await renderAplikasi("/tidak-ada-halaman-ini");
        expect(await screen.findByRole("heading", { name: "Halaman tidak ditemukan" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Kembali ke Dashboard" })).toBeTruthy();
    });
});
