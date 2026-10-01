// Acceptance PR-02-29 — "Kerangka dashboard + kartu per role" (FR-15.1, Bab 19, BR-073/074,
// PM-03, SDD-14 §4.3a; keputusan 82) terhadap PostgreSQL + Redis NYATA: "Kartu di luar
// permission tidak dirender DAN tidak dikirim server".

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { KyselyPlugin } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { ApprovalService } from "../../src/modules/m10-approval/index.js";
import { DashboardService, KARTU, TEMPLAT } from "../../src/modules/m15-dashboard/index.js";
import type { PenyimpanKartu } from "../../src/modules/m15-dashboard/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
import { getRedis } from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined && process.env["REDIS_URL"] !== undefined;
/** Rabu 30 September 2026, 09.00 WIB. */
const SEKARANG = new Date("2026-09-30T02:00:00Z");
const clock = new FixedClock(SEKARANG);
const logger = new Logger({ clock, tulis: () => undefined });
const JAM = 3_600_000;

/** Permission bawaan role (SDD-03 §matriks) — cukup untuk kartu Phase 02. */
const PERMS: Record<string, readonly string[]> = {
    "R-01": ["dashboard.view", "user.view", "user.reset_password", "activity_log.view", "approval_rule.view", "setting.view", "setting.manage", "asset.view", "approval.decide"],
    "R-02": ["dashboard.view", "asset.view", "asset.qr_print", "asset.view_financial", "approval.decide", "approval.view"],
    "R-03": ["dashboard.view", "asset.view", "asset.view_financial", "approval.decide", "activity_log.view"],
    "R-04": ["dashboard.view", "asset.view"],
    "R-05": ["dashboard.view", "asset.view", "approval.view"],
    "R-07": ["dashboard.view", "approval.view"],
};

const penggunaUji: number[] = [];
async function pengguna(kodeRole = "R-05", status: "AKTIF" | "NONAKTIF" = "AKTIF"): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Uji Dashboard', 'dash-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPDASH${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), '${status}', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

const ctxDari = (userId: number, role: string, perms: readonly string[] = PERMS[role] ?? []): AuthContext =>
    createAuthContext({ userId, roleCode: role, scopes: new Map<string, Scope>(perms.map((p) => [p, "all"])) });

let urut = 0;
const kode = (a: string) => `${a}-DSH-${String(++urut)}-${randomUUID().slice(0, 6)}`;
async function ruangan(): Promise<string> {
    const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('G', '${kode("G")}') RETURNING id::text`);
    const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${g!.id}, 'A', '${kode("A")}') RETURNING id::text`);
    const [r] = await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${a!.id}, 'R', '${kode("R")}', 'KELAS') RETURNING id::text`);
    return r!.id;
}
async function aset(room: string, o: { kondisi?: string; status?: string; qr?: boolean; nilai?: number; dihapuskan?: boolean } = {}): Promise<void> {
    const [k] = await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('K', '${kode("K")}') RETURNING id::text`);
    await kueri(`INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi, status, qr_terpasang, nilai_perolehan, dihapuskan)
                 VALUES ('${kode("B")}', 'Aset uji', ${k!.id}, 2024, 'PEMBELIAN', ${room}, '${o.kondisi ?? "BAIK"}', '${o.status ?? "TERSEDIA"}', ${String(o.qr ?? true)},
                         ${o.nilai === undefined ? "NULL" : String(o.nilai)}, ${String(o.dihapuskan ?? false)})`);
}

async function bersihkan(): Promise<void> {
    const r = getRedis();
    const kunci = await r.keys("dash:*");
    if (kunci.length > 0) await r.del(...kunci);
}

describe.skipIf(!ADA)("PR-02-29 — kerangka dashboard + kartu per role (acceptance)", () => {
    let server: Server;
    let url = "";

    beforeAll(async () => {
        dbmate("up");
        // `enableOfflineQueue: false`: tunggu koneksi siap, seperti readiness proses API (SDD-INF-04).
        const redis = getRedis();
        if (redis.status !== "ready") await new Promise((r) => redis.once("ready", r));
        const app = createApp({
            appBaseUrl: "https://sigm4.sekolah.test",
            health: new HealthRegistry(30).register(fcmCheck(null)),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: "http://minio:9000" },
            logger,
            clock,
            db: getDb(),
            auth: authPalsu(),
        });
        const luar = express();
        luar.use((req, res, next) => {
            const role = req.header("x-uji-role") ?? "R-05";
            const perms = req.header("x-uji-perms");
            setAuthContext(res, ctxDari(Number(req.header("x-uji-user")), role, perms === undefined ? undefined : perms.split(",").filter((p) => p !== "")));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
    });
    beforeEach(bersihkan);
    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        await bersihkan();
        await kueri("DELETE FROM approval_steps");
        await kueri("DELETE FROM approval_instances");
        await kueri("DELETE FROM approval_rule_steps");
        await kueri("DELETE FROM approval_rules");
        await kueri("DELETE FROM password_reset_requests");
        await kueri("DELETE FROM event_outbox WHERE event_name = 'UjiDashboardMati'");
        await kueri("DELETE FROM assets WHERE nama = 'Aset uji'");
        if (penggunaUji.length > 0) await kueri(`DELETE FROM users WHERE id IN (${penggunaUji.splice(0).join(",")})`);
    });

    type Balasan = { status: number; json: { data?: Record<string, unknown> & { kartu?: { id: string }[] }; error?: { code: string } } };
    const minta = async (user: number, role: string, path: string, perms?: readonly string[]): Promise<Balasan> => {
        const res = await fetch(`${url}${path}`, {
            headers: { "x-uji-user": String(user), "x-uji-role": role, ...(perms === undefined ? {} : { "x-uji-perms": perms.join(",") }) },
        });
        return { status: res.status, json: (await res.json()) as Balasan["json"] };
    };
    const isi = async <T = Record<string, unknown>>(user: number, role: string, id: string, q = "segarkan=true", perms?: readonly string[]): Promise<T> => {
        const r = await minta(user, role, `/dashboard/cards/${id}?${q}`, perms);
        expect(r.status, JSON.stringify(r.json)).toBe(200);
        return (r.json.data as unknown as { isi: T }).isi;
    };

    describe("manifes (FR-15.1 langkah 1–2, AC 4; keputusan 82b/c/e)", () => {
        it("templat per role mengikuti urutan UX §8.3; tanpa data; setiap kartu bersasaran drill-down (kecuali dead letter)", async () => {
            const admin = await pengguna("R-01");
            const r = await minta(admin, "R-01", "/dashboard");
            expect(r.status).toBe(200);
            expect(r.json.data?.["templat"]).toBe("R-01");
            const kartu = r.json.data!.kartu as { id: string; drilldown: string | null; zona: number }[];
            expect(kartu.map((k) => k.id)).toEqual(TEMPLAT["R-01"]);
            expect(kartu.every((k) => !("isi" in k))).toBe(true);
            expect(kartu.filter((k) => k.drilldown === null).map((k) => k.id)).toEqual(["efek-tertunda-gagal"]);
            for (const role of ["R-02", "R-03", "R-05", "R-07"]) {
                expect((await minta(admin, role, "/dashboard")).json.data!.kartu!.map((k) => k.id), role).toEqual(TEMPLAT[role]);
            }
        });

        it("kartu yang permission-nya tak dipegang TIDAK tercantum (PM-03, BR-073): nilai aset tanpa asset.view_financial, dead letter tanpa setting.manage", async () => {
            const u = await pengguna("R-03");
            const tanpaFinansial = PERMS["R-03"]!.filter((p) => p !== "asset.view_financial");
            expect((await minta(u, "R-03", "/dashboard", tanpaFinansial)).json.data!.kartu!.map((k) => k.id)).toEqual(["menunggu-persetujuan-saya", "kondisi-aset"]);
            const tanpaManage = PERMS["R-01"]!.filter((p) => p !== "setting.manage");
            expect((await minta(u, "R-01", "/dashboard", tanpaManage)).json.data!.kartu!.map((k) => k.id)).not.toContain("efek-tertunda-gagal");
            // Status Konfigurasi menuntut DUA permission.
            expect((await minta(u, "R-01", "/dashboard", PERMS["R-01"]!.filter((p) => p !== "setting.view"))).json.data!.kartu!.map((k) => k.id)).not.toContain("status-konfigurasi");
        });

        it("role tanpa templat (kustom) → templat null, kartu kosong; Teknisi → templat tanpa kartu berdata", async () => {
            const u = await pengguna();
            expect((await minta(u, "R-99", "/dashboard", ["dashboard.view", "user.view", "asset.view"])).json.data).toEqual({ templat: null, kartu: [] });
            expect((await minta(u, "R-04", "/dashboard")).json.data).toEqual({ templat: "R-04", kartu: [] });
        });

        it("Siswa tidak pernah menerima kartu finansial/pengguna lain walau diberi permissionnya (templat R-07)", async () => {
            const u = await pengguna("R-07");
            const kartu = (await minta(u, "R-07", "/dashboard", ["dashboard.view", "approval.view", "asset.view_financial", "user.view"])).json.data!.kartu!.map((k) => k.id);
            expect(kartu).toEqual(["pengajuan-saya"]);
        });
    });

    describe("GET /dashboard/cards/{id} — penolakan (PM-03, SEC)", () => {
        it("kartu di luar templat → 403 meski permission-nya dipegang; tanpa permission kartu → 403; tak dikenal → 404; tanpa dashboard.view → 403", async () => {
            const u = await pengguna();
            expect((await minta(u, "R-05", "/dashboard/cards/total-aset")).status).toBe(403);
            expect((await minta(u, "R-03", "/dashboard/cards/ringkasan-aset", PERMS["R-03"]!.filter((p) => p !== "asset.view_financial"))).status).toBe(403);
            expect((await minta(u, "R-03", "/dashboard/cards/tidak-ada")).status).toBe(404);
            expect((await minta(u, "R-03", "/dashboard/cards/kondisi-aset", ["asset.view"])).status).toBe(403);
            expect((await minta(u, "R-03", "/dashboard", ["asset.view"])).status).toBe(403);
            expect((await minta(u, "R-03", "/dashboard/cards/kondisi-aset?rentang=setahun")).status).toBe(400);
        });

        it("penolakan terjadi SEBELUM cache: isi yang di-cache pemegang hak tidak bocor ke yang tak berhak", async () => {
            const berhak = await pengguna("R-03");
            await isi(berhak, "R-03", "ringkasan-aset", "rentang=30_hari");
            const r = await minta(berhak, "R-03", "/dashboard/cards/ringkasan-aset", PERMS["R-03"]!.filter((p) => p !== "asset.view_financial"));
            expect(r.status).toBe(403);
            expect(JSON.stringify(r.json)).not.toContain("total_nilai");
        });
    });

    describe("isi kartu (Bab 19)", () => {
        it("aset: total/kondisi/status/QR/nilai dari satu ringkasan; aset dihapuskan tidak dihitung", async () => {
            const u = await pengguna("R-02");
            type A = { total: number; kondisi: Record<string, number>; status: Record<string, number>; jumlah: number; total_nilai: string };
            const ambil = async () => ({
                total: (await isi<A>(u, "R-02", "total-aset")).total,
                kondisi: (await isi<A>(u, "R-02", "komposisi-kondisi-aset")).kondisi,
                status: (await isi<A>(u, "R-02", "status-aset")).status,
                qr: (await isi<A>(u, "R-02", "aset-belum-berlabel-qr")).jumlah,
                nilai: Number((await isi<A>(u, "R-03", "ringkasan-aset")).total_nilai),
            });
            const awal = await ambil();
            const room = await ruangan();
            await aset(room, { kondisi: "RUSAK_RINGAN", status: "DIPINJAM", qr: false, nilai: 1_500_000 });
            await aset(room, { kondisi: "BAIK", status: "TERSEDIA", nilai: 500_000 });
            await aset(room, { kondisi: "BAIK", status: "TERSEDIA", qr: false });
            await aset(room, { kondisi: "HILANG", status: "TIDAK_TERSEDIA", qr: false, nilai: 9_000_000, dihapuskan: true });
            const akhir = await ambil();
            expect(akhir.total - awal.total).toBe(3);
            expect(akhir.kondisi["RUSAK_RINGAN"]! - awal.kondisi["RUSAK_RINGAN"]!).toBe(1);
            expect(akhir.kondisi["HILANG"]! - awal.kondisi["HILANG"]!).toBe(0);
            expect(akhir.status["DIPINJAM"]! - awal.status["DIPINJAM"]!).toBe(1);
            expect(akhir.qr - awal.qr).toBe(2);
            expect(akhir.nilai - awal.nilai).toBe(2_000_000);
        });

        it("pengguna: AKTIF per role (nonaktif tidak dihitung); Distribusi Role memakai data yang sama", async () => {
            const admin = await pengguna("R-01");
            type P = { total: number; per_role: { kode: string; jumlah: number }[] };
            const awal = await isi<P>(admin, "R-01", "pengguna-aktif");
            await pengguna("R-06");
            await pengguna("R-06", "NONAKTIF");
            const akhir = await isi<P>(admin, "R-01", "pengguna-aktif");
            const staf = (p: P) => p.per_role.find((r) => r.kode === "R-06")!.jumlah;
            expect(akhir.total - awal.total).toBe(1);
            expect(staf(akhir) - staf(awal)).toBe(1);
            expect((await isi<P>(admin, "R-01", "distribusi-role")).per_role).toEqual(akhir.per_role);
        });

        it("Login Hari Ini: sukses & gagal 24 jam terakhir; entri lebih lama tidak dihitung", async () => {
            const admin = await pengguna("R-01");
            const awal = await isi<{ sukses: number; gagal: number }>(admin, "R-01", "login-hari-ini");
            const tulis = (pada: Date, aksi: string) =>
                withTransaction(ctxDari(admin, "R-01"), (s) => new AuditLogger({ clock: new FixedClock(pada) }).write(s, { modul: "m01-auth", aksi }), getDb());
            await tulis(new Date(SEKARANG.getTime() - JAM), "LOGIN_SUCCESS");
            await tulis(new Date(SEKARANG.getTime() - 2 * JAM), "LOGIN_SUCCESS");
            await tulis(new Date(SEKARANG.getTime() - 3 * JAM), "LOGIN_FAILED");
            await tulis(new Date(SEKARANG.getTime() - 25 * JAM), "LOGIN_FAILED");
            const akhir = await isi<{ sukses: number; gagal: number }>(admin, "R-01", "login-hari-ini");
            expect([akhir.sukses - awal.sukses, akhir.gagal - awal.gagal]).toEqual([2, 1]);
        });

        it("Aktivitas Terbaru: 10 entri; ACTIVITY_LOG_VIEWED tercatat pada SETIAP penyajian, termasuk dari cache (keputusan 82f)", async () => {
            const admin = await pengguna("R-01");
            const dilihat = async () =>
                Number((await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM activity_logs WHERE user_id = ${String(admin)} AND aksi = 'ACTIVITY_LOG_VIEWED' AND nilai_sesudah->>'sumber' = 'dashboard'`))[0]?.n);
            // Mandiri: cukup entri meski berkas ini berjalan pertama pada basis data baru.
            for (let i = 0; i < 11; i += 1) {
                await withTransaction(ctxDari(admin, "R-01"), (s) => new AuditLogger({ clock }).write(s, { modul: "m02-users", aksi: "USER_UPDATED", keterangan: `uji ${String(i)}` }), getDb());
            }
            const pertama = await isi<{ entri: { aksi: string; waktu: string }[] }>(admin, "R-01", "aktivitas-terbaru", "rentang=30_hari");
            expect(pertama.entri.length).toBe(10);
            const [terbaru] = await kueri<{ w: string }>("SELECT to_char(max(waktu) at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS w FROM activity_logs");
            expect(pertama.entri[0]?.waktu).toBe(terbaru?.w);
            const waktu = pertama.entri.map((e) => e.waktu);
            expect([...waktu].sort().reverse()).toEqual(waktu);
            await isi(admin, "R-01", "aktivitas-terbaru", "rentang=30_hari"); // dari cache
            expect(await dilihat()).toBe(2);
            // Kartu hitungan berbasis log tidak mencatat.
            await isi(admin, "R-01", "login-hari-ini");
            expect(await dilihat()).toBe(2);
        });

        it("Permintaan Reset Password: jumlah MENUNGGU + terlama dulu", async () => {
            const admin = await pengguna("R-01");
            const awal = (await isi<{ jumlah: number }>(admin, "R-01", "permintaan-reset-password")).jumlah;
            const [a, b, c] = [await pengguna(), await pengguna(), await pengguna()];
            await kueri(`INSERT INTO password_reset_requests (user_id, status, diminta_pada, diproses_oleh, diproses_pada, alasan_penolakan)
                         VALUES (${String(c)}, 'DITOLAK', now() - interval '5 hour', ${String(admin)}, now(), 'uji')`);
            await kueri(`INSERT INTO password_reset_requests (user_id, status, diminta_pada) VALUES (${String(a)}, 'MENUNGGU', now() - interval '1 hour'), (${String(b)}, 'MENUNGGU', now() - interval '3 hour')`);
            const r = await isi<{ jumlah: number; daftar: { user_id: number }[] }>(admin, "R-01", "permintaan-reset-password");
            expect(r.jumlah - awal).toBe(2);
            const urutan = r.daftar.map((d) => d.user_id).filter((id) => id === a || id === b);
            expect(urutan).toEqual([b, a]);
        });

        it("Status Konfigurasi: aturan aktif per jenis + jenis tanpa aturan + kekurangan dasar (parameter TEKS kosong)", async () => {
            const admin = await pengguna("R-01");
            await kueri(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas) VALUES ('PENGADAAN_BARANG', '{}', 50)`);
            await kueri("UPDATE approval_rules SET status_aktif = false WHERE jenis_pengajuan = 'PERMINTAAN_BAHAN'");
            await kueri(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas, status_aktif) VALUES ('PERMINTAAN_BAHAN', '{}', 50, false)`);
            await kueri(`INSERT INTO system_settings (key, kelompok, tipe, value, nilai_bawaan, deskripsi) VALUES ('uji.dashboard_teks', 'KEAMANAN', 'TEKS', '""', '""', 'uji')`);
            try {
                const r = await isi<{ aturan_aktif: { jenis: string; jumlah: number }[]; jenis_tanpa_aturan: string[]; kekurangan: { kode: string; pesan: string }[] }>(admin, "R-01", "status-konfigurasi");
                expect(r.aturan_aktif.find((a) => a.jenis === "PENGADAAN_BARANG")?.jumlah).toBeGreaterThanOrEqual(1);
                expect(r.jenis_tanpa_aturan).not.toContain("PENGADAAN_BARANG");
                // Aturan nonaktif tidak dihitung aktif.
                expect(r.jenis_tanpa_aturan).toContain("PERMINTAAN_BAHAN");
                expect(r.aturan_aktif.map((a) => a.jenis)).not.toContain("PERMINTAAN_BAHAN");
                expect(r.kekurangan).toContainEqual({ kode: "PARAMETER_KOSONG", pesan: "Parameter uji.dashboard_teks belum diisi." });
                // Parameter TEKS yang terisi (bawaan `kode_aset.pemisah` = "-") bukan kekurangan.
                expect(r.kekurangan.map((k) => k.pesan)).not.toContain("Parameter kode_aset.pemisah belum diisi.");
            } finally {
                await kueri("DELETE FROM system_settings WHERE key = 'uji.dashboard_teks'");
                await kueri("UPDATE approval_rules SET status_aktif = false WHERE jenis_pengajuan = 'PENGADAAN_BARANG'");
            }
        });

        it("Kesehatan Integrasi: status fcm dari registri health (OBS-06); Efek Tertunda Gagal: jumlah + lima teratas TANPA payload", async () => {
            const admin = await pengguna("R-01");
            expect(await isi(admin, "R-01", "kesehatan-integrasi")).toEqual({ fcm: expect.objectContaining({ status: "degraded", note: "FCM_CREDENTIALS tidak dikonfigurasi — push dilewati" }) });
            const awal = await isi<{ jumlah: number }>(admin, "R-01", "efek-tertunda-gagal");
            await kueri(`INSERT INTO event_outbox (event_name, aggregate_type, aggregate_id, payload, attempts, last_error)
                         VALUES ('UjiDashboardMati', 'uji', 1, '{"rahasia":"nik-123"}', 5, 'galat uji'), ('UjiDashboardMati', 'uji', 2, '{}', 4, 'belum mati')`);
            const r = await minta(admin, "R-01", "/dashboard/cards/efek-tertunda-gagal?segarkan=true");
            const e = (r.json.data as unknown as { isi: { jumlah: number; daftar: { event_name: string; last_error: string }[] } }).isi;
            expect(e.jumlah - awal.jumlah).toBe(1);
            expect(e.daftar[0]).toMatchObject({ event_name: "UjiDashboardMati", last_error: "galat uji" });
            expect(JSON.stringify(r.json)).not.toContain("nik-123");
        });

        it("Pengajuan Saya: milik pemanggil saja, dalam rentang, per status (bernilai 0 bila kosong)", async () => {
            const u = await pengguna("R-05");
            const lain = await pengguna("R-05");
            const sisip = (pemohon: number, status: string, umurHari: number) =>
                kueri(`INSERT INTO approval_instances (jenis_pengajuan, referensi_id, pemohon_id, rule_snapshot, langkah_aktif, status, created_at, diselesaikan_pada)
                       VALUES ('PENGADAAN_BARANG', ${String(800_000 + ++urut)}, ${String(pemohon)}, '{}', 1, '${status}', '${new Date(SEKARANG.getTime() - umurHari * 24 * JAM).toISOString()}',
                               ${status === "MENUNGGU" ? "NULL" : "now()"})`);
            await sisip(u, "MENUNGGU", 1);
            await sisip(u, "DISETUJUI", 5);
            await sisip(u, "DITOLAK", 20);
            await sisip(lain, "MENUNGGU", 1);
            type S = { per_status: Record<string, number> };
            expect((await isi<S>(u, "R-05", "pengajuan-saya", "rentang=7_hari&segarkan=true")).per_status).toEqual({ MENUNGGU: 1, DISETUJUI: 1, DITOLAK: 0, PERLU_REVISI: 0, DIBATALKAN: 0 });
            expect((await isi<S>(u, "R-05", "pengajuan-saya", "rentang=30_hari&segarkan=true")).per_status["DITOLAK"]).toBe(1);
            // Kartu berlingkup PENGGUNA: cache tidak dibagi.
            expect((await isi<S>(lain, "R-05", "pengajuan-saya", "rentang=7_hari")).per_status["DISETUJUI"]).toBe(0);
        });

        it("Pengajuan Menunggu: kotak masuk pemutus sah yang sama dengan GET /approvals/pending", async () => {
            const pemutus = await pengguna("R-02");
            const pemohon = await pengguna("R-05");
            const [rule] = await kueri<{ id: string }>(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas) VALUES ('PENGADAAN_BARANG', '{}', 99) RETURNING id::text`);
            await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_user_id, sla_jam) VALUES (${rule!.id}, 1, 'user', ${String(pemutus)}, 8)`);
            try {
                await withTransaction(ctxDari(pemohon, "R-05"), (s) => new ApprovalService(getDb(), new AuditLogger({ clock }), clock).createInstance(s, { jenis: "PENGADAAN_BARANG", referensiId: 900_000 + ++urut, pemohonId: pemohon, fakta: {} }), getDb());
                const r = await isi<{ jumlah: number; daftar: { pemohon: { id: number } }[] }>(pemutus, "R-02", "pengajuan-menunggu");
                expect(r.jumlah).toBe(1);
                expect(r.daftar[0]?.pemohon.id).toBe(pemohon);
                expect((await isi<{ jumlah: number }>(pemohon, "R-03", "menunggu-persetujuan-saya")).jumlah).toBe(0);
            } finally {
                await kueri(`UPDATE approval_rules SET status_aktif = false WHERE id = ${rule!.id}`);
            }
        });
    });

    describe("rentang & cache (19.1; keputusan 82d/h)", () => {
        it("cache 5 menit: data berubah tak terlihat sampai segarkan=true; diperbarui_pada ikut; kartu keadaan-kini mengabaikan rentang", async () => {
            const u = await pengguna("R-02");
            const baca = (q: string) => minta(u, "R-02", `/dashboard/cards/total-aset?${q}`);
            const pertama = (await baca("")).json.data as unknown as { isi: { total: number }; rentang: unknown; diperbarui_pada: string };
            expect(pertama.rentang).toBeNull();
            expect(pertama.diperbarui_pada).toBe(SEKARANG.toISOString());
            expect(await getRedis().ttl("dash:total-aset:-:g")).toBeGreaterThan(290);
            await aset(await ruangan());
            expect(((await baca("rentang=7_hari")).json.data as unknown as { isi: { total: number } }).isi.total).toBe(pertama.isi.total);
            expect(((await baca("segarkan=true")).json.data as unknown as { isi: { total: number } }).isi.total).toBe(pertama.isi.total + 1);
        });

        it("rentang 7/30 hari dari Clock; semester & tahun ajaran dari periode akademik aktif — 422 bila belum ada", async () => {
            const admin = await pengguna("R-01");
            const r7 = (await minta(admin, "R-01", "/dashboard/cards/aktivitas-sistem?rentang=7_hari")).json.data as unknown as { rentang: { mulai: string; akhir: string } };
            expect(r7.rentang).toEqual({ jenis: "7_hari", mulai: "2026-09-23T02:00:00.000Z", akhir: SEKARANG.toISOString() });
            const aktif = await kueri<{ id: string }>("SELECT id::text FROM academic_years WHERE is_active");
            await kueri("UPDATE academic_years SET is_active = false WHERE is_active");
            try {
                const tolak = await minta(admin, "R-01", "/dashboard/cards/aktivitas-sistem?rentang=semester");
                expect(tolak.status).toBe(422);
                const kode = async () => (await isi<{ kekurangan: { kode: string }[] }>(admin, "R-01", "status-konfigurasi")).kekurangan.map((k) => k.kode);
                expect(await kode()).toContain("TAHUN_AJARAN_AKTIF_BELUM_ADA");
                const [y] = await kueri<{ id: string }>(`INSERT INTO academic_years (nama, tanggal_mulai, tanggal_selesai, is_active) VALUES ('Uji ${randomUUID().slice(0, 4)}', '2026-07-13', '2027-06-30', true) RETURNING id::text`);
                await kueri(`INSERT INTO academic_terms (academic_year_id, nama, tanggal_mulai, tanggal_selesai) VALUES (${y!.id}, 'GENAP', '2027-01-04', '2027-06-30'), (${y!.id}, 'GANJIL', '2026-07-13', '2026-12-19')`);
                try {
                    expect(await kode()).not.toContain("TAHUN_AJARAN_AKTIF_BELUM_ADA");
                    const sem = (await minta(admin, "R-01", "/dashboard/cards/aktivitas-sistem?rentang=semester")).json.data as unknown as { rentang: unknown };
                    expect(sem.rentang).toEqual({ jenis: "semester", mulai: "2026-07-12T17:00:00.000Z", akhir: "2026-12-19T17:00:00.000Z" });
                    const th = (await minta(admin, "R-01", "/dashboard/cards/aktivitas-sistem?rentang=tahun_ajaran")).json.data as unknown as { rentang: unknown };
                    expect(th.rentang).toEqual({ jenis: "tahun_ajaran", mulai: "2026-07-12T17:00:00.000Z", akhir: "2027-06-30T17:00:00.000Z" });
                } finally {
                    await kueri(`DELETE FROM academic_terms WHERE academic_year_id = ${y!.id}`);
                    await kueri(`DELETE FROM academic_years WHERE id = ${y!.id}`);
                }
            } finally {
                if (aktif.length > 0) await kueri(`UPDATE academic_years SET is_active = true WHERE id = ${aktif[0]!.id}`);
            }
        });
    });

    it("SDD-PERF-02: jumlah kueri kartu agregat TIDAK tumbuh bersama data (bukan N+1)", async () => {
        let n = 0;
        const penghitung: KyselyPlugin = {
            transformQuery: (a) => {
                n += 1;
                return a.node;
            },
            transformResult: (a) => Promise.resolve(a.result),
        };
        const db = getDb().withPlugin(penghitung);
        const peta = new Map<string, string>();
        const cache: PenyimpanKartu = { baca: (k) => Promise.resolve(peta.get(k) ?? null), tulis: (k, v) => Promise.resolve(void peta.set(k, v)) };
        const service = new DashboardService(clock, { db, audit: new AuditLogger({ clock }), integrasi: () => Promise.resolve({}), menungguSaya: () => Promise.resolve({ total: 0, rows: [] }) }, cache);
        const u = await pengguna("R-02");
        const hitung = async (id: string, role: string) => {
            n = 0;
            await service.kartu(ctxDari(u, role), id, { rentang: "30_hari", segarkan: true });
            return n;
        };
        const sebelum = { aset: await hitung("total-aset", "R-02"), pengguna: await hitung("pengguna-aktif", "R-01"), saya: await hitung("pengajuan-saya", "R-05") };
        const room = await ruangan();
        for (let i = 0; i < 12; i += 1) await aset(room);
        for (let i = 0; i < 5; i += 1) await pengguna("R-05");
        const sesudah = { aset: await hitung("total-aset", "R-02"), pengguna: await hitung("pengguna-aktif", "R-01"), saya: await hitung("pengajuan-saya", "R-05") };
        expect(sesudah).toEqual(sebelum);
        expect(sebelum.aset).toBeLessThanOrEqual(3);
    });

    it("registri: setiap kartu templat terdaftar dan mendeklarasikan permission (PM-03)", () => {
        for (const [role, ids] of Object.entries(TEMPLAT)) {
            for (const id of ids) {
                expect(KARTU.get(id), `${role}:${id}`).toBeDefined();
                expect(KARTU.get(id)!.permissions.length, id).toBeGreaterThan(0);
            }
        }
    });
});
