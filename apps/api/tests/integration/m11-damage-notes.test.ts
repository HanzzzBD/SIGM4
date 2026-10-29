// Acceptance PR-03-31 (FR-11.1 A1, FR-07.4 A2; keputusan 25 log phase-03): catatan tambahan ke tiket terbuka
// dan laporan tertaut reservasi ruangan — HTTP penuh lewat `createApp()` terhadap PostgreSQL nyata.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { DamageReportCreated, DamageReportDetail, DamageReportNote } from "@sigm4/schemas";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const clock = new FixedClock(new Date("2027-11-08T03:00:00Z"));
const unik = (a: string) => `CTT${a}${randomUUID().slice(0, 6)}`;

interface Peran {
    readonly id: number;
    readonly perms: readonly string[];
}
type Jawaban<T> = { status: number; json: { data: T; error?: { code: string; message: string; details?: { field: string; message: string }[] } } };

describe.skipIf(!ADA)("PR-03-31 — catatan tiket kerusakan + tautan reservasi (acceptance)", () => {
    let server: Server;
    let url = "";
    let gedung = "";
    let area = "";
    let kategori = "";
    const ruang = { utama: "", lain: "" };
    let aset = "";
    const pengguna: Record<"pelapor" | "penemu" | "petugas" | "tanpaIzin", Peran> = {} as never;
    let sejakLog = 0;

    beforeAll(async () => {
        dbmate("up");
        const app = createApp({
            appBaseUrl: "https://sigm4.sekolah.test",
            health: new HealthRegistry(30).register(fcmCheck(null)),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: "http://minio:9000" },
            logger: new Logger({ clock, tulis: () => undefined }),
            clock,
            db: getDb(),
            auth: authPalsu(),
        });
        const luar = express();
        luar.use((req, res, next) => {
            const perms = (req.header("x-uji-perms") ?? "").split(",").filter((p) => p !== "");
            setAuthContext(res, createAuthContext({ userId: Number(req.header("x-uji-user")), roleCode: "R-05", scopes: new Map<string, Scope>(perms.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) }));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;

        const buat = async (role: string, nama: string, perms: readonly string[]): Promise<Peran> => {
            const [u] = await kueri<{ id: string }>(`
                INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
                VALUES ('${nama}', '${unik("u")}@uji-m11c.sch.id', 'x', '${unik("N")}', (SELECT id FROM roles WHERE kode = '${role}'), 'AKTIF', false) RETURNING id::text`);
            return { id: Number(u?.id), perms };
        };
        const PELAPOR = ["damage.create", "damage.view:own"];
        pengguna.pelapor = await buat("R-05", "Pak Budi Pelapor", PELAPOR);
        pengguna.penemu = await buat("R-07", "Siswa Penemu", PELAPOR);
        pengguna.petugas = await buat("R-02", "Bu Sari Petugas", ["damage.create", "damage.view", "damage.verify", "reservation.record_usage"]);
        pengguna.tanpaIzin = await buat("R-05", "Tanpa Izin", ["damage.view:own"]);

        gedung = (await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung Catatan', '${unik("G")}') RETURNING id::text`))[0]?.id ?? "";
        area = (await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedung}, 'Lt 1', '${unik("A")}') RETURNING id::text`))[0]?.id ?? "";
        const ruangan = async (nama: string) => (await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas) VALUES (${area}, '${nama}', '${unik("R")}', 'AULA', 100) RETURNING id::text`))[0]?.id ?? "";
        ruang.utama = await ruangan("Aula Catatan");
        ruang.lain = await ruangan("Ruang Rapat Catatan");
        kategori = (await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('Proyektor Catatan', '${unik("K")}') RETURNING id::text`))[0]?.id ?? "";
        aset = (await kueri<{ id: string }>(`INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi)
            VALUES ('${unik("B")}', 'Proyektor Aula', ${kategori}, 2024, 'PEMBELIAN', ${ruang.utama}, 'BAIK') RETURNING id::text`))[0]?.id ?? "";
    });
    beforeEach(async () => {
        sejakLog = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
    });
    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const ids = Object.values(pengguna).map((p) => p.id).join(",");
        const laporan = `SELECT id FROM damage_reports WHERE pelapor_id IN (${ids})`;
        await kueri(`DELETE FROM damage_report_note_photos WHERE note_id IN (SELECT id FROM damage_report_notes WHERE damage_report_id IN (${laporan}))`);
        await kueri(`DELETE FROM damage_report_notes WHERE damage_report_id IN (${laporan})`);
        await kueri(`DELETE FROM notifications WHERE user_id IN (${ids})`);
        await kueri(`DELETE FROM event_outbox WHERE aggregate_type = 'damage_report' AND aggregate_id::bigint IN (${laporan})`);
        await kueri(`DELETE FROM damage_report_photos WHERE damage_report_id IN (${laporan})`);
        await kueri(`DELETE FROM damage_reports WHERE pelapor_id IN (${ids})`);
        await kueri(`DELETE FROM reservations WHERE pemohon_id IN (${ids})`);
        await kueri(`DELETE FROM stored_files WHERE uploaded_by IN (${ids})`);
        await kueri(`DELETE FROM assets WHERE category_id = ${kategori}`);
        await kueri(`DELETE FROM asset_categories WHERE id = ${kategori}`);
        await kueri(`DELETE FROM rooms WHERE area_id = ${area}`);
        await kueri(`DELETE FROM areas WHERE id = ${area}`);
        await kueri(`DELETE FROM buildings WHERE id = ${gedung}`);
        await kueri(`DELETE FROM users WHERE id IN (${ids})`);
    });

    async function kirim<T>(metode: "GET" | "POST", path: string, siapa: Peran, body?: unknown): Promise<Jawaban<T>> {
        const r = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", "x-uji-user": String(siapa.id), "x-uji-perms": siapa.perms.join(",") },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: r.status, json: (await r.json()) as Jawaban<T>["json"] };
    }
    async function foto(siapa: Peran, terkonfirmasi = false): Promise<number> {
        const [b] = await kueri<{ id: string }>(`INSERT INTO stored_files (object_key, mime, ukuran, checksum, scan_status, owner_type, uploaded_by)
            VALUES ('damage/2027/11/${randomUUID()}.jpg', 'image/jpeg', 2048, ${terkonfirmasi ? `'${"a".repeat(64)}'` : "NULL"}, 'PENDING', 'DAMAGE_PHOTO', ${String(siapa.id)}) RETURNING id::text`);
        return Number(b?.id);
    }
    const lapor = async (siapa: Peran, body: Record<string, unknown>) => kirim<DamageReportCreated>("POST", "/damage-reports", siapa, { deskripsi: "Lampu proyektor mati", urgensi: "SEDANG", foto_file_ids: [await foto(siapa)], ...body });
    const catat = (siapa: Peran, id: string, body: Record<string, unknown>) => kirim<DamageReportNote>("POST", `/damage-reports/${id}/notes`, siapa, body);
    const detail = (siapa: Peran, id: string) => kirim<DamageReportDetail>("GET", `/damage-reports/${id}`, siapa);
    const log = (aksi: string) => kueri<{ entitas_id: string; nilai_sesudah: Record<string, unknown> }>(`SELECT entitas_id, nilai_sesudah FROM activity_logs WHERE aksi = '${aksi}' AND id > ${String(sejakLog)} ORDER BY id`);
    // Nomor unik per panggilan: angka acak 3 digit pernah bertabrakan (reservations_nomor_uq)
    // pada tiga reservasi dalam satu uji (CI #220). Basis acak 9 digit menjauhkan dari nomor
    // berkas uji lain; penghitung menjamin keunikan di berkas ini.
    let nomorBerikut = 100_000_000 + Math.floor(Math.random() * 800_000_000);
    const reservasi = async (o: { room: string; status: string; jenis?: string }) =>
        (await kueri<{ id: string }>(`INSERT INTO reservations (nomor, jenis, pemohon_id, room_id, nama_kegiatan, jenis_kegiatan, waktu_mulai, waktu_selesai, jumlah_peserta, status)
            VALUES ('RSV-RG-2027-${String(nomorBerikut++)}', 'RUANGAN', ${String(pengguna.pelapor.id)}, ${o.room}, 'Seminar', 'Seminar', '2027-11-07 08:00+07', '2027-11-07 10:00+07', 40, '${o.status}') RETURNING id::text`))[0]?.id ?? "";
    const tutupTiket = (id: string) => kueri(`UPDATE damage_reports SET status = 'SELESAI' WHERE id = ${id}`);

    describe("POST /damage-reports/{id}/notes (FR-11.1 A1)", () => {
        it("penemu kedua (bukan pelapor) menambah keterangan + foto ke tiket terbuka; catatan tampil di detail; DAMAGE_INFO_ADDED", async () => {
            const t = await lapor(pengguna.pelapor, { asset_id: Number(aset) });
            expect(t.status).toBe(201);
            const f1 = await foto(pengguna.penemu);
            const f2 = await foto(pengguna.penemu, true);
            const r = await catat(pengguna.penemu, t.json.data.id, { keterangan: "Kabel daya juga terkelupas", foto_file_ids: [f1, f2] });
            expect(r.status).toBe(201);
            expect(r.json.data).toMatchObject({ keterangan: "Kabel daya juga terkelupas", penulis: { id: String(pengguna.penemu.id), nama: "Siswa Penemu" } });
            expect(r.json.data.foto.map((f) => [f.file_id, f.status])).toEqual([[String(f1), "BELUM_TERUNGGAH"], [String(f2), "PENDING"]]);
            // Foto kini milik tiket (SDD-FS-02) — tidak dapat dipakai ulang.
            expect((await kueri<{ o: string }>(`SELECT owner_id::text AS o FROM stored_files WHERE id = ${String(f1)}`))[0]?.o).toBe(t.json.data.id);
            const d = await detail(pengguna.petugas, t.json.data.id);
            expect(d.json.data.catatan).toHaveLength(1);
            expect(d.json.data.catatan[0]?.keterangan).toBe("Kabel daya juga terkelupas");
            expect(await log("DAMAGE_INFO_ADDED")).toEqual([{ entitas_id: t.json.data.id, nilai_sesudah: { catatan_id: r.json.data.id, foto: 2, foto_tertunda: 1 } }]);
        });

        it("tiket sudah ditutup → 422 field id, tanpa catatan maupun log", async () => {
            const t = await lapor(pengguna.pelapor, { room_id: Number(ruang.lain) });
            await tutupTiket(t.json.data.id);
            const r = await catat(pengguna.penemu, t.json.data.id, { keterangan: "Masih rusak" });
            expect(r.status).toBe(422);
            expect(r.json.error?.details?.[0]?.field).toBe("id");
            expect(await kueri(`SELECT 1 FROM damage_report_notes WHERE damage_report_id = ${t.json.data.id}`)).toEqual([]);
            expect(await log("DAMAGE_INFO_ADDED")).toEqual([]);
        });

        it("foto milik orang lain / jenis lain ditolak 422 dan catatan TIDAK terbentuk (atomik)", async () => {
            const t = await lapor(pengguna.pelapor, { asset_id: Number(aset) }).then(async (r) => (r.status === 201 ? r : { json: { data: { id: (await kueri<{ id: string }>(`SELECT id::text FROM damage_reports WHERE asset_id = ${aset} AND status = 'DILAPORKAN'`))[0]?.id ?? "" } } }));
            const milikLain = await foto(pengguna.pelapor);
            const r = await catat(pengguna.penemu, t.json.data.id, { keterangan: "Foto bukan milik saya", foto_file_ids: [milikLain] });
            expect(r.status).toBe(422);
            expect(await kueri(`SELECT 1 FROM damage_report_notes WHERE keterangan = 'Foto bukan milik saya'`)).toEqual([]);
        });

        it("keterangan kosong / >5 foto → 422; tiket tak ada → 404; tanpa damage.create → 403", async () => {
            const t = (await kueri<{ id: string }>(`SELECT id::text FROM damage_reports WHERE asset_id = ${aset} AND status = 'DILAPORKAN'`))[0]?.id ?? "";
            expect((await catat(pengguna.penemu, t, { keterangan: "  " })).status).toBe(422);
            expect((await catat(pengguna.penemu, t, { keterangan: "x", foto_file_ids: [1, 2, 3, 4, 5, 6] })).status).toBe(422);
            expect((await catat(pengguna.penemu, "999999999", { keterangan: "x" })).status).toBe(404);
            expect((await catat(pengguna.tanpaIzin, t, { keterangan: "x" })).status).toBe(403);
        });
    });

    describe("reservation_id pada POST /damage-reports (FR-07.4 A2)", () => {
        it("pencatat penggunaan menautkan reservasi ruangan yang sama (Selesai); detail menampilkan nomornya; log memuat reservation_id", async () => {
            const rv = await reservasi({ room: ruang.utama, status: "SELESAI" });
            const r = await lapor(pengguna.petugas, { room_id: Number(ruang.utama), reservation_id: Number(rv) });
            expect(r.status).toBe(201);
            const d = await detail(pengguna.petugas, r.json.data.id);
            expect(d.json.data.reservasi).toMatchObject({ id: rv });
            expect(d.json.data.reservasi?.nomor).toMatch(/^RSV-RG-2027-/);
            expect((await log("DAMAGE_REPORTED"))[0]?.nilai_sesudah["reservation_id"]).toBe(Number(rv));
            await tutupTiket(r.json.data.id);
        });

        it("reservasi ruangan lain, belum berlangsung, atau tak ada → 422 reservation_id; tanpa record_usage → 403; tanpa ruangan → 422", async () => {
            const lain = await reservasi({ room: ruang.lain, status: "SELESAI" });
            const belum = await reservasi({ room: ruang.utama, status: "DISETUJUI" });
            for (const rv of [lain, belum, "999999999"]) {
                const r = await lapor(pengguna.petugas, { room_id: Number(ruang.utama), reservation_id: Number(rv) });
                expect(r.status, rv).toBe(422);
                expect(r.json.error?.details?.[0]?.field).toBe("reservation_id");
            }
            const sah = await reservasi({ room: ruang.utama, status: "BERLANGSUNG" });
            expect((await lapor(pengguna.pelapor, { room_id: Number(ruang.utama), reservation_id: Number(sah) })).status).toBe(403);
            const tanpaRuang = await lapor(pengguna.petugas, { asset_id: Number(aset), reservation_id: Number(sah) });
            expect(tanpaRuang.status).toBe(422);
            expect(tanpaRuang.json.error?.details?.some((d) => d.field === "reservation_id")).toBe(true);
        });
    });
});
