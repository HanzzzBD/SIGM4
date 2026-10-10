// Acceptance PR-03-27 (m07 §7, UX P-30/P-31, FR-07.3 langkah 1; keputusan 17 log phase-03):
// `GET /reservations` dan `GET /reservations/{id}` lewat `createApp()` terhadap PostgreSQL nyata —
// scope `restricted` hanya miliknya, aksi diturunkan dari aturan endpoint tulis, riwayat dari
// activity log (penyajiannya tercatat), dan slot milik sendiri pada kalender bagi Siswa.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ReservationDetail, ReservationListItem, RoomAvailability, RoomReservationCreated } from "@sigm4/schemas";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { jalankanAktivasiSlot } from "../../src/worker/slot-jobs.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

// Dilewati hanya tanpa basis data; prasyarat lain yang hilang = FAILED, bukan skipped (templates/PULL-REQUEST.md).
const ADA = process.env["DATABASE_URL"] !== undefined;
// Senin 2 Agustus 2027 09.00 WIB — di luar jendela tanggal berkas uji reservasi lain.
const SEKARANG = new Date("2027-08-02T02:00:00Z");
const clock = new FixedClock(SEKARANG);
const wib = (tgl: string, jam: string) => `${tgl}T${jam}:00+07:00`;
const unik = (a: string) => `RSQ${a}${randomUUID().slice(0, 6)}`;

interface Peran {
    readonly id: number;
    readonly role: string;
    readonly perms: readonly string[];
}
type Jawaban<T> = { status: number; json: { success: boolean; data: T; meta?: { page: number; per_page: number; total: number; total_pages: number }; error?: { code: string; message: string; details?: { field: string; message: string }[] } } };

describe.skipIf(!ADA)("PR-03-27 — daftar & detail reservasi (acceptance)", () => {
    let server: Server;
    let url = "";
    let gedung = "";
    const ruang = { aula: "", osis: "" };
    let aturanId = "";
    const pengguna: Record<"guru" | "guru2" | "siswa" | "petugas" | "approver" | "tanpa", Peran> = {} as never;

    // Penjaga lingkungan sebagai UJI, bukan beforeAll: prasyarat yang hilang harus FAILED, bukan
    // ter-skip diam-diam (templates/PULL-REQUEST.md).
    it("lingkungannya lengkap — REDIS_URL ada saat DATABASE_URL ada", () => {
        expect(process.env["REDIS_URL"], "REDIS_URL wajib diisi: lingkungan integrasi API memakai Redis.").toBeDefined();
    });

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
            setAuthContext(
                res,
                createAuthContext({
                    userId: Number(req.header("x-uji-user")),
                    roleCode: req.header("x-uji-role") ?? "R-05",
                    scopes: new Map<string, Scope>(perms.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])),
                }),
            );
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
                VALUES ('${nama}', '${unik("u")}@uji-m07q.sch.id', 'x', '${unik("N")}', (SELECT id FROM roles WHERE kode = '${role}'), 'AKTIF', false) RETURNING id::text`);
            return { id: Number(u?.id), role, perms };
        };
        const PEMOHON = ["reservation.view", "reservation.create", "reservation.cancel_own"];
        pengguna.guru = await buat("R-05", "Pak Budi Guru", PEMOHON);
        pengguna.guru2 = await buat("R-05", "Bu Ani Guru", PEMOHON);
        pengguna.siswa = await buat("R-07", "Siti Siswa", ["reservation.view:restricted", "reservation.create", "reservation.cancel_own"]);
        pengguna.petugas = await buat("R-02", "Pak Joko Petugas", [...PEMOHON, "reservation.cancel_any", "reservation.record_usage"]);
        pengguna.approver = await buat("R-03", "Bu Wakasek Approver", ["approval.decide"]);
        pengguna.tanpa = await buat("R-04", "Pak Teknisi", []);

        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung Uji M07Q', '${unik("G")}') RETURNING id::text`);
        gedung = g?.id ?? "";
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedung}, 'Lt 1', '${unik("A")}') RETURNING id::text`);
        const ruangan = async (nama: string, siswa: boolean) =>
            (await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, dapat_direservasi, boleh_direservasi_siswa, status)
                VALUES (${a?.id ?? ""}, '${nama}', '${unik("R")}', 'AULA', 100, true, ${String(siswa)}, 'AKTIF') RETURNING id::text`))[0]?.id ?? "";
        ruang.aula = await ruangan("Aula Uji Daftar", false);
        ruang.osis = await ruangan("Ruang OSIS Uji Daftar", true);
        const [r] = await kueri<{ id: string }>(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas, terminal_on_exhausted_escalation)
            VALUES ('RESERVASI_RUANGAN', '{"field":"room_id","op":"in","value":[${ruang.aula},${ruang.osis}]}', 95, 'hold_and_alert') RETURNING id::text`);
        aturanId = r?.id ?? "";
        await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_user_id, sla_jam, on_sla_breach) VALUES (${aturanId}, 1, 'user', ${String(pengguna.approver.id)}, 8, 'remind')`);
    });

    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const ids = Object.values(pengguna).map((p) => p.id).join(",");
        const semua = Object.values(ruang).join(",");
        await kueri(`DELETE FROM notifications WHERE user_id IN (${ids})`);
        // Notifikasi peran (NT-06/NT-47 ke SELURUH Petugas/Admin) dapat menyasar pengguna berkas lain: dihapus menurut rujukannya.
        await kueri(`DELETE FROM notifications WHERE referensi_jenis = 'approval_instance' AND referensi_id IN (SELECT id FROM approval_instances WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM notifications WHERE referensi_jenis = 'reservation' AND referensi_id IN (SELECT id FROM reservations WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM approval_steps WHERE instance_id IN (SELECT id FROM approval_instances WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM approval_instances WHERE pemohon_id IN (${ids})`);
        await kueri(`DELETE FROM approval_rule_steps WHERE rule_id = ${aturanId}`);
        await kueri(`DELETE FROM approval_rules WHERE id = ${aturanId}`);
        await kueri(`DELETE FROM booking_slots WHERE resource_type = 'room' AND resource_id IN (${semua})`);
        await kueri(`DELETE FROM reservations WHERE room_id IN (${semua}) AND parent_id IS NOT NULL`);
        await kueri(`DELETE FROM reservations WHERE room_id IN (${semua})`);
        await kueri(`DELETE FROM rooms WHERE id IN (${semua})`);
        await kueri(`DELETE FROM areas WHERE building_id = ${gedung}`);
        await kueri(`DELETE FROM buildings WHERE id = ${gedung}`);
        await kueri("DELETE FROM event_outbox");
        await kueri(`DELETE FROM users WHERE id IN (${ids})`);
    });

    const minta = async <T>(metode: "GET" | "POST", path: string, siapa: Peran, body?: unknown): Promise<Jawaban<T>> => {
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", "x-uji-user": String(siapa.id), "x-uji-role": siapa.role, "x-uji-perms": siapa.perms.join(","), "idempotency-key": randomUUID() },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: res.status, json: (await res.json()) as Jawaban<T>["json"] };
    };
    const ajukan = async (siapa: Peran, tgl: string, mulai: string, selesai: string, o: Record<string, unknown> = {}) => {
        const r = await minta<RoomReservationCreated>("POST", "/reservations", siapa, {
            room_id: Number(ruang.aula),
            waktu_mulai: wib(tgl, mulai),
            waktu_selesai: wib(tgl, selesai),
            nama_kegiatan: "Rapat Komite",
            jenis_kegiatan: "Rapat",
            jumlah_peserta: 20,
            ...o,
        });
        expect(r.status, JSON.stringify(r.json)).toBe(201);
        return r.json.data;
    };
    const putuskan = (instanceId: number, keputusan: "DISETUJUI" | "DITOLAK") => minta("POST", `/approvals/${String(instanceId)}/decide`, pengguna.approver, { urutan: 1, keputusan, catatan: keputusan === "DITOLAK" ? "Bentrok ujian." : null });
    const daftar = (siapa: Peran, query = "") => minta<ReservationListItem[]>("GET", `/reservations?per_page=100${query}`, siapa);
    const detail = (id: string, siapa: Peran) => minta<ReservationDetail>("GET", `/reservations/${id}`, siapa);
    const nomorDi = (j: Jawaban<ReservationListItem[]>) => j.json.data.map((d) => d.nomor);

    describe("GET /reservations (P-30)", () => {
        it("satu baris per pengajuan; scope all melihat milik siapa pun, restricted hanya miliknya; tanpa permission → 403", async () => {
            const a = await ajukan(pengguna.guru, "2027-08-03", "08:00", "09:00", { nama_kegiatan: "Rapat Guru Agustus" });
            const b = await ajukan(pengguna.guru2, "2027-08-03", "09:00", "10:00", { pengulangan: { hari: [2], sampai: "2027-08-17" } });
            const s = await ajukan(pengguna.siswa, "2027-08-03", "10:00", "11:00", { room_id: Number(ruang.osis), nama_kegiatan: "Rapat OSIS" });

            const semua = nomorDi(await daftar(pengguna.guru));
            expect(semua).toEqual(expect.arrayContaining([a.nomor, b.nomor, s.nomor]));
            expect(semua.some((n) => n.startsWith(`${b.nomor}.`))).toBe(false); // turunan tidak tampil sebagai baris
            const berulang = (await daftar(pengguna.guru, `&q=${encodeURIComponent(b.nomor)}`)).json.data;
            expect(berulang).toEqual([expect.objectContaining({ id: b.id, jumlah_tanggal: 3, pemohon: { id: String(pengguna.guru2.id), nama: "Bu Ani Guru" }, ruangan: { id: ruang.aula, nama: "Aula Uji Daftar" } })]);

            expect(nomorDi(await daftar(pengguna.siswa))).toEqual([s.nomor]);
            expect((await daftar(pengguna.tanpa)).status).toBe(403);
        });

        it("filter status, pemohon=saya, kata kunci nama kegiatan, rentang tanggal WIB; paginasi; query tak sah → 422", async () => {
            const tolak = await ajukan(pengguna.guru, "2027-08-05", "08:00", "09:00", { nama_kegiatan: "Seminar Ditolak" });
            expect((await putuskan(tolak.approval.instance_id, "DITOLAK")).status).toBe(200);
            const saya = await daftar(pengguna.guru, "&pemohon=saya&status=DITOLAK");
            expect(nomorDi(saya)).toEqual([tolak.nomor]);
            expect(nomorDi(await daftar(pengguna.guru, "&q=seminar%20ditolak"))).toEqual([tolak.nomor]);
            // Rentang inklusif per tanggal WIB: 5 Agustus saja.
            const tanggal5 = nomorDi(await daftar(pengguna.guru, "&dari=2027-08-05&sampai=2027-08-05"));
            expect(tanggal5).toContain(tolak.nomor);
            expect(nomorDi(await daftar(pengguna.guru, "&dari=2027-08-06&sampai=2027-08-06&pemohon=saya"))).not.toContain(tolak.nomor);

            const halaman = await minta<ReservationListItem[]>("GET", "/reservations?pemohon=saya&per_page=1&page=2&urut=mulai", pengguna.guru);
            expect(halaman.json.data).toHaveLength(1);
            expect(halaman.json.meta).toMatchObject({ page: 2, per_page: 1 });
            expect(halaman.json.meta?.total_pages).toBe(halaman.json.meta?.total);

            const salah = await minta("GET", "/reservations?status=APA&dari=kemarin", pengguna.guru);
            expect(salah.status).toBe(422);
            expect(salah.json.error?.details?.map((d) => d.field).sort()).toEqual(["dari", "status"]);
        });
    });

    describe("GET /reservations/{id} (P-31)", () => {
        it("tak ada → 404; milik pihak lain bagi scope restricted → 404, sama persis", async () => {
            const lain = await ajukan(pengguna.guru, "2027-08-09", "08:00", "09:00");
            const tak = await detail("999999999", pengguna.siswa);
            const terlarang = await detail(lain.id, pengguna.siswa);
            expect([tak.status, terlarang.status]).toEqual([404, 404]);
            expect(terlarang.json.error).toEqual(tak.json.error);
        });

        it("isi detail, induk/turunan berulang, instance approval, dan aksi bagi pemohon / pihak lain / Petugas", async () => {
            const r = await ajukan(pengguna.guru, "2027-08-10", "13:00", "14:00", { pengulangan: { hari: [2], sampai: "2027-08-17" }, keperluan: "Koordinasi" });
            const induk = (await detail(r.id, pengguna.guru)).json.data;
            expect(induk).toMatchObject({
                nomor: r.nomor,
                status: "MENUNGGU_PERSETUJUAN",
                ruangan: { id: ruang.aula, nama: "Aula Uji Daftar", gedung: "Gedung Uji M07Q" },
                pemohon: { id: String(pengguna.guru.id), nama: "Pak Budi Guru" },
                keperluan: "Koordinasi",
                induk: null,
                penggunaan: null,
                approval_instance_id: r.approval.instance_id,
            });
            expect(induk.tanggal.map((t) => t.nomor)).toEqual([`${r.nomor}.01`, `${r.nomor}.02`]);
            // Induk berulang: dapat dibatalkan seluruhnya, tetapi "Ubah jadwal" per tanggal saja.
            expect(induk.aksi).toEqual({ batalkan: true, ubah_jadwal: false, ajukan_ulang: false, catat_penggunaan: { kondisi: false, tidak_digunakan: false } });

            const [t1] = r.tanggal;
            const anak = (await detail(t1!.id, pengguna.guru)).json.data;
            expect(anak).toMatchObject({ induk: { id: r.id, nomor: r.nomor }, tanggal: [], approval_instance_id: r.approval.instance_id });
            expect(anak.aksi).toMatchObject({ batalkan: true, ubah_jadwal: true });

            // Pihak lain tanpa cancel_any: dapat melihat (scope all), tak dapat membatalkan.
            expect((await detail(t1!.id, pengguna.guru2)).json.data.aksi).toEqual({ batalkan: false, ubah_jadwal: false, ajukan_ulang: false, catat_penggunaan: { kondisi: false, tidak_digunakan: false } });
            // Petugas (cancel_any): dapat membatalkan milik orang lain, tetapi bukan mengubah jadwal pemohon.
            expect((await detail(t1!.id, pengguna.petugas)).json.data.aksi).toMatchObject({ batalkan: true, ubah_jadwal: false });
        });

        it("ditolak → Ajukan Ulang hanya bagi pemohon; Selesai → pencatatan bagi record_usage, lalu tertutup setelah dicatat", async () => {
            const tolak = await ajukan(pengguna.guru, "2027-08-11", "08:00", "09:00");
            expect((await putuskan(tolak.approval.instance_id, "DITOLAK")).status).toBe(200);
            expect((await detail(tolak.id, pengguna.guru)).json.data.aksi).toMatchObject({ batalkan: false, ajukan_ulang: true });
            expect((await detail(tolak.id, pengguna.petugas)).json.data.aksi.ajukan_ulang).toBe(false);

            const r = await ajukan(pengguna.guru, "2027-08-11", "10:00", "11:00");
            expect((await putuskan(r.approval.instance_id, "DISETUJUI")).status).toBe(200);
            const geser = new Date(wib("2027-08-11", "11:00")).getTime() - clock.now().getTime();
            clock.advance(geser);
            try {
                await jalankanAktivasiSlot(getDb(), clock);
                expect((await detail(r.id, pengguna.petugas)).json.data.aksi.catat_penggunaan).toEqual({ kondisi: true, tidak_digunakan: true });
                expect((await detail(r.id, pengguna.guru)).json.data.aksi.catat_penggunaan).toEqual({ kondisi: false, tidak_digunakan: false });
                expect((await minta("POST", `/reservations/${r.id}/usage`, pengguna.petugas, { hasil: "BAIK", catatan: "Rapi." })).status).toBe(200);
                const d = (await detail(r.id, pengguna.petugas)).json.data;
                expect(d.penggunaan).toEqual({ kondisi_ruangan: "BAIK", catatan: "Rapi.", dicatat_oleh: "Pak Joko Petugas", dicatat_pada: new Date(wib("2027-08-11", "11:00")).toISOString() });
                expect(d.aksi.catat_penggunaan).toEqual({ kondisi: false, tidak_digunakan: false });
            } finally {
                clock.advance(-geser);
            }
        });

        it("FR-07.3 AC: alasan pembatalan tampil pada riwayat beserta pelakunya; setiap penyajian riwayat tercatat ACTIVITY_LOG_VIEWED", async () => {
            const r = await ajukan(pengguna.guru, "2027-08-12", "08:00", "09:00");
            expect((await minta("POST", `/reservations/${r.id}/cancel`, pengguna.petugas, { alasan: "Aula dipakai rapat dinas." })).status).toBe(200);
            const [sebelum] = await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM activity_logs WHERE aksi = 'ACTIVITY_LOG_VIEWED' AND user_id = ${String(pengguna.guru.id)}`);
            const d = (await detail(r.id, pengguna.guru)).json.data;
            expect(d.riwayat.map((x) => [x.aksi, x.pelaku, x.status, x.keterangan])).toEqual([
                ["RESERVATION_CREATED", "Pak Budi Guru", "MENUNGGU_PERSETUJUAN", null],
                ["RESERVATION_CANCELLED", "Pak Joko Petugas", "DIBATALKAN", "Aula dipakai rapat dinas."],
            ]);
            expect(d.riwayat.every((x) => x.nomor === r.nomor)).toBe(true);
            const [sesudah] = await kueri<{ n: string; entitas: string }>(`SELECT count(*)::text AS n, max(nilai_sesudah->>'entitas') AS entitas FROM activity_logs WHERE aksi = 'ACTIVITY_LOG_VIEWED' AND user_id = ${String(pengguna.guru.id)}`);
            expect(Number(sesudah?.n) - Number(sebelum?.n)).toBe(1);
            expect(sesudah?.entitas).toBe("reservations");
        });
    });

    it("FR-07.1 + keputusan 17b: pada kalender, Siswa melihat rincian slot MILIKNYA (tertaut ke P-31), bukan milik pihak lain", async () => {
        const milik = await ajukan(pengguna.siswa, "2027-08-13", "08:00", "09:00", { room_id: Number(ruang.osis), nama_kegiatan: "Latihan Paduan Suara" });
        await ajukan(pengguna.guru, "2027-08-13", "10:00", "11:00", { room_id: Number(ruang.osis), nama_kegiatan: "Rapat Rahasia Guru" });
        const k = await minta<RoomAvailability>("GET", `/rooms/availability?dari=2027-08-13T00:00:00%2B07:00&sampai=2027-08-14T00:00:00%2B07:00&gedung_id=${gedung}`, pengguna.siswa);
        expect(k.status).toBe(200);
        const slot = k.json.data.slot.filter((x) => x.ruangan_id === ruang.osis);
        expect(slot.map((x) => x.reservasi?.id ?? null)).toEqual([milik.id, null]);
        expect(JSON.stringify(k.json.data)).not.toMatch(/Rapat Rahasia Guru|Pak Budi/);
    });
});
