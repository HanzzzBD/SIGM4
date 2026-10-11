// P-70 Parameter Sistem, P-71 Kalender Akademik, P-72 Unit Kerja (FR-20.1 A1–A3, AC-YR-01/02, WU-02; PR-01-24) —
// aplikasi utuh lewat router dan klien HTTP produksi. Fokus: deskripsi & bawaan tampil, ubah hanya `setting.manage`
// (keputusan 36d), PUT hanya kunci yang berubah, onboarding tahun ajaran, cache pemilih M-02 ikut segar, axe.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

// Kotak centang Radix DI DALAM <form> merender input gelembung ber-ResizeObserver, yang tak ada di jsdom (pola room-blocks).
globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
};

const ADMIN = ["setting.view", "setting.manage", "user.view", "user.update", "role.view"];
const me = (izin: readonly string[]) => ({ ...ME_ADMIN, permissions: { "dashboard.view": "all", "notification.manage_own": "all", ...Object.fromEntries(izin.map((p) => [p, "all"])) } });
const halaman = (data: unknown[]): Jawaban => ({ status: 200, data: { success: true, data, meta: { page: 1, per_page: 100, total: data.length, total_pages: 1 } } });

const PARAM = (key: string, o: Record<string, unknown> = {}) => ({ key, kelompok: "RESERVASI", tipe: "BILANGAN_BULAT", value: 90, nilai_bawaan: 90, nilai_min: 7, nilai_maks: 365, deskripsi: `Deskripsi ${key}`, updated_at: "2026-10-01T03:00:00.000Z", updated_by: null, ...o });
const RESERVASI = [PARAM("reservasi.horizon_hari", { deskripsi: "Horizon pemesanan (hari)" }), PARAM("reservasi.ttl_tentative_jam", { value: 48, nilai_bawaan: 48, nilai_min: 1, nilai_maks: 168, deskripsi: "TTL slot tentative (jam)" })];
const KODE_ASET = [PARAM("kode_aset.pemisah", { kelompok: "KODE_ASET", tipe: "TEKS", value: "-", nilai_bawaan: "-", nilai_min: null, nilai_maks: null, deskripsi: "Penanda pemisah kode" })];

const SEMESTER = (m: string, s: string, g: string, n: string) => [
    { id: "1", nama: "GANJIL", tanggal_mulai: m, tanggal_selesai: g },
    { id: "2", nama: "GENAP", tanggal_mulai: n, tanggal_selesai: s },
];

/** Server tiruan BERKEADAAN: tahun ajaran & unit dapat diubah agar pemilih M-02 dapat diperiksa sesudahnya. */
function server(o: { izin?: readonly string[]; tahun?: unknown[]; put?: (p: Permintaan) => Jawaban } = {}) {
    let tahun: { id: string; nama: string; tanggal_mulai: string; tanggal_selesai: string; is_active: boolean; semester: unknown[] }[] = (o.tahun as never) ?? [
        { id: "4", nama: "2026/2027", tanggal_mulai: "2026-07-13", tanggal_selesai: "2027-06-30", is_active: true, semester: SEMESTER("2026-07-13", "2027-06-30", "2026-12-19", "2027-01-04") },
        { id: "5", nama: "2027/2028", tanggal_mulai: "2027-07-12", tanggal_selesai: "2028-06-30", is_active: false, semester: SEMESTER("2027-07-12", "2028-06-30", "2027-12-18", "2028-01-03") },
    ];
    let unit = [
        { id: "30", nama: "Kelas XI-1", kode: "KELAS-XI1", jenis: "KELAS", kepala_unit_id: null, status: "AKTIF" },
        { id: "2", nama: "Tata Usaha", kode: "TU-01", jenis: "TATA_USAHA", kepala_unit_id: null, status: "AKTIF" },
    ];
    const libur = [{ id: "9", tanggal: "2026-08-17", nama: "Hari Kemerdekaan", jenis: "NASIONAL", academic_year_id: "4" }];
    const log = pasangServer((p) => {
        if (p.url === "/me") return sukses(me(o.izin ?? ADMIN));
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        if (p.url === "/settings" && p.method === "GET") return halaman(p.params["filter[kelompok]"] === "RESERVASI" ? RESERVASI : p.params["filter[kelompok]"] === "KODE_ASET" ? KODE_ASET : []);
        if (p.url === "/settings" && p.method === "PUT") return o.put?.(p) ?? sukses(Object.entries((p.data as { settings: Record<string, unknown> }).settings).map(([key, value]) => ({ ...(RESERVASI.find((r) => r.key === key) ?? KODE_ASET.find((r) => r.key === key)), value })));
        if (p.url === "/academic-years" && p.method === "GET") return halaman(tahun);
        if (p.url === "/academic-years" && p.method === "POST") {
            const t = { ...(p.data as object), id: "6", is_active: tahun.length === 0, semester: [] } as unknown as (typeof tahun)[number];
            tahun = [...tahun, t];
            return { status: 201, data: { success: true, data: t, meta: null } };
        }
        const aktif = /^\/academic-years\/(\d+)\/activate$/.exec(p.url);
        if (aktif !== null) {
            tahun = tahun.map((t) => ({ ...t, is_active: t.id === aktif[1] }));
            return sukses(tahun.find((t) => t.id === aktif[1]));
        }
        if (p.url === "/holidays" && p.method === "GET") return halaman(libur);
        if (p.url === "/holidays" && p.method === "POST") return { status: 201, data: { success: true, data: { ...(p.data as object), id: "10", academic_year_id: "4" }, meta: null } };
        if (p.url === "/work-days" && p.method === "GET") return sukses([1, 2, 3, 4, 5, 6, 7].map((hari) => ({ hari, aktif: hari <= 5 })));
        if (p.url === "/work-days" && p.method === "PUT") return sukses((p.data as { hari_kerja: unknown[] }).hari_kerja);
        if (p.url === "/work-units" && p.method === "GET") {
            const jenis = p.params["filter[jenis]"];
            const st = p.params["filter[status]"];
            return halaman(unit.filter((u) => (jenis === undefined || u.jenis === jenis) && (st === undefined || u.status === st)));
        }
        if (p.url === "/work-units" && p.method === "POST") return { status: 201, data: { success: true, data: { ...(p.data as object), id: "40", kepala_unit_id: null, status: "AKTIF" }, meta: null } };
        const st = /^\/work-units\/(\d+)\/status$/.exec(p.url);
        if (st !== null) {
            unit = unit.map((u) => (u.id === st[1] ? { ...u, status: (p.data as { status: string }).status } : u));
            return sukses(unit.find((u) => u.id === st[1]));
        }
        if (p.url === "/roles") return sukses([{ id: "7", kode: "R-07", nama: "Siswa/OSIS" }]);
        if (p.url === "/users") return halaman([]);
        return { status: 404 };
    });
    return log;
}

describe("P-70 Parameter Sistem", () => {
    it("kelompok sebagai tab di URL; deskripsi, nilai bawaan, dan rentang tampil (AC FR-20.1); tanpa pelanggaran axe", async () => {
        server();
        const user = userEvent.setup();
        const { container, router } = await renderAplikasi("/pengaturan?kelompok=RESERVASI");
        const isian = await screen.findByLabelText("Horizon pemesanan (hari)");
        expect((isian as HTMLInputElement).value).toBe("90");
        expect(screen.getByText(/Bawaan: 90\. Rentang: 7 – 365\./)).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
        await user.click(screen.getByRole("tab", { name: "Maintenance" }));
        await waitFor(() => expect(router.state.location.search).toMatchObject({ kelompok: "MAINTENANCE" }));
        expect(await screen.findByText("Belum ada parameter di kelompok ini")).toBeTruthy();
    });

    it("simpan per kelompok mengirim HANYA kunci yang berubah; galat rentang server tampil pada isiannya (A1)", async () => {
        const log = server({ put: (p) => ((p.data as { settings: Record<string, unknown> }).settings["reservasi.horizon_hari"] === 999 ? { status: 422, data: { success: false, error: { code: "VALIDATION_ERROR", message: "Satu atau lebih parameter tidak sah.", details: [{ field: "reservasi.horizon_hari", message: "Nilai harus antara 7 dan 365." }] }, request_id: "r" } } : sukses([{ ...RESERVASI[0], value: 120 }])) });
        const user = userEvent.setup();
        await renderAplikasi("/pengaturan?kelompok=RESERVASI");
        const isian = await screen.findByLabelText("Horizon pemesanan (hari)");
        await user.clear(isian);
        await user.type(isian, "999");
        await user.click(screen.getByRole("button", { name: "Simpan Reservasi" }));
        expect(await screen.findByText("Nilai harus antara 7 dan 365.")).toBeTruthy();
        await user.clear(isian);
        await user.type(isian, "120");
        await user.click(screen.getByRole("button", { name: "Simpan Reservasi" }));
        expect(await screen.findByText(/Perubahan parameter Reservasi tersimpan/)).toBeTruthy();
        expect(log.filter((p) => p.url === "/settings" && p.method === "PUT").map((p) => p.data)).toEqual([{ settings: { "reservasi.horizon_hari": 999 } }, { settings: { "reservasi.horizon_hari": 120 } }]);
    });

    it("FR-20.1 A2: kelompok Kode Aset meminta konfirmasi dampak sebelum PUT", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/pengaturan?kelompok=KODE_ASET");
        const isian = await screen.findByLabelText("Penanda pemisah kode");
        await user.clear(isian);
        await user.type(isian, ".");
        await user.click(screen.getByRole("button", { name: "Simpan Kode Aset" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText(/hanya berlaku untuk aset yang didaftarkan sesudah perubahan/)).toBeTruthy();
        expect(log.some((p) => p.method === "PUT")).toBe(false);
        await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
        await waitFor(() => expect(log.find((p) => p.method === "PUT")?.data).toEqual({ settings: { "kode_aset.pemisah": "." } }));
    });

    it("keputusan 36d: hanya setting.view → isian baca-saja, tanpa Simpan, tanpa PUT", async () => {
        const log = server({ izin: ["setting.view"] });
        await renderAplikasi("/pengaturan?kelompok=RESERVASI");
        expect((await screen.findByLabelText("Horizon pemesanan (hari)") as HTMLInputElement).readOnly).toBe(true);
        expect(screen.queryByRole("button", { name: /^Simpan/ })).toBeNull();
        expect(screen.getByText(/hanya Administrator \(izin setting\.manage\)/)).toBeTruthy();
        expect(log.some((p) => p.method === "PUT")).toBe(false);
    });

    it("tanpa setting.view → P-08 di ketiga halaman", async () => {
        for (const path of ["/pengaturan", "/pengaturan/kalender-akademik", "/pengaturan/unit-kerja"]) {
            server({ izin: ["user.view"] });
            const { router } = await renderAplikasi(path);
            await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
        }
    });
});

describe("P-71 Kalender Akademik", () => {
    it("onboarding: tanpa tahun ajaran → formulir tahun pertama (AC-YR-01); POST membawa dua semester; tanpa pelanggaran axe", async () => {
        const log = server({ tahun: [] });
        const user = userEvent.setup();
        const { container } = await renderAplikasi("/pengaturan/kalender-akademik");
        expect(await screen.findByRole("heading", { name: "Buat tahun ajaran pertama" })).toBeTruthy();
        expect(screen.getByText(/otomatis menjadi tahun ajaran aktif/)).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
        await user.click(screen.getByRole("button", { name: "Simpan tahun ajaran" }));
        expect(screen.getByText(/Lengkapi nama, rentang tahun ajaran, dan kedua semester/)).toBeTruthy();
        await user.type(screen.getByLabelText(/Nama tahun ajaran/), "2026/2027");
        for (const [label, nilai] of [["Tanggal mulai", "2026-07-13"], ["Tanggal selesai", "2027-06-30"], ["Semester Ganjil mulai", "2026-07-13"], ["Semester Ganjil selesai", "2026-12-19"], ["Semester Genap mulai", "2027-01-04"], ["Semester Genap selesai", "2027-06-30"]] as const) {
            await user.type(screen.getByLabelText(new RegExp(`^${label}`)), nilai);
        }
        await user.click(screen.getByRole("button", { name: "Simpan tahun ajaran" }));
        await waitFor(() => expect(log.find((p) => p.url === "/academic-years" && p.method === "POST")?.data).toEqual({ nama: "2026/2027", tanggal_mulai: "2026-07-13", tanggal_selesai: "2027-06-30", semester: [{ nama: "GANJIL", tanggal_mulai: "2026-07-13", tanggal_selesai: "2026-12-19" }, { nama: "GENAP", tanggal_mulai: "2027-01-04", tanggal_selesai: "2027-06-30" }] }));
        expect(await screen.findByText("Tahun ajaran 2026/2027 dibuat dan aktif.")).toBeTruthy();
    });

    it("AC-YR-02: jadikan aktif → tautan Kenaikan Kelas; pemilih P-64 yang sudah ter-cache menampilkan tahun aktif baru", async () => {
        server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/pengguna/kenaikan-kelas");
        expect(await screen.findByRole("option", { name: "2026/2027 (aktif)" })).toBeTruthy();
        await router.navigate({ to: "/pengaturan/kalender-akademik" });
        await user.click(await screen.findByRole("button", { name: "Jadikan aktif" }));
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Jadikan aktif" }));
        const tautan = await screen.findByRole("link", { name: "Lanjut ke Kenaikan Kelas Massal" });
        expect(tautan.getAttribute("href")).toBe("/pengguna/kenaikan-kelas");
        await router.navigate({ to: "/pengguna/kenaikan-kelas" });
        expect(await screen.findByRole("option", { name: "2027/2028 (aktif)" })).toBeTruthy();
        expect(screen.queryByRole("option", { name: "2026/2027 (aktif)" })).toBeNull();
    });

    it("hari libur ditambahkan pada tahun ajaran terpilih; hari kerja disimpan", async () => {
        const log = server();
        const user = userEvent.setup();
        await renderAplikasi("/pengaturan/kalender-akademik");
        expect(await screen.findByText(/Hari Kemerdekaan/)).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Tambah hari libur" }));
        const form = screen.getByRole("form", { name: "Tambah hari libur" });
        await user.type(within(form).getByLabelText(/^Tanggal/), "2026-12-25");
        await user.type(within(form).getByLabelText(/Nama hari libur/), "Natal");
        await user.selectOptions(within(form).getByLabelText(/^Jenis/), "NASIONAL");
        await user.click(within(form).getByRole("button", { name: "Simpan hari libur" }));
        await waitFor(() => expect(log.find((p) => p.url === "/holidays" && p.method === "POST")?.data).toEqual({ tanggal: "2026-12-25", nama: "Natal", jenis: "NASIONAL", academic_year_id: 4 }));
        await user.click(screen.getByRole("checkbox", { name: "Sabtu" }));
        await user.click(screen.getByRole("button", { name: "Simpan hari kerja" }));
        await waitFor(() => expect(log.find((p) => p.url === "/work-days" && p.method === "PUT")?.data).toEqual({ hari_kerja: [1, 2, 3, 4, 5, 6, 7].map((hari) => ({ hari, aktif: hari <= 6 })) }));
    });

    it("setting.view saja → baca-saja: tanpa Tambah/Ubah/Jadikan aktif; tanpa onboarding saat kosong", async () => {
        server({ izin: ["setting.view"] });
        await renderAplikasi("/pengaturan/kalender-akademik");
        expect(await screen.findByText(/Hari Kemerdekaan/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Tambah|Jadikan aktif|Ubah|Simpan/ })).toBeNull();
        server({ izin: ["setting.view"], tahun: [] });
        await renderAplikasi("/pengaturan/kalender-akademik");
        expect((await screen.findAllByText("Belum ada tahun ajaran")).length).toBeGreaterThan(0);
        expect(screen.queryByRole("heading", { name: "Buat tahun ajaran pertama" })).toBeNull();
    });
});

describe("P-72 Unit Kerja", () => {
    it("daftar + saringan di URL + tambah; tanpa pelanggaran axe", async () => {
        const log = server();
        const user = userEvent.setup();
        const { container, router } = await renderAplikasi("/pengaturan/unit-kerja");
        expect(await screen.findByRole("row", { name: /Kelas XI-1/ })).toBeTruthy();
        expect(await pelanggaranAxe(container)).toEqual([]);
        await user.selectOptions(screen.getByLabelText("Jenis", { selector: "select" }), "KELAS");
        await waitFor(() => expect(router.state.location.search).toMatchObject({ jenis: "KELAS" }));
        await waitFor(() => expect(log.filter((p) => p.url === "/work-units").at(-1)?.params).toMatchObject({ "filter[jenis]": "KELAS" }));
        await user.click(screen.getByRole("button", { name: "Tambah unit kerja" }));
        const form = screen.getByRole("form", { name: "Tambah unit kerja" });
        await user.type(within(form).getByLabelText(/Nama unit/), "Kelas XII-2");
        await user.type(within(form).getByLabelText(/Kode unit/), "KELAS-XII2");
        await user.selectOptions(within(form).getByLabelText(/^Jenis/), "KELAS");
        await user.click(within(form).getByRole("button", { name: "Simpan unit kerja" }));
        await waitFor(() => expect(log.find((p) => p.url === "/work-units" && p.method === "POST")?.data).toEqual({ nama: "Kelas XII-2", kode: "KELAS-XII2", jenis: "KELAS" }));
    });

    it("nonaktifkan kelas lewat dialog → pemilih kelas P-64 yang sudah ter-cache tidak lagi menawarkannya", async () => {
        const log = server();
        const user = userEvent.setup();
        const { router } = await renderAplikasi("/pengguna/kenaikan-kelas");
        await waitFor(() => expect(screen.getAllByRole("option", { name: "Kelas XI-1" }).length).toBeGreaterThan(0));
        await router.navigate({ to: "/pengaturan/unit-kerja" });
        await user.click(await screen.findByRole("button", { name: "Nonaktifkan Kelas XI-1" }));
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Nonaktifkan" }));
        await waitFor(() => expect(log.find((p) => p.url === "/work-units/30/status")?.data).toEqual({ status: "NONAKTIF" }));
        expect(await screen.findByText("Unit Kelas XI-1 kini nonaktif.")).toBeTruthy();
        await router.navigate({ to: "/pengguna/kenaikan-kelas" });
        await screen.findByLabelText("Kelas untuk siswa terpilih");
        await waitFor(() => expect(screen.queryByRole("option", { name: "Kelas XI-1" })).toBeNull());
    });

    it("galat server (WU-02) ditampilkan di dialog", async () => {
        pasangServer((p) => {
            if (p.url === "/me") return sukses(me(ADMIN));
            if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
            if (p.url === "/work-units" && p.method === "GET") return halaman([{ id: "2", nama: "Tata Usaha", kode: "TU-01", jenis: "TATA_USAHA", kepala_unit_id: null, status: "AKTIF" }]);
            if (p.url === "/work-units/2/status") return gagal(422, "VALIDATION_ERROR", "Unit masih dipakai pengguna aktif.");
            return { status: 404 };
        });
        const user = userEvent.setup();
        await renderAplikasi("/pengaturan/unit-kerja");
        await user.click(await screen.findByRole("button", { name: "Nonaktifkan Tata Usaha" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Nonaktifkan" }));
        expect(await within(dialog).findByText("Unit masih dipakai pengguna aktif.")).toBeTruthy();
    });

    it("setting.view saja → tanpa aksi ubah/nonaktifkan", async () => {
        server({ izin: ["setting.view"] });
        await renderAplikasi("/pengaturan/unit-kerja");
        await screen.findAllByRole("row", { name: /Kelas XI-1/ });
        expect(screen.queryAllByRole("button", { name: /Nonaktifkan|Tambah unit kerja/ })).toEqual([]);
    });
});

describe("Temuan inspeksi PR-01-24", () => {
    const dasar = (p: Permintaan): Jawaban | undefined => {
        if (p.url === "/me") return sukses(me(ADMIN));
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        return undefined;
    };

    it("R24-01: mengubah unit mempertahankan kepala unit (PUT pengganti penuh)", async () => {
        const log = pasangServer((p) => {
            const d = dasar(p);
            if (d !== undefined) return d;
            if (p.url === "/work-units" && p.method === "GET") return halaman([{ id: "3", nama: "Kurikulum", kode: "KUR", jenis: "MANAJEMEN", kepala_unit_id: "5", status: "AKTIF" }]);
            if (p.url === "/work-units/3" && p.method === "PUT") return sukses({ ...(p.data as object), id: "3", kepala_unit_id: "5", status: "AKTIF" });
            return { status: 404 };
        });
        const user = userEvent.setup();
        await renderAplikasi("/pengaturan/unit-kerja");
        await user.click(await screen.findByRole("button", { name: "Ubah Kurikulum" }));
        const form = screen.getByRole("form", { name: "Ubah Kurikulum" });
        await user.type(within(form).getByLabelText(/Nama unit/), " Sekolah");
        await user.click(within(form).getByRole("button", { name: "Simpan unit kerja" }));
        await waitFor(() => expect(log.find((p) => p.method === "PUT")?.data).toEqual({ nama: "Kurikulum Sekolah", kode: "KUR", jenis: "MANAJEMEN", kepala_unit_id: 5 }));
    });

    it("R24-02: refetch latar tidak menjadikan isian yang tak disentuh sebagai perubahan; kunci yang disunting diberi peringatan bila server berubah", async () => {
        let horizon = 90;
        let ttl = 48;
        const log = pasangServer((p) => {
            const d = dasar(p);
            if (d !== undefined) return d;
            if (p.url === "/settings" && p.method === "GET") return halaman([{ ...RESERVASI[0], value: horizon }, { ...RESERVASI[1], value: ttl }]);
            if (p.url === "/settings" && p.method === "PUT") return sukses([{ ...RESERVASI[1], value: 24 }]);
            return { status: 404 };
        });
        const user = userEvent.setup();
        const { queryClient } = await renderAplikasi("/pengaturan?kelompok=RESERVASI");
        const ttlIsian = await screen.findByLabelText("TTL slot tentative (jam)");
        await user.clear(ttlIsian);
        await user.type(ttlIsian, "24");
        // Administrator lain mengubah horizon (tak disentuh di sini) dan TTL (sedang disunting).
        horizon = 120;
        ttl = 72;
        await queryClient.invalidateQueries({ queryKey: ["settings"] });
        await waitFor(() => expect((screen.getByLabelText("Horizon pemesanan (hari)") as HTMLInputElement).value).toBe("120"));
        expect(screen.getByText(/Nilai di server berubah menjadi 72 sejak Anda mulai menyunting/)).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Simpan Reservasi" }));
        await waitFor(() => expect(log.find((p) => p.method === "PUT")?.data).toEqual({ settings: { "reservasi.ttl_tentative_jam": 24 } }));
    });

    it("R24-03: tab kelompok lain terkunci selama simpan berjalan", async () => {
        let lepas: (j: Jawaban) => void = () => undefined;
        pasangServer((p) => {
            const d = dasar(p);
            if (d !== undefined) return d;
            if (p.url === "/settings" && p.method === "GET") return halaman(RESERVASI);
            if (p.url === "/settings" && p.method === "PUT") return new Promise<Jawaban>((r) => { lepas = r; });
            return { status: 404 };
        });
        const user = userEvent.setup();
        await renderAplikasi("/pengaturan?kelompok=RESERVASI");
        const isian = await screen.findByLabelText("Horizon pemesanan (hari)");
        await user.clear(isian);
        await user.type(isian, "100");
        await user.click(screen.getByRole("button", { name: "Simpan Reservasi" }));
        await waitFor(() => expect((screen.getByRole("tab", { name: "Denda" }) as HTMLButtonElement).disabled).toBe(true));
        lepas(sukses([{ ...RESERVASI[0], value: 100 }]));
        await waitFor(() => expect((screen.getByRole("tab", { name: "Denda" }) as HTMLButtonElement).disabled).toBe(false));
    });

    it("R24-04: selama hari libur disimpan, pemilih tahun dan aksi hari libur lain terkunci", async () => {
        let lepas: (j: Jawaban) => void = () => undefined;
        pasangServer((p) => {
            const d = dasar(p);
            if (d !== undefined) return d;
            if (p.url === "/academic-years") return halaman([{ id: "4", nama: "2026/2027", tanggal_mulai: "2026-07-13", tanggal_selesai: "2027-06-30", is_active: true, semester: [] }]);
            if (p.url === "/holidays" && p.method === "GET") return halaman([{ id: "9", tanggal: "2026-08-17", nama: "Hari Kemerdekaan", jenis: "NASIONAL", academic_year_id: "4" }, { id: "11", tanggal: "2026-10-28", nama: "Sumpah Pemuda", jenis: "SEKOLAH", academic_year_id: "4" }]);
            if (p.url === "/holidays/9" && p.method === "PUT") return new Promise<Jawaban>((r) => { lepas = r; });
            if (p.url === "/work-days") return sukses([1, 2, 3, 4, 5, 6, 7].map((hari) => ({ hari, aktif: hari <= 5 })));
            return { status: 404 };
        });
        const user = userEvent.setup();
        await renderAplikasi("/pengaturan/kalender-akademik");
        await user.click(await screen.findByRole("button", { name: "Ubah Hari Kemerdekaan" }));
        await user.click(screen.getByRole("button", { name: "Simpan hari libur" }));
        await waitFor(() => expect((screen.getByRole("button", { name: "Ubah Sumpah Pemuda" }) as HTMLButtonElement).disabled).toBe(true));
        expect((screen.getByLabelText("Tahun ajaran", { selector: "select" }) as HTMLSelectElement).disabled).toBe(true);
        lepas(sukses({ id: "9", tanggal: "2026-08-17", nama: "Hari Kemerdekaan", jenis: "NASIONAL", academic_year_id: "4" }));
        await waitFor(() => expect(screen.queryByRole("form", { name: "Ubah hari libur" })).toBeNull());
        expect((screen.getByRole("button", { name: "Ubah Sumpah Pemuda" }) as HTMLButtonElement).disabled).toBe(false);
    });
});

describe("Temuan inspeksi PR-01-24 ronde 2", () => {
    const dasar = (p: Permintaan): Jawaban | undefined => {
        if (p.url === "/me") return sukses(me(ADMIN));
        if (p.url === "/notifications") return { status: 200, data: { success: true, data: [], meta: { page: 1, per_page: 1, total: 0, total_pages: 1, unread_count: 0 } } };
        if (p.url === "/academic-years") return halaman([{ id: "4", nama: "2026/2027", tanggal_mulai: "2026-07-13", tanggal_selesai: "2027-06-30", is_active: true, semester: [] }, { id: "5", nama: "2027/2028", tanggal_mulai: "2027-07-12", tanggal_selesai: "2028-06-30", is_active: false, semester: [] }]);
        if (p.url === "/work-days") return sukses([1, 2, 3, 4, 5, 6, 7].map((hari) => ({ hari, aktif: hari <= 5 })));
        return undefined;
    };

    it("R24-05: hari libur berlaku umum tampil (berlabel) di setiap tahun dan tetap umum saat diubah", async () => {
        const log = pasangServer((p) => {
            const d = dasar(p);
            if (d !== undefined) return d;
            if (p.url === "/holidays" && p.method === "GET") return halaman([{ id: "1", tanggal: "2027-01-01", nama: "Tahun Baru Masehi", jenis: "NASIONAL", academic_year_id: null }, { id: "9", tanggal: "2026-08-17", nama: "Hari Kemerdekaan", jenis: "NASIONAL", academic_year_id: "4" }]);
            if (p.url === "/holidays/1" && p.method === "PUT") return sukses({ ...(p.data as object), id: "1", academic_year_id: null });
            return { status: 404 };
        });
        const user = userEvent.setup();
        await renderAplikasi("/pengaturan/kalender-akademik");
        expect(await screen.findByText(/Tahun Baru Masehi/)).toBeTruthy();
        expect(screen.getByText("Berlaku umum")).toBeTruthy();
        expect(log.find((p) => p.url === "/holidays")?.params["filter[academic_year_id]"]).toBeUndefined();
        await user.selectOptions(screen.getByLabelText("Tahun ajaran", { selector: "select" }), "5");
        expect(screen.getByText(/Tahun Baru Masehi/)).toBeTruthy();
        expect(screen.queryByText(/Hari Kemerdekaan/)).toBeNull();
        await user.click(screen.getByRole("button", { name: "Ubah Tahun Baru Masehi" }));
        await user.click(screen.getByRole("button", { name: "Simpan hari libur" }));
        await waitFor(() => expect(log.find((p) => p.method === "PUT")?.data).toMatchObject({ nama: "Tahun Baru Masehi", academic_year_id: null }));
    });

    it("R24-06: selama unit disimpan, pembuka penyunting lain terkunci; sukses menutup penyunting itu", async () => {
        let lepas: (j: Jawaban) => void = () => undefined;
        pasangServer((p) => {
            const d = dasar(p);
            if (d !== undefined) return d;
            if (p.url === "/work-units" && p.method === "GET") return halaman([{ id: "3", nama: "Kurikulum", kode: "KUR", jenis: "MANAJEMEN", kepala_unit_id: null, status: "AKTIF" }, { id: "4", nama: "Kesiswaan", kode: "KES", jenis: "MANAJEMEN", kepala_unit_id: null, status: "AKTIF" }]);
            if (p.url === "/work-units/3" && p.method === "PUT") return new Promise<Jawaban>((r) => { lepas = r; });
            return { status: 404 };
        });
        const user = userEvent.setup();
        await renderAplikasi("/pengaturan/unit-kerja");
        await user.click(await screen.findByRole("button", { name: "Ubah Kurikulum" }));
        await user.click(screen.getByRole("button", { name: "Simpan unit kerja" }));
        await waitFor(() => expect((screen.getByRole("button", { name: "Ubah Kesiswaan" }) as HTMLButtonElement).disabled).toBe(true));
        lepas(sukses({ id: "3", nama: "Kurikulum", kode: "KUR", jenis: "MANAJEMEN", kepala_unit_id: null, status: "AKTIF" }));
        await waitFor(() => expect(screen.queryByRole("form", { name: "Ubah Kurikulum" })).toBeNull());
        // Kunci dilepas pembersihan efek formulir yang dilepas — dapat tiba satu giliran render sesudahnya.
        await waitFor(() => expect((screen.getByRole("button", { name: "Ubah Kesiswaan" }) as HTMLButtonElement).disabled).toBe(false));
    });

    it("R24-07: halaman di luar jangkauan dikembalikan ke halaman terakhir yang ada", async () => {
        pasangServer((p) => {
            const d = dasar(p);
            if (d !== undefined) return d;
            if (p.url === "/work-units" && p.method === "GET") return p.params["page"] === 1 ? halaman([{ id: "3", nama: "Kurikulum", kode: "KUR", jenis: "MANAJEMEN", kepala_unit_id: null, status: "AKTIF" }]) : { status: 200, data: { success: true, data: [], meta: { page: 3, per_page: 25, total: 1, total_pages: 1 } } };
            return { status: 404 };
        });
        const { router } = await renderAplikasi("/pengaturan/unit-kerja?page=3");
        await waitFor(() => expect(router.state.location.search).not.toHaveProperty("page"));
        expect(await screen.findByRole("row", { name: /Kurikulum/ })).toBeTruthy();
    });
});
