// Acceptance PR-02-36 (keputusan 85): P-02 Verifikasi 2FA, P-03 Aktivasi 2FA, P-05 Ganti
// Password Wajib, dan auto-logout idle web — di atas router, gerbang sesi, dan klien HTTP
// yang sama dengan produksi (server tiruan pada adapter axios).
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATURAN_PASSWORD } from "../../src/modules/m01-auth/GantiPasswordPage";
import { BATAS_IDLE, KUNCI_AKTIVITAS, PERINGATAN_IDLE, keadaanIdle } from "../../src/modules/m01-auth/idle";
import { jalurQr } from "../../src/modules/m01-auth/qr";
import { teksKodeCadangan } from "../../src/modules/m01-auth/AktivasiDuaFaktorPage";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

const SESI = { tokens: null, expires_in: 900, user: { ...ME_ADMIN.user }, permissions: ME_ADMIN.permissions };
const KODE_CADANGAN = Array.from({ length: 10 }, (_, i) => `ABCDE-FGH${String(i).padStart(2, "0")}`);
const PENDAFTARAN = { secret: "JBSWY3DPEHPK3PXP", otpauth_uri: "otpauth://totp/SIGM4:admin%40sekolah.sch.id?secret=JBSWY3DPEHPK3PXP&issuer=SIGM4", kode_cadangan: KODE_CADANGAN };
const galat422 = (details: { field: string; message: string }[], message = "Data tidak valid."): Jawaban => ({
    status: 422,
    data: { success: false, error: { code: "VALIDATION_ERROR", message, details }, request_id: "req-uji-422" },
});

let log: Permintaan[] = [];
/** `rute` menjawab lebih dulu; selebihnya sesi normal + dashboard kosong. */
function server(rute: (p: Permintaan) => Jawaban | undefined) {
    log = pasangServer((p) => {
        const j = rute(p);
        if (j !== undefined) return j;
        if (p.url === "/me") return sukses(ME_ADMIN);
        if (p.url === "/auth/logout") return { status: 204 };
        if (p.url === "/dashboard") return sukses({ templat: "R-01", kartu: [] });
        return gagal(404, "NOT_FOUND", `Tidak ada: ${p.method} ${p.url}`);
    });
}

async function masuk(path = "/login?tujuan=%2F%3Frentang%3D7_hari") {
    const r = await renderAplikasi(path);
    await userEvent.type(screen.getByLabelText(/^Email/), "admin@sekolah.sch.id");
    await userEvent.type(screen.getByLabelText(/^Password/), "rahasia");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
    return r;
}

const ketikKode = async (kode: string) => {
    await userEvent.type(await screen.findByLabelText(/^Kode verifikasi/), kode);
    await userEvent.click(screen.getByRole("button", { name: "Verifikasi" }));
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("P-02 Verifikasi 2FA (FR-01.5, F-01)", () => {
    const tantangan = (expires_in = 300) => sukses({ requires_2fa: true, challenge_token: "tantangan-1", expires_in });

    it("tanpa challenge di memori tab (mis. muat ulang) → kembali ke Login", async () => {
        server(() => undefined);
        const { router } = await renderAplikasi("/login/2fa?tujuan=%2F");
        expect(router.state.location.pathname).toBe("/login");
        expect(router.state.location.search).toMatchObject({ tujuan: "/" });
    });

    it("kode salah (401) → pesan kode salah, tetap di P-02, TANPA refresh token; kode benar → tujuan awal", async () => {
        let percobaan = 0;
        server((p) => {
            if (p.url === "/auth/login") return tantangan();
            if (p.url === "/auth/2fa/verify") return ++percobaan === 1 ? gagal(401, "UNAUTHENTICATED", "Sesi tidak valid.") : sukses({ ...SESI, sisa_kode_cadangan: 9, kode_cadangan_menipis: false });
            return undefined;
        });
        const { router } = await masuk();
        await waitFor(() => expect(router.state.location.pathname).toBe("/login/2fa"));
        await ketikKode("111111");
        expect((await screen.findByRole("alert")).textContent).toContain("Kode verifikasi salah");
        expect(router.state.location.pathname).toBe("/login/2fa");
        expect(log.some((p) => p.url === "/auth/refresh")).toBe(false);
        await ketikKode(" 123456 ");
        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(router.state.location.search).toMatchObject({ rentang: "7_hari" });
        expect(log.filter((p) => p.url === "/auth/2fa/verify").map((p) => p.data)).toEqual([
            { challenge_token: "tantangan-1", kode: "111111" },
            { challenge_token: "tantangan-1", kode: "123456" },
        ]);
    });

    it("challenge sudah lewat 5 menit → 'Waktu verifikasi habis' tanpa memanggil server; tombol kembali ke Login", async () => {
        server((p) => (p.url === "/auth/login" ? tantangan(300) : undefined));
        const { router } = await masuk();
        await waitFor(() => expect(router.state.location.pathname).toBe("/login/2fa"));
        const kini = Date.now();
        vi.spyOn(Date, "now").mockReturnValue(kini + 301_000);
        await ketikKode("123456");
        expect((await screen.findByRole("alert")).textContent).toContain("Waktu verifikasi habis");
        expect(log.some((p) => p.url === "/auth/2fa/verify")).toBe(false);
        await userEvent.click(screen.getByRole("button", { name: "Kembali ke halaman masuk" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    });

    it("401 yang tiba setelah challenge habis → pesan waktu habis, bukan kode salah", async () => {
        const kini = Date.now();
        server((p) => {
            if (p.url === "/auth/login") return tantangan(300);
            if (p.url === "/auth/2fa/verify") {
                vi.spyOn(Date, "now").mockReturnValue(kini + 301_000);
                return gagal(401, "UNAUTHENTICATED", "Sesi tidak valid.");
            }
            return undefined;
        });
        const { router } = await masuk();
        await waitFor(() => expect(router.state.location.pathname).toBe("/login/2fa"));
        await ketikKode("123456");
        expect((await screen.findByRole("alert")).textContent).toContain("Waktu verifikasi habis");
    });

    it("423 → pesan penguncian dari server (sisa waktu), tanpa formulir; kembali ke Login", async () => {
        server((p) => {
            if (p.url === "/auth/login") return tantangan();
            if (p.url === "/auth/2fa/verify") return gagal(423, "ACCOUNT_LOCKED", "Akun terkunci sementara. Coba lagi dalam 15 menit.");
            return undefined;
        });
        const { router } = await masuk();
        await waitFor(() => expect(router.state.location.pathname).toBe("/login/2fa"));
        await ketikKode("123456");
        expect((await screen.findByRole("alert")).textContent).toContain("Coba lagi dalam 15 menit");
        expect(screen.queryByLabelText(/^Kode verifikasi/)).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "Kembali ke halaman masuk" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    });

    it("kode cadangan menipis → peringatan dengan sisa kode sebelum melanjutkan (FR-01.5 AC)", async () => {
        server((p) => {
            if (p.url === "/auth/login") return tantangan();
            if (p.url === "/auth/2fa/verify") return sukses({ ...SESI, sisa_kode_cadangan: 2, kode_cadangan_menipis: true });
            return undefined;
        });
        const { router } = await masuk();
        await waitFor(() => expect(router.state.location.pathname).toBe("/login/2fa"));
        await ketikKode("ABCDE-FGHIJ");
        expect((await screen.findByRole("alert")).textContent).toContain("Tersisa 2 kode cadangan");
        expect(router.state.location.pathname).toBe("/login/2fa");
        await userEvent.click(screen.getByRole("button", { name: "Lanjutkan" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    });

    it("setelah 2FA, akun ber-must_change_password → P-05 dengan tujuan yang sama (SDD-AUTH-09)", async () => {
        server((p) => {
            if (p.url === "/auth/login") return tantangan();
            if (p.url === "/auth/2fa/verify") return sukses({ ...SESI, user: { ...SESI.user, must_change_password: true }, sisa_kode_cadangan: 9, kode_cadangan_menipis: false });
            return undefined;
        });
        const { router } = await masuk();
        await waitFor(() => expect(router.state.location.pathname).toBe("/login/2fa"));
        await ketikKode("123456");
        await waitFor(() => expect(router.state.location.pathname).toBe("/ganti-password"));
        expect(router.state.location.search).toMatchObject({ tujuan: "/?rentang=7_hari" });
    });

    it("tanpa pelanggaran aksesibilitas otomatis (axe WCAG 2.1 AA)", async () => {
        server((p) => (p.url === "/auth/login" ? tantangan() : undefined));
        const { router, container } = await masuk();
        await waitFor(() => expect(router.state.location.pathname).toBe("/login/2fa"));
        expect(await pelanggaranAxe(container)).toEqual([]);
    });
});

describe("P-03 Aktivasi 2FA (FR-01.5, F-03, BR-070c/d)", () => {
    /** `/me` menolak 2FA sampai konfirmasi berhasil — seperti gerbang server. */
    function serverAktivasi(tambahan: (p: Permintaan) => Jawaban | undefined = () => undefined) {
        let aktif = false;
        server((p) => {
            const t = tambahan(p);
            if (t !== undefined) return t;
            if (p.url === "/me" && !aktif) return gagal(403, "TWO_FACTOR_REQUIRED", "Verifikasi dua langkah (2FA) diperlukan.");
            if (p.url === "/auth/2fa/enroll") return sukses(PENDAFTARAN);
            if (p.url === "/auth/2fa/enroll/confirm") {
                aktif = true;
                return sukses({ access_token: null });
            }
            return undefined;
        });
    }

    async function keLangkahPendaftaran() {
        const r = await renderAplikasi("/?rentang=7_hari");
        await userEvent.type(await screen.findByLabelText(/^Kode aktivasi/), " AKT-12345 ");
        await userEvent.click(screen.getByRole("button", { name: "Lanjutkan" }));
        await screen.findByRole("heading", { name: "1. Pindai kode QR" });
        return r;
    }

    it("/me TWO_FACTOR_REQUIRED → P-03 membawa tujuan", async () => {
        serverAktivasi();
        const { router } = await renderAplikasi("/?rentang=7_hari");
        expect(router.state.location.pathname).toBe("/login/2fa/aktivasi");
        expect(router.state.location.search).toMatchObject({ tujuan: "/?rentang=7_hari" });
    });

    it("kode aktivasi tidak berlaku → pesan seragam server di isiannya; tetap di langkah kode (FR-01.5 A5)", async () => {
        const pesan = "Kode aktivasi tidak berlaku. Minta kode baru kepada Administrator.";
        serverAktivasi((p) => (p.url === "/auth/2fa/enroll" ? galat422([{ field: "kode_aktivasi", message: pesan }], pesan) : undefined));
        await renderAplikasi("/");
        await userEvent.type(await screen.findByLabelText(/^Kode aktivasi/), "SALAH");
        await userEvent.click(screen.getByRole("button", { name: "Lanjutkan" }));
        expect(await screen.findByText(pesan)).toBeTruthy();
        expect(screen.getByLabelText(/^Kode aktivasi/).getAttribute("aria-invalid")).toBe("true");
        expect(screen.queryByRole("heading", { name: "1. Pindai kode QR" })).toBeNull();
    });

    it("QR + secret + 10 kode cadangan; kolom 6 digit TERKUNCI sampai 'sudah menyimpan' dicentang; konfirmasi → tujuan", async () => {
        serverAktivasi();
        const { router } = await keLangkahPendaftaran();
        expect(log.find((p) => p.url === "/auth/2fa/enroll")?.data).toEqual({ kode_aktivasi: "AKT-12345" });
        const qr = screen.getByRole("img", { name: "Kode QR pendaftaran aplikasi authenticator" });
        expect(qr.querySelector("path")?.getAttribute("d")).toMatch(/^M\d+ \d+h1v1h-1z/);
        expect(screen.getByText(PENDAFTARAN.secret)).toBeTruthy();
        expect(within(screen.getByRole("list", { name: "Kode cadangan" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(KODE_CADANGAN);

        const isian = screen.getByLabelText(/^Kode 6 digit/) as HTMLInputElement;
        expect(isian.disabled).toBe(true);
        expect((screen.getByRole("button", { name: "Aktifkan 2FA" }) as HTMLButtonElement).disabled).toBe(true);
        await userEvent.click(screen.getByLabelText("Saya sudah menyimpan 10 kode cadangan di tempat aman"));
        expect(isian.disabled).toBe(false);
        await userEvent.type(isian, "12a3456");
        expect(isian.value).toBe("123456");
        await userEvent.click(screen.getByRole("button", { name: "Aktifkan 2FA" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(router.state.location.search).toMatchObject({ rentang: "7_hari" });
        expect(log.find((p) => p.url === "/auth/2fa/enroll/confirm")?.data).toEqual({ kode: "123456" });
    });

    it("6 digit salah → pesan di isian, tetap di P-03", async () => {
        serverAktivasi((p) => (p.url === "/auth/2fa/enroll/confirm" ? galat422([{ field: "kode", message: "Kode verifikasi salah atau sudah tidak berlaku." }]) : undefined));
        const { router } = await keLangkahPendaftaran();
        await userEvent.click(screen.getByLabelText("Saya sudah menyimpan 10 kode cadangan di tempat aman"));
        await userEvent.type(screen.getByLabelText(/^Kode 6 digit/), "000000");
        await userEvent.click(screen.getByRole("button", { name: "Aktifkan 2FA" }));
        expect(await screen.findByText("Kode verifikasi salah atau sudah tidak berlaku.")).toBeTruthy();
        expect(router.state.location.pathname).toBe("/login/2fa/aktivasi");
    });

    it("kode aktivasi hangus saat konfirmasi → kembali ke langkah kode aktivasi dengan pesannya", async () => {
        const pesan = "Kode aktivasi tidak berlaku. Minta kode baru kepada Administrator.";
        serverAktivasi((p) => (p.url === "/auth/2fa/enroll/confirm" ? galat422([{ field: "kode_aktivasi", message: pesan }], pesan) : undefined));
        await keLangkahPendaftaran();
        await userEvent.click(screen.getByLabelText("Saya sudah menyimpan 10 kode cadangan di tempat aman"));
        await userEvent.type(screen.getByLabelText(/^Kode 6 digit/), "123456");
        await userEvent.click(screen.getByRole("button", { name: "Aktifkan 2FA" }));
        expect((await screen.findByRole("alert")).textContent).toContain(pesan);
        expect(screen.getByLabelText(/^Kode aktivasi/)).toBeTruthy();
    });

    it("Salin semua menyalin 10 kode; berkas .txt memuat seluruh kode", async () => {
        serverAktivasi();
        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        await keLangkahPendaftaran();
        await userEvent.click(screen.getByRole("button", { name: "Salin semua" }));
        expect(writeText).toHaveBeenCalledWith(KODE_CADANGAN.join("\n"));
        expect(await screen.findByRole("button", { name: "Tersalin" })).toBeTruthy();
        expect(teksKodeCadangan(KODE_CADANGAN).split("\n").filter((b) => KODE_CADANGAN.includes(b))).toEqual(KODE_CADANGAN);
    });

    it("jalur QR: satu kotak per modul gelap, tidak ada untuk modul terang", () => {
        expect(jalurQr([[true, false], [false, true]])).toBe("M0 0h1v1h-1zM1 1h1v1h-1z");
    });

    it("tanpa pelanggaran aksesibilitas otomatis pada langkah pendaftaran (axe WCAG 2.1 AA)", async () => {
        serverAktivasi();
        const { container } = await keLangkahPendaftaran();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });
});

describe("P-05 Ganti Password Wajib (FR-01.1 A4, FR-01.4)", () => {
    function serverGanti(ganti: (p: Permintaan) => Jawaban) {
        let diganti = false;
        server((p) => {
            if (p.url === "/me" && !diganti) return gagal(403, "PASSWORD_CHANGE_REQUIRED", "Anda wajib mengganti password sebelum melanjutkan.");
            if (p.url === "/auth/password/change") {
                const j = ganti(p);
                diganti = j.status === 200;
                return j;
            }
            return undefined;
        });
    }

    async function isi(lama: string, baru: string, konfirmasi = baru) {
        await userEvent.type(await screen.findByLabelText(/^Password saat ini/), lama);
        await userEvent.type(screen.getByLabelText(/^Password baru/), baru);
        await userEvent.type(screen.getByLabelText(/^Konfirmasi password baru/), konfirmasi);
        await userEvent.click(screen.getByRole("button", { name: "Simpan password" }));
    }

    it("/me PASSWORD_CHANGE_REQUIRED → P-05; berhasil → tujuan awal dengan body yang benar", async () => {
        serverGanti(() => sukses({ access_token: null }));
        const { router } = await renderAplikasi("/?rentang=semester");
        expect(router.state.location.pathname).toBe("/ganti-password");
        await isi("Sementara-123", "Tiga-Kucing-Melompat-91");
        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(router.state.location.search).toMatchObject({ rentang: "semester" });
        expect(log.find((p) => p.url === "/auth/password/change")?.data).toEqual({ password_lama: "Sementara-123", password_baru: "Tiga-Kucing-Melompat-91" });
    });

    it("indikator aturan berubah saat mengetik (FR-01.4 langkah 3, keputusan 85d)", async () => {
        serverGanti(() => sukses({ access_token: null }));
        await renderAplikasi("/ganti-password");
        const daftar = await screen.findByRole("list", { name: "Syarat password baru" });
        const status = () => within(daftar).getAllByRole("listitem").map((li) => li.textContent?.endsWith("— terpenuhi") === true);
        expect(status()).toEqual([false, false, false, false]);
        await userEvent.type(screen.getByLabelText(/^Password baru/), "abc1");
        expect(status()).toEqual([false, false, true, true]);
        await userEvent.type(screen.getByLabelText(/^Password baru/), "DEFGHIJKL");
        expect(status()).toEqual([true, true, true, true]);
        expect(ATURAN_PASSWORD.map((a) => a.uji("Aa1234567890"))).toEqual([true, true, true, true]);
        expect(ATURAN_PASSWORD.map((a) => a.uji("aa345678901"))).toEqual([false, false, true, true]);
    });

    it("konfirmasi tidak sama → galat di isian konfirmasi tanpa memanggil server", async () => {
        serverGanti(() => sukses({ access_token: null }));
        const { router } = await renderAplikasi("/ganti-password");
        await isi("Sementara-123", "Tiga-Kucing-Melompat-91", "Tiga-Kucing-Melompat-19");
        expect(await screen.findByText("Konfirmasi password tidak sama dengan password baru.")).toBeTruthy();
        expect(log.some((p) => p.url === "/auth/password/change")).toBe(false);
        expect(router.state.location.pathname).toBe("/ganti-password");
    });

    it("422: seluruh pelanggaran password_baru dari server tampil di isiannya; password lama salah di isiannya", async () => {
        let n = 0;
        serverGanti(() =>
            ++n === 1
                ? galat422([
                      { field: "password_baru", message: "Password ini tercantum dalam daftar password yang bocor." },
                      { field: "password_baru", message: "Password baru tidak boleh sama dengan 3 password terakhir." },
                  ])
                : galat422([{ field: "password_lama", message: "Password lama salah." }]),
        );
        await renderAplikasi("/ganti-password");
        await isi("Sementara-123", "Qwertyuiop123");
        const galatBaru = await screen.findByText(/tercantum dalam daftar password yang bocor/);
        expect(galatBaru.textContent).toContain("3 password terakhir");
        await userEvent.click(screen.getByRole("button", { name: "Simpan password" }));
        expect(await screen.findByText("Password lama salah.")).toBeTruthy();
        expect((screen.getByLabelText(/^Password saat ini/) as HTMLInputElement).value).toBe("");
    });

    it("ditolak TWO_FACTOR_REQUIRED → P-03, lalu kembali ke P-05 dengan tujuan asli (keputusan 85)", async () => {
        let diganti = false;
        let duaFaktor = false;
        server((p) => {
            if (p.url === "/me" && !diganti) return gagal(403, "PASSWORD_CHANGE_REQUIRED", "Anda wajib mengganti password sebelum melanjutkan.");
            if (p.url === "/auth/password/change") {
                if (!duaFaktor) return gagal(403, "TWO_FACTOR_REQUIRED", "Verifikasi dua langkah (2FA) diperlukan.");
                diganti = true;
                return sukses({ access_token: null });
            }
            if (p.url === "/auth/2fa/enroll") return sukses(PENDAFTARAN);
            if (p.url === "/auth/2fa/enroll/confirm") {
                duaFaktor = true;
                return sukses({ access_token: null });
            }
            return undefined;
        });
        const { router } = await renderAplikasi("/?rentang=semester");
        await isi("Sementara-123", "Tiga-Kucing-Melompat-91");
        await waitFor(() => expect(router.state.location.pathname).toBe("/login/2fa/aktivasi"));
        await userEvent.type(await screen.findByLabelText(/^Kode aktivasi/), "AKT-1");
        await userEvent.click(screen.getByRole("button", { name: "Lanjutkan" }));
        await userEvent.click(await screen.findByLabelText("Saya sudah menyimpan 10 kode cadangan di tempat aman"));
        await userEvent.type(screen.getByLabelText(/^Kode 6 digit/), "123456");
        await userEvent.click(screen.getByRole("button", { name: "Aktifkan 2FA" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/ganti-password"));
        await isi("Sementara-123", "Tiga-Kucing-Melompat-91");
        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(router.state.location.search).toMatchObject({ rentang: "semester" });
    });

    it("tanpa pelanggaran aksesibilitas otomatis (axe WCAG 2.1 AA)", async () => {
        serverGanti(() => sukses({ access_token: null }));
        const { container } = await renderAplikasi("/ganti-password");
        await screen.findByLabelText(/^Password saat ini/);
        expect(await pelanggaranAxe(container)).toEqual([]);
    });
});

describe("auto-logout idle web (FR-01.2 A2, keputusan 85b)", () => {
    beforeEach(() => {
        window.localStorage.removeItem(KUNCI_AKTIVITAS);
        server(() => undefined);
        // Hanya interval & jam yang dipalsukan; promise dan setTimeout tetap nyata.
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], shouldAdvanceTime: true });
    });

    const maju = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

    it("ambang: aktif < 28 menit ≤ peringatan < 30 menit ≤ habis", () => {
        // Angka literal FR-01.2 A2 — bukan konstanta kode, agar uji tidak ikut bergeser bersamanya.
        const menit = 60_000;
        expect([PERINGATAN_IDLE, BATAS_IDLE]).toEqual([28 * menit, 30 * menit]);
        expect([keadaanIdle(0, 28 * menit - 1), keadaanIdle(0, 28 * menit), keadaanIdle(0, 30 * menit - 1), keadaanIdle(0, 30 * menit)]).toEqual(["AKTIF", "PERINGATAN", "PERINGATAN", "HABIS"]);
    });

    it("menit 28 → banner 'Lanjutkan'; Lanjutkan menyetel ulang hitungan", async () => {
        await renderAplikasi("/");
        await screen.findByRole("navigation", { name: "Navigasi utama" });
        maju(PERINGATAN_IDLE - 2_000);
        expect(screen.queryByText("Sesi Anda akan segera berakhir")).toBeNull();
        maju(3_000);
        expect(await screen.findByText("Sesi Anda akan segera berakhir")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Lanjutkan" }));
        maju(1_000);
        await waitFor(() => expect(screen.queryByText("Sesi Anda akan segera berakhir")).toBeNull());
        maju(PERINGATAN_IDLE - 5_000);
        expect(screen.queryByText("Sesi Anda akan segera berakhir")).toBeNull();
        expect(log.some((p) => p.url === "/auth/logout")).toBe(false);
    });

    it("menit 30 → POST /auth/logout, ke Login dengan pesan sesi berakhir dan tujuan tersimpan", async () => {
        const { router } = await renderAplikasi("/?rentang=semester");
        await screen.findByRole("navigation", { name: "Navigasi utama" });
        maju(BATAS_IDLE + 1_000);
        await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
        expect(router.state.location.search).toMatchObject({ alasan: "idle", tujuan: "/?rentang=semester" });
        expect(log.filter((p) => p.url === "/auth/logout")).toHaveLength(1);
        expect(screen.getByRole("status").textContent).toContain("tidak ada aktivitas selama 30 menit");
    });

    it("input pengguna (tombol) di tab ini menyetel ulang hitungan", async () => {
        const { router } = await renderAplikasi("/");
        await screen.findByRole("navigation", { name: "Navigasi utama" });
        maju(20 * 60_000);
        fireEvent.keyDown(window, { key: "Tab" });
        // 29 menit sejak awal, 9 menit sejak input: tanpa input banner pasti sudah tampil.
        maju(9 * 60_000);
        expect(screen.queryByText("Sesi Anda akan segera berakhir")).toBeNull();
        maju(20 * 60_000);
        expect(await screen.findByText("Sesi Anda akan segera berakhir")).toBeTruthy();
        expect(router.state.location.pathname).toBe("/");
    });

    it("aktivitas di tab lain (storage event) ikut dihitung", async () => {
        const { router } = await renderAplikasi("/");
        await screen.findByRole("navigation", { name: "Navigasi utama" });
        maju(20 * 60_000);
        act(() => {
            window.dispatchEvent(new StorageEvent("storage", { key: KUNCI_AKTIVITAS, newValue: String(Date.now()) }));
        });
        maju(9 * 60_000);
        expect(screen.queryByText("Sesi Anda akan segera berakhir")).toBeNull();
        maju(22 * 60_000);
        await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    });

    it("halaman di luar shell (Login) tidak menghitung idle", async () => {
        server((p) => (p.url === "/me" ? gagal(401, "UNAUTHENTICATED", "x") : p.url === "/auth/refresh" ? gagal(401, "UNAUTHENTICATED", "x") : undefined));
        await renderAplikasi("/login");
        maju(BATAS_IDLE + 1_000);
        expect(log.some((p) => p.url === "/auth/logout")).toBe(false);
    });
});
