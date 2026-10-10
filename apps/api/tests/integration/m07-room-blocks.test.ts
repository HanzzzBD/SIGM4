// Acceptance PR-03-13 (FR-07.5; keputusan 19 log phase-03): blokade jadwal tetap & blokade manual lewat
// `createApp()` terhadap PostgreSQL nyata, materialisasi horizon lewat JALUR WORKER
// (`fixed-schedule-materialize`), dan AC kinerja regenerasi 90 hari × 30 ruangan ≤ 10 detik.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { RoomAvailability, RoomBlockCreated, RoomBlockList, RoomBlockPreview, RoomReservationCreated } from "@sigm4/schemas";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { SlotService } from "../../src/shared/booking/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { jalankanMaterialisasiJadwalTetap } from "../../src/worker/fixed-schedule-jobs.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

// Dilewati hanya tanpa basis data; prasyarat lain yang hilang = FAILED (templates/PULL-REQUEST.md).
const ADA = process.env["DATABASE_URL"] !== undefined;
// Senin 6 September 2027 09.00 WIB — di luar jendela tanggal berkas uji reservasi lain.
const SEKARANG = new Date("2027-09-06T02:00:00Z");
const clock = new FixedClock(SEKARANG);
const LIBUR = "2027-09-20";
const NAMA_LIBUR = "Libur Uji Blokade";
const TAHUN = "Uji Blokade 2027/2028";
const wib = (tgl: string, jam: string) => `${tgl}T${jam}:00+07:00`;
const unik = (a: string) => `RBK${a}${randomUUID().slice(0, 6)}`;

interface Peran {
    readonly id: number;
    readonly role: string;
    readonly perms: readonly string[];
}
type Jawaban<T> = { status: number; json: { success: boolean; data: T; error?: { code: string; message: string; details?: { field: string; message: string }[] } } };

describe.skipIf(!ADA)("PR-03-13 — blokade jadwal tetap & blokade manual (acceptance)", () => {
    let server: Server;
    let url = "";
    let gedung = "";
    let area = "";
    const ruang = { a: "", b: "", c: "" };
    let aturanId = "";
    let tahunAsal: string | null = null;
    const pengguna: Record<"petugas" | "kepalaTu" | "guru" | "approver" | "siswa", Peran> = {} as never;

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
            setAuthContext(res, createAuthContext({ userId: Number(req.header("x-uji-user")), roleCode: req.header("x-uji-role") ?? "R-02", scopes: new Map<string, Scope>(perms.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) }));
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
                VALUES ('${nama}', '${unik("u")}@uji-m07b.sch.id', 'x', '${unik("N")}', (SELECT id FROM roles WHERE kode = '${role}'), 'AKTIF', false) RETURNING id::text`);
            return { id: Number(u?.id), role, perms };
        };
        const LIHAT = ["reservation.view", "reservation.create", "reservation.cancel_own"];
        pengguna.petugas = await buat("R-02", "Pak Joko Petugas", [...LIHAT, "reservation.fixed_schedule", "reservation.cancel_any", "reservation.urgent"]);
        // Pemegang fixed_schedule TANPA cancel_any — tak dapat membatalkan milik orang lain (keputusan 15b).
        pengguna.kepalaTu = await buat("R-02", "Bu Kepala TU", [...LIHAT, "reservation.fixed_schedule"]);
        pengguna.guru = await buat("R-05", "Pak Budi Guru", LIHAT);
        pengguna.approver = await buat("R-03", "Bu Wakasek Approver", ["approval.decide"]);
        pengguna.siswa = await buat("R-07", "Siti Siswa", ["reservation.view:restricted"]);

        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung Uji Blokade', '${unik("G")}') RETURNING id::text`);
        gedung = g?.id ?? "";
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedung}, 'Lt 1', '${unik("A")}') RETURNING id::text`);
        area = a?.id ?? "";
        const ruangan = async (nama: string) =>
            (await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, dapat_direservasi, boleh_direservasi_siswa, status)
                VALUES (${area}, '${nama}', '${unik("R")}', 'KELAS', 40, true, true, 'AKTIF') RETURNING id::text`))[0]?.id ?? "";
        ruang.a = await ruangan("Kelas XI-A Uji");
        ruang.b = await ruangan("Kelas XI-B Uji");
        ruang.c = await ruangan("Aula Uji Blokade");
        const [r] = await kueri<{ id: string }>(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas, terminal_on_exhausted_escalation)
            VALUES ('RESERVASI_RUANGAN', '{"field":"room_id","op":"in","value":[${ruang.a},${ruang.b},${ruang.c}]}', 95, 'hold_and_alert') RETURNING id::text`);
        aturanId = r?.id ?? "";
        await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_user_id, sla_jam, on_sla_breach) VALUES (${aturanId}, 1, 'user', ${String(pengguna.approver.id)}, 8, 'remind')`);
        await kueri(`INSERT INTO holidays (tanggal, nama, jenis) VALUES ('${LIBUR}', '${NAMA_LIBUR}', 'SEKOLAH') ON CONFLICT (tanggal) DO NOTHING`);
        // E.5.3: masa berlaku di dalam tahun ajaran AKTIF — pergantian dalam satu transaksi (AC-YR-01, trigger DEFERRED).
        tahunAsal = (await kueri<{ id: string }>("SELECT id::text FROM academic_years WHERE is_active"))[0]?.id ?? null;
        await kueri(`BEGIN; UPDATE academic_years SET is_active = false WHERE is_active;
            INSERT INTO academic_years (nama, tanggal_mulai, tanggal_selesai, is_active) VALUES ('${TAHUN}', '2027-07-01', '2028-06-30', true); COMMIT;`);
    });

    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const ids = Object.values(pengguna).map((p) => p.id).join(",");
        const semua = (await kueri<{ id: string }>(`SELECT id::text FROM rooms WHERE area_id = ${area}`)).map((x) => x.id).join(",");
        await kueri(`DELETE FROM notifications WHERE user_id IN (${ids})`);
        await kueri(`DELETE FROM notifications WHERE referensi_jenis = 'reservation' AND referensi_id IN (SELECT id FROM reservations WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM notifications WHERE referensi_jenis = 'approval_instance' AND referensi_id IN (SELECT id FROM approval_instances WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM approval_steps WHERE instance_id IN (SELECT id FROM approval_instances WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM approval_instances WHERE pemohon_id IN (${ids})`);
        await kueri(`DELETE FROM approval_rule_steps WHERE rule_id = ${aturanId}`);
        await kueri(`DELETE FROM approval_rules WHERE id = ${aturanId}`);
        await kueri(`DELETE FROM booking_slots WHERE resource_type = 'room' AND resource_id IN (${semua})`);
        await kueri(`DELETE FROM room_fixed_schedules WHERE room_id IN (${semua})`);
        await kueri(`DELETE FROM room_manual_blocks WHERE room_id IN (${semua})`);
        await kueri(`DELETE FROM reservations WHERE room_id IN (${semua}) AND parent_id IS NOT NULL`);
        await kueri(`DELETE FROM reservations WHERE room_id IN (${semua})`);
        await kueri(`DELETE FROM rooms WHERE id IN (${semua})`);
        await kueri(`DELETE FROM areas WHERE id = ${area}`);
        await kueri(`DELETE FROM buildings WHERE id = ${gedung}`);
        await kueri(`DELETE FROM holidays WHERE tanggal IN ('${LIBUR}', '2027-10-13') AND nama LIKE 'Libur Uji Blokade%'`);
        await kueri(`BEGIN; ${tahunAsal === null ? "" : `UPDATE academic_years SET is_active = true WHERE id = ${tahunAsal};`} DELETE FROM academic_years WHERE nama = '${TAHUN}'; COMMIT;`);
        await kueri("DELETE FROM event_outbox WHERE aggregate_type IN ('reservation', 'approval_instance')");
        await kueri(`DELETE FROM users WHERE id IN (${ids})`);
    });

    const minta = async <T>(metode: "GET" | "POST" | "PATCH", path: string, siapa: Peran, body?: unknown): Promise<Jawaban<T>> => {
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", "x-uji-user": String(siapa.id), "x-uji-role": siapa.role, "x-uji-perms": siapa.perms.join(","), "idempotency-key": randomUUID() },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: res.status, json: (await res.json()) as Jawaban<T>["json"] };
    };
    const tetap = (o: Record<string, unknown> = {}) => ({ jenis: "JADWAL_TETAP", hari: [1], jam_mulai: "07:00", jam_selesai: "09:00", berlaku_mulai: "2027-09-06", berlaku_sampai: "2027-10-31", label_kegiatan: "KBM Kelas XI-A", ...o });
    const manual = (mulai: string, selesai: string, o: Record<string, unknown> = {}) => ({ jenis: "BLOKADE_MANUAL", mulai, selesai, label_kegiatan: "Renovasi lantai", ...o });
    const slotRuang = (roomId: string) =>
        kueri<{ mulai: string; status: string; origin: string; fixed_schedule_id: string | null; manual_block_id: string | null }>(`
            SELECT to_char(lower(slot_range) AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') AS mulai, status::text, origin::text, fixed_schedule_id::text, manual_block_id::text
              FROM booking_slots WHERE resource_type = 'room' AND resource_id = ${roomId} ORDER BY lower(slot_range), id`);
    const ajukanDisetujui = async (siapa: Peran, roomId: string, tgl: string, mulai: string, selesai: string, setujui = true) => {
        const r = await minta<RoomReservationCreated>("POST", "/reservations", siapa, { room_id: Number(roomId), waktu_mulai: wib(tgl, mulai), waktu_selesai: wib(tgl, selesai), nama_kegiatan: "Rapat Komite", jenis_kegiatan: "Rapat", jumlah_peserta: 20 });
        expect(r.status, JSON.stringify(r.json)).toBe(201);
        if (setujui) expect((await minta("POST", `/approvals/${String(r.json.data.approval.instance_id)}/decide`, pengguna.approver, { urutan: 1, keputusan: "DISETUJUI", catatan: null })).status).toBe(200);
        return r.json.data;
    };

    describe("otorisasi & validasi", () => {
        it("tanpa reservation.fixed_schedule → 403 di kelima route", async () => {
            const g = pengguna.guru;
            const hasil = await Promise.all([
                minta("GET", `/rooms/${ruang.a}/blocks`, g),
                minta("POST", `/rooms/${ruang.a}/blocks/preview`, g, tetap()),
                minta("POST", `/rooms/${ruang.a}/blocks`, g, tetap()),
                minta("PATCH", "/room-fixed-schedules/1/status", g, { status: "NONAKTIF" }),
                minta("PATCH", "/room-manual-blocks/1/status", g, { status: "NONAKTIF" }),
            ]);
            expect(hasil.map((h) => h.status)).toEqual([403, 403, 403, 403, 403]);
        });

        it("keputusan 19g: di luar jam operasional, tak sejajar granularitas, bukan hari kerja, di luar tahun ajaran aktif → 422 per isian; tak ada yang tersimpan", async () => {
            const cek = async (o: Record<string, unknown>, field: string) => {
                const r = await minta("POST", `/rooms/${ruang.b}/blocks`, pengguna.petugas, tetap(o));
                expect(r.status, JSON.stringify(r.json)).toBe(422);
                expect(r.json.error?.details?.map((d) => d.field)).toContain(field);
            };
            await cek({ jam_mulai: "05:00" }, "jam_mulai");
            await cek({ jam_mulai: "07:10" }, "jam_mulai");
            await cek({ hari: [7] }, "hari");
            await cek({ berlaku_sampai: "2028-08-01" }, "berlaku_mulai");
            await cek({ label_kegiatan: "  " }, "label_kegiatan");
            const m = await minta("POST", `/rooms/${ruang.b}/blocks`, pengguna.petugas, manual(wib("2027-09-08", "10:00"), wib("2027-09-08", "09:00")));
            expect(m.status).toBe(422);
            expect((await kueri(`SELECT 1 FROM room_fixed_schedules WHERE room_id = ${ruang.b}`)).length).toBe(0);
        });
    });

    describe("jadwal tetap (FR-07.5 langkah 2, 4, A4)", () => {
        it("aturan disimpan per hari, BUKAN per kemunculan; slot CONFIRMED dibuat sinkron sepanjang masa berlaku dalam horizon; hari libur dilewati", async () => {
            const p = await minta<RoomBlockPreview>("POST", `/rooms/${ruang.a}/blocks/preview`, pengguna.petugas, tetap());
            expect(p.status).toBe(200);
            expect(p.json.data.dilewati).toEqual([{ tanggal: LIBUR, alasan: `Hari libur: ${NAMA_LIBUR}.` }]);
            expect(await slotRuang(ruang.a)).toEqual([]); // pratinjau tanpa efek

            const r = await minta<RoomBlockCreated>("POST", `/rooms/${ruang.a}/blocks`, pengguna.petugas, tetap());
            expect(r.status).toBe(201);
            // Senin 6 Sep 07.00 sudah lewat (sekarang 09.00); 20 Sep libur.
            expect(r.json.data).toMatchObject({ jenis: "JADWAL_TETAP", slot_dibuat: 6, reservasi_dibatalkan: [] });
            expect(await kueri(`SELECT count(*)::int AS n FROM room_fixed_schedules WHERE room_id = ${ruang.a}`)).toEqual([{ n: 1 }]);
            const s = await slotRuang(ruang.a);
            expect(s.map((x) => x.mulai)).toEqual(["2027-09-13 07:00", "2027-09-27 07:00", "2027-10-04 07:00", "2027-10-11 07:00", "2027-10-18 07:00", "2027-10-25 07:00"]);
            expect(new Set(s.map((x) => `${x.status}/${x.origin}/${x.fixed_schedule_id ?? "-"}`))).toEqual(new Set([`CONFIRMED/fixed_schedule/${r.json.data.ids[0]!}`]));
            const [log] = await kueri<{ n: number }>(`SELECT count(*)::int AS n FROM activity_logs WHERE aksi = 'ROOM_BLOCK_CREATED' AND entitas = 'room_fixed_schedules' AND entitas_id = '${r.json.data.ids[0]!}'`);
            expect(log?.n).toBe(1);

            const daftar = await minta<RoomBlockList>("GET", `/rooms/${ruang.a}/blocks`, pengguna.petugas);
            expect(daftar.json.data.jadwal_tetap).toEqual([{ id: r.json.data.ids[0], hari: 1, jam_mulai: "07:00", jam_selesai: "09:00", berlaku_mulai: "2027-09-06", berlaku_sampai: "2027-10-31", label_kegiatan: "KBM Kelas XI-A", status: "AKTIF" }]);
        });

        it("FR-07.1 A4 + FR-07.5 AC: kalender menampilkan slot Jadwal Tetap berlabel (juga bagi Siswa) dan blokade menghalangi pengajuan — termasuk reservation.urgent (keputusan 19d)", async () => {
            const k = await minta<RoomAvailability>("GET", `/rooms/availability?dari=2027-09-13T00:00:00%2B07:00&sampai=2027-09-14T00:00:00%2B07:00&gedung_id=${gedung}`, pengguna.siswa);
            expect(k.json.data.slot.filter((x) => x.ruangan_id === ruang.a)).toEqual([expect.objectContaining({ keadaan: "JADWAL_TETAP", label: "KBM Kelas XI-A", reservasi: null })]);
            const urgent = await minta("POST", "/reservations", pengguna.petugas, { room_id: Number(ruang.a), waktu_mulai: wib("2027-09-13", "08:00"), waktu_selesai: wib("2027-09-13", "09:00"), nama_kegiatan: "Rapat Mendadak", jenis_kegiatan: "Rapat", jumlah_peserta: 5 });
            expect(urgent.status).toBe(409);
            expect(urgent.json.error?.code).toBe("RESERVATION_CONFLICT");
        });
    });

    describe("FR-07.5 A1 — bentrok dengan reservasi (keputusan 19c)", () => {
        it("pratinjau mendaftar reservasi disetujui DAN menunggu; tanpa pilihan eksplisit → 409, tak ada yang berubah", async () => {
            const setuju = await ajukanDisetujui(pengguna.guru, ruang.b, "2027-09-15", "10:00", "11:00");
            const tunggu = await ajukanDisetujui(pengguna.guru, ruang.b, "2027-09-15", "11:00", "12:00", false);
            const blok = manual(wib("2027-09-15", "08:00"), wib("2027-09-15", "13:00"));
            const p = await minta<RoomBlockPreview>("POST", `/rooms/${ruang.b}/blocks/preview`, pengguna.petugas, blok);
            expect(p.json.data.bentrok_reservasi.map((x) => [x.nomor, x.status, x.pemohon])).toEqual([
                [setuju.nomor, "DISETUJUI", "Pak Budi Guru"],
                [tunggu.nomor, "MENUNGGU_PERSETUJUAN", "Pak Budi Guru"],
            ]);
            const r = await minta("POST", `/rooms/${ruang.b}/blocks`, pengguna.petugas, blok);
            expect(r.status).toBe(409);
            expect(r.json.error?.details?.map((d) => d.field)).toEqual(["bentrok_reservasi", "bentrok_reservasi"]);
            expect((await kueri(`SELECT 1 FROM room_manual_blocks WHERE room_id = ${ruang.b}`)).length).toBe(0);
            expect((await kueri<{ status: string }>(`SELECT status::text FROM reservations WHERE id IN (${setuju.id}, ${tunggu.id}) ORDER BY id`)).map((x) => x.status)).toEqual(["DISETUJUI", "MENUNGGU_PERSETUJUAN"]);

            // Pemegang fixed_schedule tanpa cancel_any tak dapat membatalkan milik orang lain — seluruhnya batal (403).
            const tanpa = await minta("POST", `/rooms/${ruang.b}/blocks`, pengguna.kepalaTu, { ...blok, batalkan_bentrok: { alasan: "Renovasi mendesak." } });
            expect(tanpa.status).toBe(403);
            expect((await kueri(`SELECT 1 FROM room_manual_blocks WHERE room_id = ${ruang.b}`)).length).toBe(0);
        });

        it("pilihan eksplisit 'batalkan' → reservasi DIBATALKAN beralasan, slotnya dilepas, NT-08 terbit, lalu blokade tersimpan dalam transaksi yang sama", async () => {
            const blok = { ...manual(wib("2027-09-15", "08:00"), wib("2027-09-15", "13:00")), batalkan_bentrok: { alasan: "Renovasi mendesak." } };
            const r = await minta<RoomBlockCreated>("POST", `/rooms/${ruang.b}/blocks`, pengguna.petugas, blok);
            expect(r.status, JSON.stringify(r.json)).toBe(201);
            expect(r.json.data.reservasi_dibatalkan).toHaveLength(2);
            const v = await kueri<{ status: string }>(`SELECT status::text FROM reservations WHERE room_id = ${ruang.b} ORDER BY id`);
            expect(v.map((x) => x.status)).toEqual(["DIBATALKAN", "DIBATALKAN"]);
            expect((await slotRuang(ruang.b)).map((x) => `${x.status}/${x.origin}`)).toEqual(["CONFIRMED/manual_block", "RELEASED/reservation", "RELEASED/reservation"]);
            const ev = await kueri<{ n: number }>(`SELECT count(*)::int AS n FROM event_outbox WHERE event_name = 'RoomReservationCancelled' AND (payload->>'sepihak')::boolean AND payload->>'alasan' = 'Renovasi mendesak.'`);
            expect(ev[0]?.n).toBeGreaterThanOrEqual(2);
        });

        it("bentrok dengan blokade lain tak dapat dibatalkan dari sini → 409 bentrok_lain", async () => {
            const r = await minta("POST", `/rooms/${ruang.a}/blocks`, pengguna.petugas, { ...manual(wib("2027-09-13", "08:00"), wib("2027-09-13", "10:00")), batalkan_bentrok: { alasan: "x" } });
            expect(r.status).toBe(409);
            expect(r.json.error?.details?.[0]?.field).toBe("bentrok_lain");
        });
    });

    describe("FR-07.5 A3 — penonaktifan (keputusan 19f)", () => {
        it("slot yang belum dimulai dilepas, yang sudah berjalan tetap sebagai arsip; penonaktifan kedua → 422", async () => {
            const [id] = (await minta<RoomBlockList>("GET", `/rooms/${ruang.a}/blocks`, pengguna.petugas)).json.data.jadwal_tetap.map((x) => x.id);
            const geser = new Date(wib("2027-09-13", "08:00")).getTime() - clock.now().getTime();
            clock.advance(geser);
            try {
                const r = await minta<{ slot_dilepas: number }>("PATCH", `/room-fixed-schedules/${id!}/status`, pengguna.petugas, { status: "NONAKTIF" });
                expect(r.status).toBe(200);
                expect(r.json.data.slot_dilepas).toBe(5);
                expect((await slotRuang(ruang.a)).map((x) => `${x.mulai} ${x.status}`)).toEqual([
                    "2027-09-13 07:00 CONFIRMED",
                    "2027-09-27 07:00 RELEASED",
                    "2027-10-04 07:00 RELEASED",
                    "2027-10-11 07:00 RELEASED",
                    "2027-10-18 07:00 RELEASED",
                    "2027-10-25 07:00 RELEASED",
                ]);
                expect((await minta("PATCH", `/room-fixed-schedules/${id!}/status`, pengguna.petugas, { status: "NONAKTIF" })).status).toBe(422);
                expect((await minta("PATCH", `/room-fixed-schedules/${id!}/status`, pengguna.petugas, { status: "AKTIF" })).status).toBe(422);
            } finally {
                clock.advance(-geser);
            }
        });
    });

    describe("job fixed-schedule-materialize (horizon bergulir, A4)", () => {
        it("memperpanjang horizon saat waktu berjalan, melepas kemunculan yang kini libur, melewati (tidak membatalkan) yang bentrok, dan idempoten", async () => {
            const r = await minta<RoomBlockCreated>("POST", `/rooms/${ruang.c}/blocks`, pengguna.petugas, tetap({ hari: [3], jam_mulai: "13:00", jam_selesai: "14:00", berlaku_sampai: "2028-01-31", label_kegiatan: "Ekskul Paduan Suara" }));
            expect(r.status).toBe(201);
            const awal = (await slotRuang(ruang.c)).map((x) => x.mulai);
            expect(awal.at(-1)).toBe("2027-12-01 13:00"); // horizon 90 hari dari 6 Sep = 5 Des

            // Reservasi pada Rabu di luar horizon kini — kemunculannya kelak bentrok dan DILEWATI.
            await kueri(`INSERT INTO holidays (tanggal, nama, jenis) VALUES ('2027-10-13', 'Libur Uji Blokade B', 'SEKOLAH') ON CONFLICT (tanggal) DO NOTHING`);
            const geser = 14 * 86_400_000;
            clock.advance(geser);
            try {
                await ajukanDisetujui(pengguna.guru, ruang.c, "2027-12-15", "13:00", "14:00");
                const h = await jalankanMaterialisasiJadwalTetap(getDb(), clock);
                expect(h.galat).toBe(0);
                const s = await slotRuang(ruang.c);
                const aktif = s.filter((x) => x.status === "CONFIRMED" && x.origin === "fixed_schedule").map((x) => x.mulai);
                expect(aktif).toContain("2027-12-08 13:00"); // horizon kini 20 Des
                expect(aktif).not.toContain("2027-12-15 13:00"); // bentrok → dilewati
                expect(s.find((x) => x.mulai === "2027-12-15 13:00" && x.origin === "reservation")?.status).toBe("CONFIRMED"); // tak pernah dibatalkan
                expect(s.find((x) => x.mulai === "2027-10-13 13:00")?.status).toBe("RELEASED"); // libur baru
                const sebelum = s.length;
                const lagi = await jalankanMaterialisasiJadwalTetap(getDb(), clock);
                expect(lagi.galat).toBe(0);
                // Idempoten (JOB-03): slot milik aturan sendiri bukan "bentrok"; hanya reservasi 15 Des yang tersisa.
                expect(lagi.rincian).toMatchObject({ slot_dibuat: 0, slot_dilepas_libur: 0, kemunculan_bentrok: 1 });
                expect((await slotRuang(ruang.c)).length).toBe(sebelum); // idempoten
            } finally {
                clock.advance(-geser);
            }
        });

        it("SlotService.reserve berpelaku SYSTEM menulis created_by NULL, bukan id 0 yang melanggar FK users (AL-06)", async () => {
            const slot = await withTransaction(createSystemAuthContext("uji-blokade"), (scope) =>
                new SlotService(clock).reserve(scope, { status: "CONFIRMED", sumberDaya: [{ jenis: "room", id: Number(ruang.c) }], rentang: { mulai: new Date(wib("2027-09-09", "15:00")), selesai: new Date(wib("2027-09-09", "16:00")) }, asal: "maintenance" }),
            getDb());
            const [baris] = await kueri<{ created_by: string | null }>(`SELECT created_by::text FROM booking_slots WHERE id = ${slot[0]!.id}`);
            expect(baris).toEqual({ created_by: null });
        });

        it("FR-07.5 AC: regenerasi horizon 90 hari untuk 30 ruangan (Senin–Jumat) ≤ 10 detik, asinkron lewat job", async () => {
            const ids: string[] = [];
            for (let i = 0; i < 30; i++) ids.push((await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, dapat_direservasi, boleh_direservasi_siswa, status) VALUES (${area}, 'Kelas Kinerja ${String(i)}', '${unik("K")}', 'KELAS', 30, true, false, 'AKTIF') RETURNING id::text`))[0]!.id);
            // Aturan ditulis langsung (tanpa slot) — yang diukur adalah regenerasi job, bukan API.
            await kueri(`INSERT INTO room_fixed_schedules (room_id, hari, jam_mulai, jam_selesai, label_kegiatan, berlaku_mulai, berlaku_sampai)
                SELECT r.id, h, '07:00', '08:00', 'KBM', '2027-09-06', '2028-06-30' FROM unnest(ARRAY[${ids.join(",")}]::bigint[]) AS r(id) CROSS JOIN generate_series(1, 5) AS h`);
            const t0 = performance.now();
            const h = await jalankanMaterialisasiJadwalTetap(getDb(), clock);
            const durasi = performance.now() - t0;
            console.log(`[FR-07.5 AC] regenerasi ${String(h.rincian?.["slot_dibuat"])} slot, 30 ruangan × 90 hari: ${durasi.toFixed(0)} ms`);
            expect(h.galat).toBe(0);
            expect(Number(h.rincian?.["slot_dibuat"])).toBeGreaterThan(30 * 5 * 12);
            expect(durasi).toBeLessThan(10_000);
        }, 60_000);
    });
});
