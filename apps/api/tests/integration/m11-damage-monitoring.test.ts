// Acceptance PR-03-16 (FR-11.3; keputusan 22 log phase-03): daftar pantau tiket kerusakan — scope (A1),
// saringan langkah 3, jumlah per status (langkah 2), dan indikator SLA (langkah 4) dengan tenggat absolut
// `batas_sla` yang ditetapkan saat lapor dari SLA per urgensi (0050) — terhadap PostgreSQL nyata.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { DamageReportCreated, DamageReportListItem } from "@sigm4/schemas";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { BusinessCalendarService } from "../../src/shared/calendar/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
// Senin 15 November 2027 10.00 WIB.
const clock = new FixedClock(new Date("2027-11-15T03:00:00Z"));
const unik = (a: string) => `PTN${a}${randomUUID().slice(0, 6)}`;
const logger = new Logger({ clock, tulis: () => undefined });
const tolak = () => Promise.reject(new Error("tak dipakai"));
const penyimpanan: PenyimpananObjek = { urlUnduh: tolak, urlUnggah: tolak, info: tolak, ambil: tolak, simpan: tolak, hapus: tolak, periksa: () => Promise.resolve() };

interface Peran {
    readonly id: number;
    readonly perms: readonly string[];
}
interface Meta {
    readonly total: number;
    readonly total_pages: number;
    readonly jumlah_per_status: Record<string, number>;
}
type Jawaban = { status: number; json: { data: DamageReportListItem[]; meta: Meta; error?: { code: string; details?: { field: string }[] } } };

describe.skipIf(!ADA)("PR-03-16 — pemantauan status kerusakan (acceptance)", () => {
    let server: Server;
    let url = "";
    let gedung = "";
    let gedungLain = "";
    let area = "";
    let areaLain = "";
    let kategori = "";
    let kategoriLain = "";
    const pengguna: Record<"guru" | "guruLain" | "petugas" | "tanpaIzin", Peran> = {} as never;

    beforeAll(async () => {
        dbmate("up");
        const app = createApp({
            appBaseUrl: "https://sigm4.sekolah.test",
            health: new HealthRegistry(30).register(fcmCheck(null)),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: "http://minio:9000" },
            logger,
            clock,
            db: getDb(),
            auth: authPalsu(),
            penyimpanan,
        });
        const luar = express();
        luar.use((req, res, next) => {
            const perms = (req.header("x-uji-perms") ?? "").split(",").filter((p) => p !== "");
            setAuthContext(res, createAuthContext({ userId: Number(req.header("x-uji-user")), roleCode: "R-02", scopes: new Map<string, Scope>(perms.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) }));
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
                VALUES ('${nama}', '${unik("u")}@uji-m11p.sch.id', 'x', '${unik("N")}', (SELECT id FROM roles WHERE kode = '${role}'), 'AKTIF', false) RETURNING id::text`);
            return { id: Number(u?.id), perms };
        };
        pengguna.guru = await buat("R-05", "Pak Dodi Pelapor", ["damage.create", "damage.view:own"]);
        pengguna.guruLain = await buat("R-05", "Bu Rina Guru", ["damage.create", "damage.view:own"]);
        pengguna.petugas = await buat("R-02", "Bu Tari Petugas", ["damage.create", "damage.view", "damage.verify"]);
        pengguna.tanpaIzin = await buat("R-05", "Tanpa Izin", ["damage.create"]);

        const tempat = async (nama: string) => {
            const g = (await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('${nama}', '${unik("G")}') RETURNING id::text`))[0]?.id ?? "";
            const a = (await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${g}, 'Lt 1', '${unik("A")}') RETURNING id::text`))[0]?.id ?? "";
            return [g, a] as const;
        };
        [gedung, area] = await tempat("Gedung D Uji Pantau");
        [gedungLain, areaLain] = await tempat("Gedung E Uji Pantau");
        const kat = async (nama: string) => (await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('${nama}', '${unik("K")}') RETURNING id::text`))[0]?.id ?? "";
        kategori = await kat("Elektronik Uji Pantau");
        kategoriLain = await kat("Perabot Uji Pantau");
    });

    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const ids = Object.values(pengguna).map((p) => p.id).join(",");
        const laporan = `SELECT id FROM damage_reports WHERE pelapor_id IN (${ids})`;
        await kueri(`DELETE FROM notifications WHERE referensi_jenis = 'damage_report' AND referensi_id IN (${laporan})`);
        await kueri(`DELETE FROM event_outbox WHERE aggregate_type = 'damage_report' AND aggregate_id::bigint IN (${laporan})`);
        await kueri(`DELETE FROM damage_report_photos WHERE damage_report_id IN (${laporan})`);
        await kueri(`DELETE FROM damage_reports WHERE pelapor_id IN (${ids})`);
        await kueri(`DELETE FROM stored_files WHERE uploaded_by IN (${ids})`);
        await kueri(`DELETE FROM assets WHERE category_id IN (${kategori}, ${kategoriLain})`);
        await kueri(`DELETE FROM asset_categories WHERE id IN (${kategori}, ${kategoriLain})`);
        await kueri(`DELETE FROM rooms WHERE area_id IN (${area}, ${areaLain})`);
        await kueri(`DELETE FROM areas WHERE id IN (${area}, ${areaLain})`);
        await kueri(`DELETE FROM buildings WHERE id IN (${gedung}, ${gedungLain})`);
        await kueri(`DELETE FROM users WHERE id IN (${ids})`);
        await kueri(`UPDATE system_settings SET value = '3' WHERE key = 'maintenance.sla_tindak_lanjut_hari_kritis'`);
    });

    async function daftar(siapa: Peran, query: string): Promise<Jawaban> {
        const r = await fetch(`${url}/damage-reports?${query}`, { headers: { "x-uji-user": String(siapa.id), "x-uji-perms": siapa.perms.join(",") } });
        return { status: r.status, json: (await r.json()) as Jawaban["json"] };
    }
    const ruangan = async (di = area) =>
        (await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, status) VALUES (${di}, 'Kelas ${unik("")}', '${unik("R")}', 'KELAS', 30, 'AKTIF') RETURNING id::text`))[0]?.id ?? "";
    const aset = async (ruang: string, kat = kategori, kode = unik("B")) =>
        (await kueri<{ id: string }>(`INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi)
            VALUES ('${kode}', 'Proyektor', ${kat}, 2025, 'PEMBELIAN', ${ruang}, 'BAIK') RETURNING id::text`))[0]?.id ?? "";
    async function lapor(siapa: Peran, objek: Record<string, number>, urgensi = "SEDANG"): Promise<DamageReportCreated> {
        const [b] = await kueri<{ id: string }>(`INSERT INTO stored_files (object_key, mime, ukuran, checksum, scan_status, owner_type, uploaded_by)
            VALUES ('damage/2027/11/${randomUUID()}.jpg', 'image/jpeg', 2048, NULL, 'PENDING', 'DAMAGE_PHOTO', ${String(siapa.id)}) RETURNING id::text`);
        const r = await fetch(`${url}/damage-reports`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-uji-user": String(siapa.id), "x-uji-perms": siapa.perms.join(",") },
            body: JSON.stringify({ ...objek, deskripsi: "Tidak menyala.", urgensi, foto_file_ids: [Number(b?.id)] }),
        });
        expect(r.status).toBe(201);
        return ((await r.json()) as { data: DamageReportCreated }).data;
    }
    const nomor = (j: Jawaban) => j.json.data.map((t) => t.nomor).sort();

    it("tanpa damage.view → 403; saringan tak sah → 422 per isian", async () => {
        expect((await daftar(pengguna.tanpaIzin, "")).status).toBe(403);
        for (const [q, field] of [["melampaui_sla=ya", "melampaui_sla"], ["status=RUSAK", "status"], ["per_page=101", "per_page"], ["dari=15-11-2027", "dari"], ["asal=x", ""]] as const) {
            const r = await daftar(pengguna.petugas, q);
            expect(r.status, q).toBe(422);
            expect(r.json.error?.code).toBe("VALIDATION_ERROR");
            if (field !== "") expect(r.json.error?.details?.[0]?.field).toBe(field);
        }
    });

    it("scope own hanya melihat tiket miliknya meski menyaring pelapor lain (A1); scope all melihat semua", async () => {
        const milikGuru = await lapor(pengguna.guru, { room_id: Number(await ruangan()) });
        const milikLain = await lapor(pengguna.guruLain, { room_id: Number(await ruangan()) });
        const g = `building_id=${gedung}`;
        const own = await daftar(pengguna.guru, g);
        expect(own.status).toBe(200);
        expect(nomor(own)).toEqual([milikGuru.nomor]);
        expect((await daftar(pengguna.guru, `${g}&pelapor=${String(pengguna.guruLain.id)}`)).json.data).toEqual([]);
        const semua = nomor(await daftar(pengguna.petugas, g));
        expect(semua).toContain(milikGuru.nomor);
        expect(semua).toContain(milikLain.nomor);
        expect(nomor(await daftar(pengguna.petugas, `${g}&pelapor=${String(pengguna.guruLain.id)}`))).toEqual([milikLain.nomor]);
        expect(nomor(await daftar(pengguna.guru, `${g}&pelapor=saya`))).toEqual([milikGuru.nomor]);
    });

    it("saringan urgensi, lokasi (ruangan aset & ruangan tiket), kategori, kata kunci, dan rentang tanggal WIB", async () => {
        const ruang = await ruangan(areaLain);
        const kodeCari = unik("CARI");
        const elektronik = await lapor(pengguna.petugas, { asset_id: Number(await aset(ruang, kategori, kodeCari)) }, "TINGGI");
        const perabot = await lapor(pengguna.petugas, { asset_id: Number(await aset(ruang, kategoriLain)) }, "RENDAH");
        const ruangSendiri = await lapor(pengguna.petugas, { room_id: Number(ruang) }, "TINGGI");
        const g = `building_id=${gedungLain}`;
        expect(nomor(await daftar(pengguna.petugas, g))).toEqual([elektronik.nomor, perabot.nomor, ruangSendiri.nomor].sort());
        expect(nomor(await daftar(pengguna.petugas, `${g}&urgensi=TINGGI`))).toEqual([elektronik.nomor, ruangSendiri.nomor].sort());
        expect(nomor(await daftar(pengguna.petugas, `room_id=${ruang}`))).toEqual([elektronik.nomor, perabot.nomor, ruangSendiri.nomor].sort());
        expect(nomor(await daftar(pengguna.petugas, `${g}&category_id=${kategoriLain}`))).toEqual([perabot.nomor]);
        expect(nomor(await daftar(pengguna.petugas, `q=${kodeCari.toLowerCase()}`))).toEqual([elektronik.nomor]);
        expect(nomor(await daftar(pengguna.petugas, `q=${perabot.nomor}`))).toEqual([perabot.nomor]);

        // 16 Nov 23.30 WIB = 16.30Z; 17 Nov 00.30 WIB = 16 Nov 17.30Z — batas hari ditentukan di WIB (CAL-03).
        await kueri(`UPDATE damage_reports SET created_at = '2027-11-16T16:30:00Z' WHERE id = ${perabot.id}`);
        await kueri(`UPDATE damage_reports SET created_at = '2027-11-16T17:30:00Z' WHERE id = ${ruangSendiri.id}`);
        expect(nomor(await daftar(pengguna.petugas, `${g}&dari=2027-11-16&sampai=2027-11-16`))).toEqual([perabot.nomor]);
        expect(nomor(await daftar(pengguna.petugas, `${g}&dari=2027-11-17`))).toEqual([ruangSendiri.nomor]);

        const r = await daftar(pengguna.petugas, `${g}&urut=urgensi`);
        expect(r.json.data.map((t) => t.urgensi)).toEqual(["TINGGI", "TINGGI", "RENDAH"]);
        const objek = r.json.data.find((t) => t.nomor === elektronik.nomor)?.objek;
        expect(objek).toMatchObject({ jenis: "ASET", label: `Proyektor (${kodeCari})` });
        expect(r.json.data.find((t) => t.nomor === ruangSendiri.nomor)?.objek).toMatchObject({ jenis: "RUANGAN", id: ruang, lokasi: "Gedung E Uji Pantau" });
    });

    it("jumlah per status mengikuti saringan lain tetapi bukan status (langkah 2); paginasi", async () => {
        const g = `building_id=${gedung}&pelapor=${String(pengguna.petugas.id)}`;
        const tiket = await Promise.all([1, 2, 3].map(async () => lapor(pengguna.petugas, { room_id: Number(await ruangan()) })));
        await kueri(`UPDATE damage_reports SET status = 'DITOLAK', catatan_verifikasi = 'Bukan kerusakan.' WHERE id = ${tiket[0]!.id}`);
        const r = await daftar(pengguna.petugas, `${g}&status=DILAPORKAN&per_page=1&page=2`);
        expect(r.json.meta).toMatchObject({ total: 2, total_pages: 2, jumlah_per_status: { DILAPORKAN: 2, DITOLAK: 1, DIVERIFIKASI: 0, DALAM_PERBAIKAN: 0, SELESAI: 0 } });
        expect(r.json.data).toHaveLength(1);
        expect(r.json.data[0]?.status).toBe("DILAPORKAN");
    });

    it("batas_sla ditetapkan saat lapor dari SLA urgensinya dalam hari kerja; mengubah pengaturan tidak menggeser tiket lama", async () => {
        const kalender = new BusinessCalendarService();
        const pertama = await lapor(pengguna.petugas, { room_id: Number(await ruangan()) }, "KRITIS");
        await kueri(`UPDATE system_settings SET value = '7' WHERE key = 'maintenance.sla_tindak_lanjut_hari_kritis'`);
        const kedua = await lapor(pengguna.petugas, { room_id: Number(await ruangan()) }, "KRITIS");
        const batas = async (id: string) => (await kueri<{ b: Date }>(`SELECT batas_sla AS b FROM damage_reports WHERE id = ${id}`))[0]?.b;
        expect(await batas(pertama.id)).toEqual(await kalender.endOfNthWorkingDayAfter(getDb(), clock.now(), 3));
        expect(await batas(kedua.id)).toEqual(await kalender.endOfNthWorkingDayAfter(getDb(), clock.now(), 7));
    });

    it("melampaui SLA = masih DILAPORKAN lewat tenggat, atau diverifikasi sesudahnya; tanpa batas_sla tak pernah ditandai (langkah 4)", async () => {
        const g = `building_id=${gedung}&urgensi=TINGGI`;
        const t = await Promise.all([1, 2, 3, 4, 5].map(async () => lapor(pengguna.petugas, { room_id: Number(await ruangan()) }, "TINGGI")));
        const [lewat, belum, telat, tepat, lama] = t.map((x) => x.id) as [string, string, string, string, string];
        const kemarin = new Date(clock.now().getTime() - 86_400_000).toISOString();
        const besok = new Date(clock.now().getTime() + 86_400_000).toISOString();
        await kueri(`UPDATE damage_reports SET batas_sla = '${kemarin}' WHERE id IN (${lewat}, ${telat}, ${tepat}, ${lama})`);
        await kueri(`UPDATE damage_reports SET batas_sla = '${besok}' WHERE id = ${belum}`);
        await kueri(`UPDATE damage_reports SET status = 'DIVERIFIKASI', diverifikasi_oleh = ${String(pengguna.petugas.id)}, diverifikasi_pada = '${clock.now().toISOString()}' WHERE id = ${telat}`);
        await kueri(`UPDATE damage_reports SET status = 'DIVERIFIKASI', diverifikasi_oleh = ${String(pengguna.petugas.id)}, diverifikasi_pada = '2020-01-01T00:00:00Z' WHERE id = ${tepat}`);
        await kueri(`UPDATE damage_reports SET batas_sla = NULL WHERE id = ${lama}`);

        const semua = await daftar(pengguna.petugas, g);
        const tanda = Object.fromEntries(semua.json.data.map((x) => [x.id, x.melampaui_sla]));
        expect(tanda).toEqual({ [lewat]: true, [belum]: false, [telat]: true, [tepat]: false, [lama]: false });
        expect(semua.json.data.find((x) => x.id === lama)?.batas_sla).toBeNull();
        expect(semua.json.data.find((x) => x.id === belum)?.batas_sla).toBe(besok);

        const ya = await daftar(pengguna.petugas, `${g}&melampaui_sla=true`);
        expect(ya.json.data.map((x) => x.id).sort()).toEqual([lewat, telat].sort());
        expect(ya.json.meta.jumlah_per_status).toMatchObject({ DILAPORKAN: 1, DIVERIFIKASI: 1 });
        expect((await daftar(pengguna.petugas, `${g}&melampaui_sla=false`)).json.data.map((x) => x.id).sort()).toEqual([belum, tepat, lama].sort());
    });
});
