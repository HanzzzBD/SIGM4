// P-13 Pusat Notifikasi, lonceng topbar, P-78 Preferensi Notifikasi (FR-17.1, FR-17.3, UX F-23,
// §7.6.8; PR-02-43) — aplikasi utuh lewat router, gerbang sesi, dan klien HTTP produksi; server
// tiruan pada adapter axios dan EventSource tiruan (jsdom tidak menyediakannya).

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBANG_GAGAL_SSE, SELANG_POLLING_MS } from "../../src/modules/m17-notifications/aliran";
import { jalurTerdaftar } from "../../src/shared/navigasi";
import { ME_ADMIN, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

class EventSourceTiruan {
    static semua: EventSourceTiruan[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((m: MessageEvent<string>) => void) | null = null;
    onerror: (() => void) | null = null;
    ditutup = false;
    private readonly pendengar = new Map<string, (m: MessageEvent<string>) => void>();
    constructor(readonly url: string) {
        EventSourceTiruan.semua.push(this);
    }
    addEventListener(nama: string, f: (m: MessageEvent<string>) => void) {
        this.pendengar.set(nama, f);
    }
    close() {
        this.ditutup = true;
    }
    kirim(data: unknown, nama?: string) {
        const m = new MessageEvent("message", { data: JSON.stringify(data) });
        act(() => (nama === undefined ? this.onmessage?.(m) : this.pendengar.get(nama)?.(m)));
    }
    static terakhir(): EventSourceTiruan {
        const es = EventSourceTiruan.semua.at(-1);
        if (es === undefined) throw new Error("belum ada EventSource");
        return es;
    }
}

const N = (id: number, o: Record<string, unknown> = {}) => ({
    id,
    kode: "NT-02",
    jenis: "PERSETUJUAN",
    judul: `Pengajuan ${String(id)} disetujui`,
    isi: "Reservasi Aula Utama pada 2 Maret 2027 telah disetujui.",
    referensi_jenis: "approval_instance",
    referensi_id: id,
    deep_link: "/reservasi/123",
    wajib: true,
    dibaca_pada: null,
    created_at: "2027-02-27T02:00:00.000Z",
    ...o,
});

const daftar = (data: unknown[], unread: number): Jawaban => ({ status: 200, data: { success: true, data, meta: { page: 1, per_page: 25, total: data.length, total_pages: 1, unread_count: unread } } });

const PREF = ["PERSETUJUAN", "RESERVASI_PEMINJAMAN", "DENDA_KEWAJIBAN", "KERUSAKAN_PERAWATAN", "OPNAME_PENGADAAN", "AKUN_SISTEM"].map((jenis) => ({ jenis, in_app: true, push: true, terkunci: jenis === "PERSETUJUAN" }));

function server(o: { me?: unknown; list?: (p: Permintaan) => Jawaban; put?: (p: Permintaan) => Jawaban } = {}) {
    return pasangServer((p) => {
        if (p.url === "/me") return sukses(o.me ?? { ...ME_ADMIN, permissions: { ...ME_ADMIN.permissions, "reservation.view": "all", "approval.decide": "all" } });
        if (p.url === "/notifications" && p.method === "GET") return o.list?.(p) ?? daftar([N(1), N(2, { jenis: "AKUN_SISTEM", kode: "NT-38a", deep_link: "/kerusakan/5", dibaca_pada: null, wajib: false }), N(3, { dibaca_pada: "2027-02-27T03:00:00.000Z" })], 2);
        if (p.url === "/notifications/1/read" || p.url === "/notifications/2/read") return sukses({ id: 1, dibaca_pada: "2027-02-28T00:00:00.000Z", unread_count: 1 });
        if (p.url === "/notifications/read-all") return sukses({ ditandai: 2, unread_count: 0 });
        if (p.url === "/notifications/preferences" && p.method === "GET") return sukses(PREF);
        if (p.url === "/notifications/preferences" && p.method === "PUT") return o.put?.(p) ?? sukses(PREF);
        return { status: 404 };
    });
}

beforeEach(() => {
    EventSourceTiruan.semua = [];
    vi.stubGlobal("EventSource", EventSourceTiruan);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("jalurTerdaftar (SDD-NTF-09)", () => {
    it("mencocokkan route berparameter dan mengabaikan query; path yang belum ada ditolak", () => {
        expect(jalurTerdaftar("/reservasi/123")).toBe(true);
        expect(jalurTerdaftar("/aset/impor?job=4")).toBe(true);
        expect(jalurTerdaftar("/kerusakan/5")).toBe(false);
        expect(jalurTerdaftar("/reservasi/123/lain")).toBe(false);
    });
});

describe("P-13 Pusat Notifikasi", () => {
    it("daftar dengan penanda belum dibaca & lencana Wajib; ketuk → tandai terbaca + deep link; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container, router } = await renderAplikasi("/notifikasi");
        const daftarEl = await screen.findByRole("list", { name: "Daftar notifikasi" });
        const item = within(daftarEl).getAllByRole("button");
        expect(item).toHaveLength(3);
        expect(item[0]?.getAttribute("aria-label")).toMatch(/^Belum dibaca, Persetujuan, Pengajuan 1 disetujui, .*WIB, Wajib$/);
        expect(item[2]?.getAttribute("aria-label")).not.toMatch(/Belum dibaca/);
        expect(await pelanggaranAxe(container)).toEqual([]);

        // Tujuan yang route-nya belum ada di build ini: hanya ditandai terbaca, tetap di P-13.
        await user.click(item[1]!);
        await waitFor(() => expect(log.some((p) => p.method === "PATCH" && p.url === "/notifications/2/read")).toBe(true));
        expect(router.state.location.pathname).toBe("/notifikasi");

        await user.click(item[0]!);
        await waitFor(() => expect(router.state.location.pathname).toBe("/reservasi/123"));
        expect(log.some((p) => p.method === "PATCH" && p.url === "/notifications/1/read")).toBe(true);
    });

    it("notifikasi yang sudah dibaca tidak memanggil PATCH lagi", async () => {
        const log = server({ list: () => daftar([N(3, { dibaca_pada: "2027-02-27T03:00:00.000Z" })], 0) });
        const { router } = await renderAplikasi("/notifikasi");
        await userEvent.click(await screen.findByRole("button", { name: /Pengajuan 3 disetujui/ }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/reservasi/123"));
        expect(log.some((p) => p.method === "PATCH")).toBe(false);
    });

    it("tandai semua terbaca → PATCH read-all dan jumlah yang terpengaruh diumumkan", async () => {
        const log = server();
        await renderAplikasi("/notifikasi");
        await userEvent.click(await screen.findByRole("button", { name: "Tandai semua terbaca" }));
        await waitFor(() => expect(screen.getByText("2 notifikasi ditandai terbaca.")).toBeTruthy());
        expect(log.some((p) => p.method === "PATCH" && p.url === "/notifications/read-all")).toBe(true);
    });

    it("saringan jenis & tampilan di URL; arsip tanpa penanda belum dibaca dan tanpa Tandai semua (UXD-10)", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/notifikasi");
        await screen.findByRole("list", { name: "Daftar notifikasi" });
        await user.selectOptions(screen.getByLabelText("Jenis"), "AKUN_SISTEM");
        await user.selectOptions(screen.getByLabelText("Tampilkan"), "belum");
        await waitFor(() => expect(router.state.location.search).toMatchObject({ jenis: "AKUN_SISTEM", tampilan: "belum" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/notifications").at(-1)?.params).toMatchObject({ jenis: "AKUN_SISTEM", belum_dibaca: "true", page: 1, per_page: 25 }));

        await user.selectOptions(screen.getByLabelText("Tampilkan"), "arsip");
        const arsip = await screen.findByRole("list", { name: "Arsip notifikasi" });
        expect(log.filter((p) => p.url === "/notifications").at(-1)?.params).toMatchObject({ arsip: "true" });
        expect(within(arsip).getAllByRole("button").some((b) => /Belum dibaca/.test(b.getAttribute("aria-label") ?? ""))).toBe(false);
        expect(screen.queryByRole("button", { name: "Tandai semua terbaca" })).toBeNull();
    });

    it("tanpa notification.manage_own → P-08 dan lonceng tidak dirender (PM-04)", async () => {
        server({ me: { ...ME_ADMIN, permissions: { "dashboard.view": "all" } } });
        const { router } = await renderAplikasi("/notifikasi");
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
        expect(screen.queryByRole("button", { name: /^Notifikasi/ })).toBeNull();
        expect(EventSourceTiruan.semua).toHaveLength(0);
    });
});

describe("Lonceng & aliran SSE → polling (FR-17.1 A4, SDD-NTF-01…05)", () => {
    it("penghitung dari server lewat SSE; notifikasi baru menyegarkan daftar", async () => {
        const log = server();
        await renderAplikasi("/notifikasi");
        await screen.findByRole("list", { name: "Daftar notifikasi" });
        const es = EventSourceTiruan.terakhir();
        expect(es.url).toBe("/api/v1/notifications/stream");
        act(() => es.onopen?.());
        es.kirim({ jenis: "hitungan", unread_count: 4 });
        expect(await screen.findByRole("button", { name: "Notifikasi, 4 belum dibaca" })).toBeTruthy();
        const sebelum = log.filter((p) => p.url === "/notifications").length;
        es.kirim({ jenis: "notifikasi", notifikasi: { id: 9, kode: "NT-01", judul: "x", isi: "y", deep_link: null, created_at: "2027-02-28T00:00:00.000Z" }, unread_count: 5 });
        expect(await screen.findByRole("button", { name: "Notifikasi, 5 belum dibaca" })).toBeTruthy();
        await waitFor(() => expect(log.filter((p) => p.url === "/notifications").length).toBeGreaterThan(sebelum));
    });

    it(`${String(AMBANG_GAGAL_SSE)} kegagalan beruntun → polling 60 detik dan UI menjelaskan penurunannya`, async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const log = server();
        await renderAplikasi("/notifikasi");
        await screen.findByRole("list", { name: "Daftar notifikasi" });
        for (let i = 1; i <= AMBANG_GAGAL_SSE; i += 1) {
            expect(EventSourceTiruan.semua).toHaveLength(i);
            act(() => EventSourceTiruan.terakhir().onerror?.());
            if (i < AMBANG_GAGAL_SSE) await act(() => vi.advanceTimersByTimeAsync(5_000));
        }
        expect(await screen.findByText(/Koneksi real-time tidak tersedia di jaringan ini/)).toBeTruthy();
        await act(() => vi.advanceTimersByTimeAsync(5_000));
        // Tidak ada sambungan SSE baru setelah beralih ke polling.
        expect(EventSourceTiruan.semua).toHaveLength(AMBANG_GAGAL_SSE);
        const hitung = () => log.filter((p) => p.url === "/notifications" && p.params["per_page"] === 1).length;
        const awal = hitung();
        await act(() => vi.advanceTimersByTimeAsync(SELANG_POLLING_MS));
        await waitFor(() => expect(hitung()).toBe(awal + 1));
    });

    it("kegagalan yang pulih (onopen) mengulang hitungan — dua gagal, terbuka, dua gagal lagi tetap SSE", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        server();
        await renderAplikasi("/notifikasi");
        await screen.findByRole("list", { name: "Daftar notifikasi" });
        const gagal = async () => {
            act(() => EventSourceTiruan.terakhir().onerror?.());
            await act(() => vi.advanceTimersByTimeAsync(5_000));
        };
        await gagal();
        await gagal();
        act(() => EventSourceTiruan.terakhir().onopen?.());
        await gagal();
        await gagal();
        expect(EventSourceTiruan.semua).toHaveLength(5);
        expect(screen.queryByText(/Koneksi real-time tidak tersedia/)).toBeNull();
    });

    it("server memutus koneksi terlama (NTF-03) → tab ini polling dengan alasan dari server", async () => {
        server();
        await renderAplikasi("/notifikasi");
        await screen.findByRole("list", { name: "Daftar notifikasi" });
        const es = EventSourceTiruan.terakhir();
        es.kirim({ alasan: "Koneksi notifikasi dibuka di tempat lain." }, "putus");
        expect(await screen.findByText(/Koneksi notifikasi dibuka di tempat lain\. Di tab ini notifikasi diperbarui setiap 60 detik\./)).toBeTruthy();
        expect(es.ditutup).toBe(true);
    });

    it("lonceng membuka pratinjau 5 terbaru + Lihat semua", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/");
        await user.click(await screen.findByRole("button", { name: /^Notifikasi/ }));
        const menu = await screen.findByRole("menu", { name: /^Notifikasi/ });
        expect(log.filter((p) => p.url === "/notifications").at(-1)?.params).toMatchObject({ per_page: 5 });
        expect(await within(menu).findByRole("menuitem", { name: /Pengajuan 1 disetujui/ })).toBeTruthy();
        await user.click(within(menu).getByRole("menuitem", { name: "Lihat semua notifikasi" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/notifikasi"));
    });
});

describe("P-78 Preferensi Notifikasi", () => {
    const ME_SISWA = { ...ME_ADMIN, permissions: { "notification.manage_own": "own", "reservation.view": "restricted", "reservation.create": "own" } };

    it("hanya kelompok relevan; Persetujuan terkunci beserta alasannya; tanpa pelanggaran axe", async () => {
        server({ me: ME_SISWA });
        const { container } = await renderAplikasi("/profil/notifikasi");
        expect(await screen.findByRole("heading", { name: "Preferensi Notifikasi", level: 1 })).toBeTruthy();
        const judul = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
        expect(judul).toEqual(["Persetujuan", "Reservasi & Peminjaman", "Akun & Sistem"]);
        const inApp = screen.getByRole("checkbox", { name: "Dalam aplikasi — Persetujuan" });
        expect(inApp.hasAttribute("disabled")).toBe(true);
        expect(inApp.getAttribute("aria-checked")).toBe("true");
        expect(screen.getByText(/tidak dapat dimatikan/)).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
    });

    it("mematikan in-app ikut mematikan & mengunci push; simpan mengirim kelompok tak terkunci saja", async () => {
        const log = server({ me: ME_SISWA });
        const user = userEvent.setup();
        await renderAplikasi("/profil/notifikasi");
        await user.click(await screen.findByRole("checkbox", { name: "Dalam aplikasi — Reservasi & Peminjaman" }));
        const push = screen.getByRole("checkbox", { name: "Push — Reservasi & Peminjaman" });
        expect(push.getAttribute("aria-checked")).toBe("false");
        expect(push.hasAttribute("disabled")).toBe(true);
        await user.click(screen.getByRole("button", { name: "Simpan preferensi" }));
        expect(await screen.findByText("Preferensi disimpan dan langsung berlaku.")).toBeTruthy();
        expect(log.find((p) => p.method === "PUT")?.data).toEqual({
            preferensi: [
                { jenis: "RESERVASI_PEMINJAMAN", in_app: false, push: false },
                { jenis: "AKUN_SISTEM", in_app: true, push: true },
            ],
        });
    });

    it("penolakan server ditampilkan, bukan dianggap tersimpan", async () => {
        server({ me: ME_SISWA, put: () => ({ status: 422, data: { success: false, error: { code: "VALIDATION_ERROR", message: "x" }, request_id: "r" } }) });
        await renderAplikasi("/profil/notifikasi");
        await userEvent.click(await screen.findByRole("button", { name: "Simpan preferensi" }));
        expect(await screen.findByText(/Preferensi belum tersimpan/)).toBeTruthy();
    });
});
