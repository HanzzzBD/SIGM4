// Acceptance PR-03-09 (FR-07.1, AV-01, CAL-UI-02/05/06/09; keputusan 12 log phase-03):
// `GET /rooms/availability` — HTTP penuh lewat `createApp()` terhadap PostgreSQL nyata.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { RoomAvailability } from "@sigm4/schemas";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { ReservationService } from "../../src/modules/m07-reservation-room/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { SlotService } from "../../src/shared/booking/index.js";
import type { AsalSlot, RentangWaktu } from "../../src/shared/booking/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { DocumentNumberService } from "../../src/shared/numbering/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined && process.env["REDIS_URL"] !== undefined;
const clock = new FixedClock(new Date("2027-02-20T00:00:00Z"));
const slotService = new SlotService(clock);
const reservasi = new ReservationService(slotService, new DocumentNumberService(clock), new AuditLogger({ clock }));

// Senin 1 Maret 2027 WIB sampai Senin berikutnya — di luar jendela uji berkas lain.
const DARI = "2027-03-01T00:00:00+07:00";
const SAMPAI = "2027-03-08T00:00:00+07:00";
const LIBUR = "2027-03-03";
const jamWib = (tgl: string, mulai: string, selesai: string): RentangWaktu => ({ mulai: new Date(`${tgl}T${mulai}:00+07:00`), selesai: new Date(`${tgl}T${selesai}:00+07:00`) });

const unik = (a: string) => `AVL${a}${randomUUID().slice(0, 6)}`;

describe.skipIf(!ADA)("PR-03-09 — GET /rooms/availability (acceptance)", () => {
    let server: Server;
    let url = "";
    let pengguna = 0;
    let gedung = "";
    let gedungLain = "";
    const ruang: Record<"aula" | "lab" | "siswa" | "tutup" | "nonaktif" | "lain", string> = { aula: "", lab: "", siswa: "", tutup: "", nonaktif: "", lain: "" };

    const ctxUji = () => createAuthContext({ userId: pengguna, roleCode: "R-02", scopes: new Map<string, Scope>([["reservation.view", "all"]]) });
    const pesan = (roomId: string, rentang: RentangWaktu, asal: AsalSlot) =>
        withTransaction(ctxUji(), (s) => slotService.reserve(s, { sumberDaya: [{ jenis: "room", id: Number(roomId) }], rentang, asal, status: "CONFIRMED" }), getDb());

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
            setAuthContext(res, createAuthContext({ userId: Number(req.header("x-uji-user") ?? pengguna), roleCode: "R-02", scopes: new Map<string, Scope>(perms.map((p) => [p.split(":")[0]!, (p.split(":")[1] ?? "all") as Scope])) }));
            setAmr(res, ["pwd", AMR_OTP]);
            next();
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;

        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Bu Sari Pemohon', '${unik("u")}@sekolah.sch.id', 'x', '${unik("NIP")}', (SELECT id FROM roles WHERE kode = 'R-04'), 'AKTIF', false) RETURNING id::text`);
        pengguna = Number(u?.id);
        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung A', '${unik("G")}') RETURNING id::text`);
        const [g2] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung B', '${unik("G")}') RETURNING id::text`);
        gedung = g?.id ?? "";
        gedungLain = g2?.id ?? "";
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedung}, 'Lt 1', '${unik("A")}') RETURNING id::text`);
        const [a2] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedungLain}, 'Lt 1', '${unik("A")}') RETURNING id::text`);
        const ruangan = async (area: string, nama: string, jenis: string, kapasitas: number, opsi: { reservasi?: boolean; siswa?: boolean; status?: string } = {}) =>
            (await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, dapat_direservasi, boleh_direservasi_siswa, status)
                VALUES (${area}, '${nama}', '${unik("R")}', '${jenis}', ${String(kapasitas)}, ${String(opsi.reservasi ?? true)}, ${String(opsi.siswa ?? false)}, '${opsi.status ?? "AKTIF"}') RETURNING id::text`))[0]?.id ?? "";
        ruang.aula = await ruangan(a?.id ?? "", "Aula Utama", "AULA", 200);
        ruang.lab = await ruangan(a?.id ?? "", "Lab Kimia", "LABORATORIUM", 30);
        ruang.siswa = await ruangan(a?.id ?? "", "Ruang OSIS", "LAINNYA", 20, { siswa: true });
        ruang.tutup = await ruangan(a?.id ?? "", "Gudang", "GUDANG", 5, { reservasi: false });
        ruang.nonaktif = await ruangan(a?.id ?? "", "Kelas Lama", "KELAS", 30, { status: "NONAKTIF" });
        ruang.lain = await ruangan(a2?.id ?? "", "Aula B", "AULA", 100);
        await kueri(`INSERT INTO holidays (tanggal, nama, jenis) VALUES ('${LIBUR}', 'Hari Raya Nyepi', 'NASIONAL') ON CONFLICT (tanggal) DO NOTHING`);

        // Aula: pengajuan menunggu (Senin), disetujui (Selasa), jadwal tetap, blokade, dan slot lepas.
        await withTransaction(ctxUji(), (s) => reservasi.buatReservasiRuangan(s, {
            roomId: Number(ruang.aula), rentang: jamWib("2027-03-01", "08:00", "10:00"), kedaluwarsa: new Date("2027-02-22T00:00:00Z"),
            namaKegiatan: "Rapat Komite", jenisKegiatan: "Rapat", jumlahPeserta: 40,
        }), getDb());
        await pesan(ruang.aula, jamWib("2027-03-02", "13:00", "15:00"), "reservation");
        await pesan(ruang.aula, jamWib("2027-03-04", "07:00", "09:00"), "fixed_schedule");
        await pesan(ruang.aula, jamWib("2027-03-05", "06:00", "18:00"), "manual_block");
        const [lepas] = await pesan(ruang.aula, jamWib("2027-03-02", "08:00", "09:00"), "reservation");
        await withTransaction(ctxUji(), (s) => slotService.release(s, [Number(lepas?.id)]), getDb());
        // Tepat berdempet dengan batas rentang permintaan — [) tidak beririsan (SDD-AVL-02).
        await pesan(ruang.aula, { mulai: new Date(SAMPAI), selesai: new Date("2027-03-08T02:00:00+07:00") }, "reservation");
        // Pengajuan sungguhan — rinciannya ADA di basis data, jadi kebocoran ke Siswa dapat terjadi bila tak disaring.
        await withTransaction(ctxUji(), (s) => reservasi.buatReservasiRuangan(s, {
            roomId: Number(ruang.siswa), rentang: jamWib("2027-03-01", "10:00", "11:00"), kedaluwarsa: new Date("2027-02-22T00:00:00Z"),
            namaKegiatan: "Rapat OSIS Rahasia", jenisKegiatan: "Rapat", jumlahPeserta: 10,
        }), getDb());
    });

    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const semua = Object.values(ruang).join(",");
        await kueri(`DELETE FROM booking_slots WHERE resource_type = 'room' AND resource_id IN (${semua})`);
        await kueri(`DELETE FROM reservations WHERE room_id IN (${semua})`);
        await kueri(`DELETE FROM rooms WHERE id IN (${semua})`);
        await kueri(`DELETE FROM areas WHERE building_id IN (${gedung}, ${gedungLain})`);
        await kueri(`DELETE FROM buildings WHERE id IN (${gedung}, ${gedungLain})`);
        await kueri(`DELETE FROM holidays WHERE tanggal = '${LIBUR}' AND nama = 'Hari Raya Nyepi'`);
        await kueri("UPDATE system_settings SET value = '30' WHERE key = 'reservasi.granularitas_menit'");
        await kueri(`DELETE FROM users WHERE id = ${String(pengguna)}`);
    });

    const minta = async (query: string, perms: readonly string[] = ["reservation.view"], userId = pengguna) => {
        const res = await fetch(`${url}/rooms/availability?${query}`, { headers: { "x-uji-perms": perms.join(","), "x-uji-user": String(userId) } });
        return { status: res.status, json: (await res.json()) as { data: RoomAvailability; error?: { code: string; details?: { field: string }[] } } };
    };
    const rentang = `dari=${encodeURIComponent(DARI)}&sampai=${encodeURIComponent(SAMPAI)}`;
    const milik = (d: RoomAvailability, id: string) => d.slot.filter((s) => s.ruangan_id === id);

    it("tanpa reservation.view → 403", async () => {
        expect((await minta(rentang, ["asset.view"])).status).toBe(403);
    });

    it("rentang terbalik atau > 42 hari → 422 pada `sampai` (keputusan 12d); tepat 42 hari sah", async () => {
        const terbalik = await minta(`dari=${encodeURIComponent(SAMPAI)}&sampai=${encodeURIComponent(DARI)}`);
        expect(terbalik.status).toBe(422);
        expect(terbalik.json.error?.details?.[0]?.field).toBe("sampai");
        expect((await minta(`dari=${encodeURIComponent(DARI)}&sampai=${encodeURIComponent("2027-04-12T00:00:01+07:00")}`)).status).toBe(422);
        expect((await minta(`dari=${encodeURIComponent(DARI)}&sampai=${encodeURIComponent("2027-04-12T00:00:00+07:00")}`)).status).toBe(200);
        expect((await minta("dari=kemarin&sampai=besok")).status).toBe(422);
    });

    it("BR-016: hanya ruangan aktif & dapat direservasi; jam operasional, libur, granularitas, WIB", async () => {
        const { status, json } = await minta(`${rentang}&gedung_id=${gedung}`);
        expect(status).toBe(200);
        const d = json.data;
        expect(d.ruangan.map((r) => r.nama)).toEqual(["Aula Utama", "Lab Kimia", "Ruang OSIS"]);
        expect(d.ruangan[0]).toMatchObject({ kode: expect.any(String), jenis: "AULA", kapasitas: 200, gedung: { id: gedung, nama: "Gedung A" } });
        expect(d.zona_waktu).toBe("Asia/Jakarta");
        expect(d.granularitas_menit).toBe(30);
        expect(d.jam_operasional).toMatchObject({ mulai: "06:00", selesai: "18:00" });
        expect(d.jam_operasional.hari.length).toBeGreaterThan(0);
        expect(d.hari_libur).toContainEqual({ tanggal: LIBUR, nama: "Hari Raya Nyepi" });
    });

    it("filter FR-07.1 langkah 3: gedung, jenis ruangan, kapasitas minimum", async () => {
        expect((await minta(`${rentang}&gedung_id=${gedungLain}`)).json.data.ruangan.map((r) => r.nama)).toEqual(["Aula B"]);
        expect((await minta(`${rentang}&gedung_id=${gedung}&jenis=LABORATORIUM`)).json.data.ruangan.map((r) => r.nama)).toEqual(["Lab Kimia"]);
        expect((await minta(`${rentang}&gedung_id=${gedung}&kapasitas_min=25`)).json.data.ruangan.map((r) => r.nama)).toEqual(["Aula Utama", "Lab Kimia"]);
    });

    it("CAL-UI-05: menunggu, disetujui, jadwal tetap, pemeliharaan; slot lepas & berdempet tak ikut", async () => {
        const d = (await minta(`${rentang}&gedung_id=${gedung}`)).json.data;
        const aula = milik(d, ruang.aula);
        expect(aula.map((s) => [s.keadaan, s.mulai])).toEqual([
            ["MENUNGGU_PERSETUJUAN", "2027-03-01T01:00:00.000Z"],
            ["DISETUJUI", "2027-03-02T06:00:00.000Z"],
            ["JADWAL_TETAP", "2027-03-04T00:00:00.000Z"],
            ["PEMELIHARAAN", "2027-03-04T23:00:00.000Z"],
        ]);
        // FR-07.1 langkah 4: nama kegiatan + pemohon pada slot reservasi.
        expect(aula[0]).toMatchObject({ label: "Rapat Komite", reservasi: { nomor: expect.stringMatching(/^RSV-RG-2027-\d{4}$/), pemohon: "Bu Sari Pemohon" } });
        expect(aula[2]).toMatchObject({ label: null, reservasi: null });
    });

    it("FR-07.1 A1 / CAL-UI-06: scope restricted hanya ruangan siswa, tanpa label & pemohon", async () => {
        // Siswa LAIN dari pemohon: rincian pengajuan pihak lain tak pernah dibaca (miliknya sendiri berincian, keputusan 17b).
        const d = (await minta(`${rentang}&gedung_id=${gedung}`, ["reservation.view:restricted"], pengguna + 100_000)).json.data;
        expect(d.ruangan.map((r) => r.nama)).toEqual(["Ruang OSIS"]);
        expect(d.slot).toHaveLength(1);
        expect(d.slot[0]).toMatchObject({ keadaan: "MENUNGGU_PERSETUJUAN", label: null, reservasi: null });
        expect(JSON.stringify(d)).not.toMatch(/Bu Sari|Rapat OSIS Rahasia|RSV-RG/);
    });

    it("CAL-UI-02: granularitas mengikuti parameter sistem (0044)", async () => {
        await kueri("UPDATE system_settings SET value = '15' WHERE key = 'reservasi.granularitas_menit'");
        expect((await minta(rentang)).json.data.granularitas_menit).toBe(15);
        await kueri("UPDATE system_settings SET value = '30' WHERE key = 'reservasi.granularitas_menit'");
    });

    it("FR-07.1 AC: 30 ruangan × 42 hari dijawab < 2 detik", async () => {
        const area = (await kueri<{ id: string }>(`SELECT id::text FROM areas WHERE building_id = ${gedungLain}`))[0]?.id ?? "";
        const ids = await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, dapat_direservasi)
            SELECT ${area}, 'Kelas ' || n, '${unik("P")}' || n, 'KELAS', 30, true FROM generate_series(1, 29) n RETURNING id::text`);
        for (const r of ids) ruang[`lain${r.id}` as keyof typeof ruang] = r.id;
        await kueri(`INSERT INTO booking_slots (resource_type, resource_id, slot_range, status, origin)
            SELECT 'room', r.id, tstzrange(timestamptz '2027-03-01 07:00+07' + (h || ' day')::interval, timestamptz '2027-03-01 09:00+07' + (h || ' day')::interval, '[)'), 'CONFIRMED', 'fixed_schedule'
              FROM rooms r CROSS JOIN generate_series(0, 41) h WHERE r.area_id = ${area}`);
        const mulai = performance.now();
        const { status, json } = await minta(`dari=${encodeURIComponent(DARI)}&sampai=${encodeURIComponent("2027-04-12T00:00:00+07:00")}&gedung_id=${gedungLain}`);
        const ms = performance.now() - mulai;
        expect(status).toBe(200);
        expect(json.data.ruangan).toHaveLength(30);
        expect(json.data.slot).toHaveLength(30 * 42);
        expect(ms).toBeLessThan(2000);
    });
});
