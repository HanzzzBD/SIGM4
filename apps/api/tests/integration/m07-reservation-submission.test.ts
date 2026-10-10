// Acceptance PR-03-10 (FR-07.2, BR-017 … BR-024a, SDD-APR-17, sekuens 15.2; keputusan 14 log
// phase-03): `POST /reservations` + `/preview` lewat `createApp()` terhadap PostgreSQL nyata,
// keputusan approval lewat `POST /approvals/{id}/decide`, `auto_reject` lewat JALUR WORKER
// (`approval-sla-check`), dan TTL lewat job `tentative-slot-expiry` + konsumen outbox.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { RoomReservationCreated, RoomReservationPreview } from "@sigm4/schemas";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { blokirPemohon, pasangKonsumenReservasi } from "../../src/modules/m07-reservation-room/index.js";
import { ApprovalService } from "../../src/modules/m10-approval/index.js";
import { fcmCheck, pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher } from "../../src/shared/events/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { jalankanPemeriksaanSla } from "../../src/worker/approval-sla-check.js";
import { jalankanKedaluwarsaSlot } from "../../src/worker/slot-jobs.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined && process.env["REDIS_URL"] !== undefined;
// Senin 3 Mei 2027 09.00 WIB — di luar jendela tanggal uji berkas lain.
const SEKARANG = new Date("2027-05-03T02:00:00Z");
const clock = new FixedClock(SEKARANG);
const LIBUR = "2027-05-13";
const NAMA_LIBUR = "Libur Uji M07";
const wib = (tgl: string, jam: string) => `${tgl}T${jam}:00+07:00`;
const unik = (a: string) => `RSB${a}${randomUUID().slice(0, 6)}`;

interface Peran {
    readonly id: number;
    readonly role: string;
    readonly perms: readonly string[];
}
type Jawaban<T> = { status: number; json: { success: boolean; data: T; error?: { code: string; message: string; details?: { field: string; message: string }[] } } };

describe.skipIf(!ADA)("PR-03-10 — pengajuan reservasi ruangan (acceptance)", () => {
    let server: Server;
    let url = "";
    const ruang = { aula: "", lab: "", osis: "" };
    let gedung = "";
    const aturanIds: string[] = [];
    const pengguna: Record<"guru" | "guru2" | "guru3" | "siswa" | "petugas" | "teknisi" | "approver" | "kepala" | "diblokir", Peran> = {} as never;

    beforeAll(async () => {
        dbmate("up");
        await kueri("DELETE FROM event_outbox");
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

        const buatPengguna = async (role: string, nama: string, perms: readonly string[]): Promise<Peran> => {
            const [u] = await kueri<{ id: string }>(`
                INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
                VALUES ('${nama}', '${unik("u")}@uji-m07.sch.id', 'x', '${unik("N")}', (SELECT id FROM roles WHERE kode = '${role}'), 'AKTIF', false) RETURNING id::text`);
            return { id: Number(u?.id), role, perms };
        };
        const PEMOHON = ["reservation.view", "reservation.create"];
        pengguna.guru = await buatPengguna("R-05", "Pak Budi Guru", PEMOHON);
        pengguna.guru2 = await buatPengguna("R-05", "Bu Ani Guru", PEMOHON);
        pengguna.guru3 = await buatPengguna("R-05", "Pak Dedi Guru", PEMOHON);
        pengguna.diblokir = await buatPengguna("R-05", "Pak Eko Terblokir", PEMOHON);
        pengguna.siswa = await buatPengguna("R-07", "Siti Siswa", ["reservation.view:restricted", "reservation.create"]);
        pengguna.petugas = await buatPengguna("R-02", "Pak Joko Petugas", [...PEMOHON, "reservation.urgent"]);
        pengguna.teknisi = await buatPengguna("R-04", "Pak Teknisi", ["reservation.view"]);
        pengguna.approver = await buatPengguna("R-03", "Bu Wakasek Approver", ["approval.decide"]);
        pengguna.kepala = await buatPengguna("R-03", "Pak Kepala Sekolah", ["approval.decide"]);

        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung Uji M07', '${unik("G")}') RETURNING id::text`);
        gedung = g?.id ?? "";
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedung}, 'Lt 1', '${unik("A")}') RETURNING id::text`);
        const ruangan = async (nama: string, jenis: string, kapasitas: number, siswa: boolean) =>
            (await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, dapat_direservasi, boleh_direservasi_siswa, status)
                VALUES (${a?.id ?? ""}, '${nama}', '${unik("R")}', '${jenis}', ${String(kapasitas)}, true, ${String(siswa)}, 'AKTIF') RETURNING id::text`))[0]?.id ?? "";
        ruang.aula = await ruangan("Aula Uji", "AULA", 100, false);
        ruang.lab = await ruangan("Lab Uji", "LABORATORIUM", 30, false);
        ruang.osis = await ruangan("Ruang OSIS Uji", "LAINNYA", 20, true);
        await kueri(`INSERT INTO holidays (tanggal, nama, jenis) VALUES ('${LIBUR}', '${NAMA_LIBUR}', 'NASIONAL') ON CONFLICT (tanggal) DO NOTHING`);

        // Aturan khusus ruangan uji (kondisi room_id) — tak memengaruhi pengajuan berkas lain.
        const aturan = async (rooms: readonly string[], langkah: string, terminal: string) => {
            const [r] = await kueri<{ id: string }>(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas, terminal_on_exhausted_escalation)
                VALUES ('RESERVASI_RUANGAN', '{"field":"room_id","op":"in","value":[${rooms.join(",")}]}', 95, '${terminal}') RETURNING id::text`);
            aturanIds.push(r?.id ?? "");
            await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_user_id, sla_jam, on_sla_breach, eskalasi_ke) VALUES (${r?.id ?? ""}, 1, 'user', ${langkah})`);
        };
        await aturan([ruang.aula, ruang.osis], `${String(pengguna.approver.id)}, 8, 'remind', NULL`, "hold_and_alert");
        await aturan([ruang.lab], `${String(pengguna.approver.id)}, 8, 'escalate', ${String(pengguna.kepala.id)}`, "auto_reject");

        // BR-030 (keputusan 14d): pemeriksa uji memblokir satu pemohon saja.
        blokirPemohon.daftar({
            nama: "uji-m07-blokir",
            alasanBlokir: (_s, id) => Promise.resolve(id === pengguna.diblokir.id ? [{ jenis: "DENDA_BELUM_LUNAS", keterangan: "Denda Rp25.000 belum lunas." }] : []),
        });
    });

    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const semua = Object.values(ruang).join(",");
        const ids = Object.values(pengguna).map((p) => p.id).join(",");
        await kueri(`DELETE FROM notifications WHERE user_id IN (${ids})`);
        // Notifikasi peran (NT-06/NT-47 ke SELURUH Petugas/Admin) dapat menyasar pengguna berkas lain: dihapus menurut rujukannya.
        await kueri(`DELETE FROM notifications WHERE referensi_jenis = 'approval_instance' AND referensi_id IN (SELECT id FROM approval_instances WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM notifications WHERE referensi_jenis = 'reservation' AND referensi_id IN (SELECT id FROM reservations WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM approval_steps WHERE instance_id IN (SELECT id FROM approval_instances WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM approval_instances WHERE pemohon_id IN (${ids})`);
        await kueri(`DELETE FROM approval_rule_steps WHERE rule_id IN (${aturanIds.join(",")})`);
        await kueri(`DELETE FROM approval_rules WHERE id IN (${aturanIds.join(",")})`);
        await kueri(`DELETE FROM booking_slots WHERE resource_type = 'room' AND resource_id IN (${semua})`);
        await kueri(`DELETE FROM reservations WHERE room_id IN (${semua}) AND parent_id IS NOT NULL`);
        await kueri(`DELETE FROM reservations WHERE room_id IN (${semua})`);
        await kueri(`DELETE FROM rooms WHERE id IN (${semua})`);
        await kueri(`DELETE FROM areas WHERE building_id = ${gedung}`);
        await kueri(`DELETE FROM buildings WHERE id = ${gedung}`);
        await kueri(`DELETE FROM holidays WHERE tanggal = '${LIBUR}' AND nama = '${NAMA_LIBUR}'`);
        await kueri(`UPDATE system_settings SET value = '"06:00"' WHERE key = 'reservasi.jam_operasional_mulai'`);
        await kueri("DELETE FROM event_outbox");
        await kueri(`DELETE FROM users WHERE id IN (${ids})`);
    });

    const kirim = async <T>(path: string, siapa: Peran, body: unknown, key: string = randomUUID()): Promise<Jawaban<T>> => {
        const res = await fetch(`${url}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-uji-user": String(siapa.id), "x-uji-role": siapa.role, "x-uji-perms": siapa.perms.join(","), "idempotency-key": key },
            body: JSON.stringify(body),
        });
        return { status: res.status, json: (await res.json()) as Jawaban<T>["json"] };
    };
    const isian = (o: Record<string, unknown> = {}) => ({
        room_id: Number(ruang.aula),
        waktu_mulai: wib("2027-05-05", "08:00"),
        waktu_selesai: wib("2027-05-05", "10:00"),
        nama_kegiatan: "Rapat Komite",
        jenis_kegiatan: "Rapat",
        jumlah_peserta: 40,
        ...o,
    });
    const ajukan = (siapa: Peran, o: Record<string, unknown> = {}, key?: string) => kirim<RoomReservationCreated>("/reservations", siapa, isian(o), key);
    const pratinjau = (siapa: Peran, o: Record<string, unknown> = {}) => kirim<RoomReservationPreview>("/reservations/preview", siapa, isian(o));
    const putuskan = (instanceId: number, keputusan: "DISETUJUI" | "DITOLAK", siapa = pengguna.approver) =>
        kirim<unknown>(`/approvals/${String(instanceId)}/decide`, siapa, { urutan: 1, keputusan, catatan: keputusan === "DITOLAK" ? "Ruangan dipakai ujian." : null });
    const reservasi = (ids: readonly string[]) =>
        kueri<{ id: string; nomor: string; status: string; parent_id: string | null }>(`SELECT id::text, nomor, status::text, parent_id::text FROM reservations WHERE id IN (${ids.join(",")}) ORDER BY id`);
    const slot = (reservationIds: readonly string[]) =>
        kueri<{ reservation_id: string; status: string; expires_at: Date | null }>(
            `SELECT reservation_id::text, status::text, expires_at FROM booking_slots WHERE reservation_id IN (${reservationIds.join(",")}) ORDER BY reservation_id`,
        );
    const instance = (id: number) => kueri<{ status: string; referensi_id: string; langkah_aktif: number | null }>(`SELECT status::text, referensi_id::text, langkah_aktif FROM approval_instances WHERE id = ${String(id)}`);
    const pelaku = createSystemAuthContext("uji-m07");
    const dispatcher = (jam = clock) => {
        const registry = new EventHandlerRegistry();
        const audit = new AuditLogger({ clock: jam });
        pasangKonsumenReservasi(registry, { db: getDb, clock: jam, ctx: () => pelaku, audit, approval: () => new ApprovalService(getDb(), audit, jam) });
        pasangKonsumenNotifikasi(registry, { db: getDb, clock: jam, ctx: () => pelaku });
        return new OutboxDispatcher({ registry, clock: jam, db: getDb(), logger: new Logger({ clock: jam, tulis: () => undefined }) });
    };
    const notif = (kode: string, userIds: readonly number[]) =>
        kueri<{ user_id: string; isi: string; deep_link: string | null }>(`SELECT user_id::text, isi, deep_link FROM notifications WHERE kode = '${kode}' AND user_id IN (${userIds.join(",")}) ORDER BY user_id`);

    describe("otorisasi & validasi isian", () => {
        it("tanpa reservation.create → 403 (Teknisi), baik pengajuan maupun pratinjau", async () => {
            expect((await ajukan(pengguna.teknisi)).status).toBe(403);
            expect((await pratinjau(pengguna.teknisi)).status).toBe(403);
        });

        it("isian tak sah → 422 per isian; aset pendukung ditolak sampai PR-04-02 (keputusan 11c)", async () => {
            const r = await ajukan(pengguna.guru, { nama_kegiatan: " ", waktu_selesai: wib("2027-05-05", "07:00"), aset_pendukung: [{ kategori_id: 1 }] });
            expect(r.status).toBe(422);
            expect(r.json.error?.details?.map((d) => d.field).sort()).toEqual(["aset_pendukung", "nama_kegiatan", "waktu_selesai"]);
        });

        it("Idempotency-Key wajib UUIDv4 (ID-01)", async () => {
            expect((await ajukan(pengguna.guru, {}, "bukan-uuid")).status).toBe(400);
        });
    });

    describe("pengajuan tunggal (FR-07.2 langkah 4-7, sekuens 15.2)", () => {
        it("201: nomor RSV-RG, reservasi + slot TENTATIVE + instance approval dalam SATU transaksi; TTL = akhir H-1 (BR-023b)", async () => {
            const r = await ajukan(pengguna.guru);
            expect(r.status).toBe(201);
            const d = r.json.data;
            expect(d.nomor).toMatch(/^RSV-RG-2027-\d{4,}$/);
            expect(d.status).toBe("MENUNGGU_PERSETUJUAN");
            expect(d.tanggal).toEqual([{ id: d.id, nomor: d.nomor, mulai: "2027-05-05T01:00:00.000Z", selesai: "2027-05-05T03:00:00.000Z" }]);
            expect(await reservasi([d.id])).toEqual([{ id: d.id, nomor: d.nomor, status: "MENUNGGU_PERSETUJUAN", parent_id: null }]);
            // 48 jam dari Senin 09.00 = Rabu 09.00 WIB; akhir H-1 = Rabu 00.00 WIB lebih dulu.
            expect(await slot([d.id])).toEqual([{ reservation_id: d.id, status: "TENTATIVE", expires_at: new Date("2027-05-04T17:00:00Z") }]);
            expect(await instance(d.approval.instance_id)).toEqual([{ status: "MENUNGGU", referensi_id: d.id, langkah_aktif: 1 }]);
            const log = await kueri<{ aksi: string }>(`SELECT aksi FROM activity_logs WHERE (entitas = 'reservations' AND entitas_id = '${d.id}') OR (entitas = 'approval_instances' AND entitas_id = '${String(d.approval.instance_id)}') ORDER BY id`);
            expect(log.map((l) => l.aksi)).toEqual(["RESERVATION_CREATED", "APPROVAL_INSTANCE_CREATED"]);
        });

        it("NT-01: approver langkah aktif dinotifikasi setelah commit, dengan nomor & nama pemohon (FR-07.2 langkah 6)", async () => {
            const r = await ajukan(pengguna.guru, { waktu_mulai: wib("2027-05-05", "13:00"), waktu_selesai: wib("2027-05-05", "14:00") });
            expect(await notif("NT-01", [pengguna.approver.id])).not.toContainEqual(expect.objectContaining({ isi: expect.stringContaining(r.json.data.nomor) as unknown }));
            await dispatcher().drain();
            const [n] = (await notif("NT-01", [pengguna.approver.id])).filter((x) => x.isi.includes(r.json.data.nomor));
            expect(n).toEqual({ user_id: String(pengguna.approver.id), isi: `Pengajuan Reservasi ${r.json.data.nomor} dari Pak Budi Guru menunggu persetujuan Anda.`, deep_link: `/reservasi/${r.json.data.id}` });
        });

        it("Idempotency-Key sama → pengajuan yang sama, bukan dua (ID-03)", async () => {
            const key = randomUUID();
            const o = { waktu_mulai: wib("2027-05-07", "08:00"), waktu_selesai: wib("2027-05-07", "09:00") };
            const a = await ajukan(pengguna.guru2, o, key);
            const b = await ajukan(pengguna.guru2, o, key);
            expect(a.status).toBe(201);
            expect(b.json.data.id).toBe(a.json.data.id);
            expect(await kueri(`SELECT 1 FROM reservations WHERE pemohon_id = ${String(pengguna.guru2.id)} AND waktu_mulai = '2027-05-07T01:00:00Z'`)).toHaveLength(1);
        });
    });

    describe("aturan bisnis", () => {
        it("BR-017 / FR-07.2 A1: beririsan dengan slot aktif → 409 RESERVATION_CONFLICT menyebut tanggalnya", async () => {
            const r = await ajukan(pengguna.guru2, { waktu_mulai: wib("2027-05-05", "09:00"), waktu_selesai: wib("2027-05-05", "11:00") });
            expect(r.status).toBe(409);
            expect(r.json.error?.code).toBe("RESERVATION_CONFLICT");
            expect(r.json.error?.details?.[0]).toEqual({ field: "waktu_mulai", message: "2027-05-05: Ruangan sudah terpakai pada rentang ini." });
        });

        it("BR-017 + Task breakdown: dua pemohon serentak pada rentang sama → tepat satu berhasil, sisanya 409 (CI-01)", async () => {
            const o = { room_id: Number(ruang.lab), waktu_mulai: wib("2027-05-11", "08:00"), waktu_selesai: wib("2027-05-11", "10:00"), jumlah_peserta: 10 };
            const hasil = await Promise.all([pengguna.guru, pengguna.guru2, pengguna.guru3, pengguna.petugas].map((p) => ajukan(p, o)));
            expect(hasil.map((h) => h.status).sort()).toEqual([201, 409, 409, 409]);
            expect(hasil.filter((h) => h.status === 409).every((h) => h.json.error?.code === "RESERVATION_CONFLICT")).toBe(true);
        });

        it("BR-018: di luar jam operasional, hari Minggu, hari libur, dan jam tak sejajar granularitas → 422", async () => {
            const alasan = async (o: Record<string, unknown>) => {
                const r = await ajukan(pengguna.guru, o);
                expect(r.status).toBe(422);
                return r.json.error?.details?.[0]?.message;
            };
            expect(await alasan({ waktu_mulai: wib("2027-05-06", "17:00"), waktu_selesai: wib("2027-05-06", "19:00") })).toBe("2027-05-06: Di luar jam operasional (06:00–18:00 WIB).");
            expect(await alasan({ waktu_mulai: wib("2027-05-09", "08:00"), waktu_selesai: wib("2027-05-09", "10:00") })).toBe("2027-05-09: Bukan hari kerja sekolah.");
            expect(await alasan({ waktu_mulai: wib(LIBUR, "08:00"), waktu_selesai: wib(LIBUR, "10:00") })).toMatch(/^2027-05-13: Hari libur: /);
            expect(await alasan({ waktu_mulai: wib("2027-05-06", "08:10"), waktu_selesai: wib("2027-05-06", "09:00") })).toBe("2027-05-06: Jam mulai dan selesai harus kelipatan 30 menit.");
        });

        it("BR-018 dari system_settings (keputusan 14b): jam mulai 07:00 menolak 06:30 dan kalender P-27 ikut", async () => {
            await kueri(`UPDATE system_settings SET value = '"07:00"' WHERE key = 'reservasi.jam_operasional_mulai'`);
            try {
                const r = await ajukan(pengguna.guru, { waktu_mulai: wib("2027-05-06", "06:30"), waktu_selesai: wib("2027-05-06", "08:00") });
                expect(r.json.error?.details?.[0]?.message).toBe("2027-05-06: Di luar jam operasional (07:00–18:00 WIB).");
                const kal = await fetch(`${url}/rooms/availability?dari=${encodeURIComponent(wib("2027-05-06", "00:00"))}&sampai=${encodeURIComponent(wib("2027-05-07", "00:00"))}`, {
                    headers: { "x-uji-user": String(pengguna.guru.id), "x-uji-perms": "reservation.view" },
                });
                expect(((await kal.json()) as { data: { jam_operasional: { mulai: string } } }).data.jam_operasional.mulai).toBe("07:00");
            } finally {
                await kueri(`UPDATE system_settings SET value = '"06:00"' WHERE key = 'reservasi.jam_operasional_mulai'`);
            }
        });

        it("BR-019 / FR-07.2 A2: peserta melebihi kapasitas → 422 menyebut kapasitasnya", async () => {
            const r = await ajukan(pengguna.guru, { room_id: Number(ruang.lab), jumlah_peserta: 31 });
            expect(r.status).toBe(422);
            expect(r.json.error?.details).toEqual([{ field: "jumlah_peserta", message: "Jumlah peserta melebihi kapasitas ruangan (30 orang)." }]);
        });

        it("BR-020 (keputusan 14c): hari ini ditolak bagi Guru, besok sah; reservation.urgent boleh hari ini dengan TTL = waktu mulai", async () => {
            const hariIni = { room_id: Number(ruang.lab), waktu_mulai: wib("2027-05-03", "13:00"), waktu_selesai: wib("2027-05-03", "14:00"), jumlah_peserta: 5 };
            const guru = await ajukan(pengguna.guru3, hariIni);
            expect(guru.status).toBe(422);
            expect(guru.json.error?.details?.[0]?.message).toBe("2027-05-03: Pengajuan paling lambat H-1.");
            const petugas = await ajukan(pengguna.petugas, hariIni);
            expect(petugas.status).toBe(201);
            expect((await slot([petugas.json.data.id]))[0]?.expires_at).toEqual(new Date("2027-05-03T06:00:00Z"));
            expect((await ajukan(pengguna.guru3, { ...hariIni, waktu_mulai: wib("2027-05-04", "13:00"), waktu_selesai: wib("2027-05-04", "14:00") })).status).toBe(201);
        });

        it("BR-023c / AV-05: melewati horizon 90 hari → 422", async () => {
            const r = await ajukan(pengguna.guru, { waktu_mulai: wib("2027-08-02", "08:00"), waktu_selesai: wib("2027-08-02", "10:00") });
            expect(r.json.error?.details?.[0]?.message).toBe("2027-08-02: Melewati horizon pemesanan 90 hari.");
        });

        it("BR-022: Siswa tak dapat mengajukan ruangan non-siswa (dijawab seperti tak ada); ruangan siswa sah", async () => {
            const tolak = await ajukan(pengguna.siswa, { jumlah_peserta: 10 });
            expect(tolak.status).toBe(422);
            expect(tolak.json.error?.details).toEqual([{ field: "room_id", message: "Ruangan tidak ditemukan atau tidak dapat direservasi." }]);
            expect((await ajukan(pengguna.siswa, { room_id: Number(ruang.osis), jumlah_peserta: 10, waktu_mulai: wib("2027-05-06", "08:00"), waktu_selesai: wib("2027-05-06", "09:00") })).status).toBe(201);
        });

        it("BR-023a: kuota Siswa 2 — pratinjau melaporkan 2/2, pengajuan ketiga ditolak menyebut jumlah & batasnya", async () => {
            const o = (jam: string) => ({ room_id: Number(ruang.osis), jumlah_peserta: 10, waktu_mulai: wib("2027-05-07", jam), waktu_selesai: wib("2027-05-07", `${jam.slice(0, 2)}:30`) });
            expect((await ajukan(pengguna.siswa, o("08:00"))).status).toBe(201);
            const p = await pratinjau(pengguna.siswa, o("10:00"));
            expect(p.json.data.kuota).toEqual({ berjalan: 2, batas: 2 });
            const r = await ajukan(pengguna.siswa, o("10:00"));
            expect(r.status).toBe(422);
            expect(r.json.error?.details).toEqual([{ field: "kuota", message: "Anda memiliki 2 pengajuan yang menunggu persetujuan; batasnya 2." }]);
        });

        it("BR-030 (keputusan 14d): pemeriksa blokir terdaftar → 422 BORROWER_BLOCKED beserta kewajibannya", async () => {
            const r = await ajukan(pengguna.diblokir);
            expect(r.status).toBe(422);
            expect(r.json.error?.code).toBe("BORROWER_BLOCKED");
            expect(r.json.error?.details).toEqual([{ field: "pemohon", message: "Denda Rp25.000 belum lunas." }]);
        });
    });

    describe("berulang (BR-024a, FR-07.2 A4; keputusan 14g–h)", () => {
        const senin = { waktu_mulai: wib("2027-05-10", "13:00"), waktu_selesai: wib("2027-05-10", "15:00"), pengulangan: { hari: [1], sampai: "2027-05-31" } };

        it("satu induk + satu instance + N turunan bernomor .NN, masing-masing dengan slotnya; induk tanpa slot", async () => {
            const r = await ajukan(pengguna.guru, senin);
            expect(r.status).toBe(201);
            const d = r.json.data;
            expect(d.tanggal.map((t) => [t.nomor, t.mulai])).toEqual([
                [`${d.nomor}.01`, "2027-05-10T06:00:00.000Z"],
                [`${d.nomor}.02`, "2027-05-17T06:00:00.000Z"],
                [`${d.nomor}.03`, "2027-05-24T06:00:00.000Z"],
                [`${d.nomor}.04`, "2027-05-31T06:00:00.000Z"],
            ]);
            const turunan = d.tanggal.map((t) => t.id);
            expect((await reservasi(turunan)).every((b) => b.parent_id === d.id && b.status === "MENUNGGU_PERSETUJUAN")).toBe(true);
            expect(await slot([d.id])).toEqual([]);
            expect((await slot(turunan)).map((s) => s.status)).toEqual(["TENTATIVE", "TENTATIVE", "TENTATIVE", "TENTATIVE"]);
            expect(await kueri(`SELECT 1 FROM approval_instances WHERE jenis_pengajuan = 'RESERVASI_RUANGAN' AND referensi_id IN (${[d.id, ...turunan].join(",")})`)).toHaveLength(1);

            // Keputusan approval berlaku untuk SELURUH tanggal (BR-024a).
            expect((await putuskan(d.approval.instance_id, "DISETUJUI")).status).toBe(200);
            expect((await reservasi([d.id, ...turunan])).map((b) => b.status)).toEqual(Array(5).fill("DISETUJUI"));
            expect((await slot(turunan)).map((s) => [s.status, s.expires_at])).toEqual(Array(4).fill(["CONFIRMED", null]));
        });

        it("tanggal bentrok disebut satu per satu (409); dilewati → pengajuan terbentuk tanpa tanggal itu", async () => {
            const pola = { room_id: Number(ruang.lab), jumlah_peserta: 10, waktu_mulai: wib("2027-05-05", "13:00"), waktu_selesai: wib("2027-05-05", "14:00"), pengulangan: { hari: [3], sampai: "2027-05-26" } };
            expect((await ajukan(pengguna.guru2, { ...pola, pengulangan: undefined, waktu_mulai: wib("2027-05-19", "13:00"), waktu_selesai: wib("2027-05-19", "14:00") })).status).toBe(201);
            const p = await pratinjau(pengguna.guru3, pola);
            expect(p.json.data.tanggal.map((t) => [t.tanggal, t.keadaan])).toEqual([
                ["2027-05-05", "TERSEDIA"],
                ["2027-05-12", "TERSEDIA"],
                ["2027-05-19", "BENTROK"],
                ["2027-05-26", "TERSEDIA"],
            ]);
            const r = await ajukan(pengguna.guru3, pola);
            expect(r.status).toBe(409);
            expect(r.json.error?.details).toEqual([{ field: "pengulangan", message: "2027-05-19: Ruangan sudah terpakai pada rentang ini." }]);
            const lewat = await ajukan(pengguna.guru3, { ...pola, lewati: ["2027-05-19"] });
            expect(lewat.status).toBe(201);
            expect(lewat.json.data.tanggal.map((t) => t.nomor)).toEqual([".01", ".02", ".03"].map((s) => `${lewat.json.data.nomor}${s}`));
        });

        it("hari libur dalam pola → 422 kecuali dilewati; tanggal lewati asing → 422", async () => {
            const pola = { room_id: Number(ruang.osis), jumlah_peserta: 10, waktu_mulai: wib("2027-05-06", "15:00"), waktu_selesai: wib("2027-05-06", "16:00"), pengulangan: { hari: [4], sampai: "2027-05-20" } };
            const r = await ajukan(pengguna.guru, pola);
            expect(r.status).toBe(422);
            expect(r.json.error?.details?.[0]?.message).toMatch(/^2027-05-13: Hari libur/);
            expect((await ajukan(pengguna.guru, { ...pola, lewati: ["2027-05-14"] })).json.error?.details).toEqual([
                { field: "lewati", message: "Tanggal 2027-05-14 bukan bagian dari pola pengulangan." },
            ]);
            expect((await ajukan(pengguna.guru, { ...pola, lewati: [LIBUR] })).status).toBe(201);
        });
    });

    describe("pratinjau (keputusan 14f, RE-07)", () => {
        it("jalur persetujuan pemohon + tanggal, tanpa menulis apa pun", async () => {
            const sebelum = await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM reservations WHERE room_id = ${ruang.aula}`);
            const p = await pratinjau(pengguna.guru, { waktu_mulai: wib("2027-05-20", "08:00"), waktu_selesai: wib("2027-05-20", "09:00") });
            expect(p.status).toBe(200);
            expect(p.json.data.tanggal).toEqual([{ tanggal: "2027-05-20", mulai: "2027-05-20T01:00:00.000Z", selesai: "2027-05-20T02:00:00.000Z", keadaan: "TERSEDIA", alasan: null }]);
            expect(p.json.data.jalur_persetujuan).toEqual([{ urutan: 1, approver: "Bu Wakasek Approver", sla_jam: 8, fallback: false, akan_dilewati: null }]);
            expect(await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM reservations WHERE room_id = ${ruang.aula}`)).toEqual(sebelum);
        });
    });

    describe("akibat keputusan approval (SDD-APR-17, keputusan 75)", () => {
        it("ditolak → DITOLAK, slot RELEASED, rentang langsung dapat dipesan lagi", async () => {
            const o = { waktu_mulai: wib("2027-05-21", "08:00"), waktu_selesai: wib("2027-05-21", "10:00") };
            const r = await ajukan(pengguna.guru, o);
            expect((await putuskan(r.json.data.approval.instance_id, "DITOLAK")).status).toBe(200);
            expect((await reservasi([r.json.data.id]))[0]?.status).toBe("DITOLAK");
            expect((await slot([r.json.data.id]))[0]?.status).toBe("RELEASED");
            expect((await ajukan(pengguna.guru2, o)).status).toBe(201);
        });

        it("auto_reject job approval-sla-check (JALUR WORKER) melepas slot lewat penangan yang sama", async () => {
            const r = await ajukan(pengguna.guru, { room_id: Number(ruang.lab), jumlah_peserta: 10, waktu_mulai: wib("2027-05-27", "08:00"), waktu_selesai: wib("2027-05-27", "10:00") });
            const tenggat = async () => (await kueri<{ sla_deadline: Date }>(`SELECT sla_deadline FROM approval_steps WHERE instance_id = ${String(r.json.data.approval.instance_id)} AND keputusan IS NULL`))[0]?.sla_deadline;
            await jalankanPemeriksaanSla(getDb(), new FixedClock(new Date((await tenggat())!.getTime() + 60_000))); // eskalasi ke Kepala
            await jalankanPemeriksaanSla(getDb(), new FixedClock(new Date((await tenggat())!.getTime() + 60_000))); // eskalasi habis → auto_reject
            expect((await instance(r.json.data.approval.instance_id))[0]?.status).toBe("DITOLAK");
            expect((await reservasi([r.json.data.id]))[0]?.status).toBe("DITOLAK");
            expect((await slot([r.json.data.id]))[0]?.status).toBe("RELEASED");
        });
    });

    describe("TTL slot tentatif (BR-023b, PR-02-37 → konsumen M-07)", () => {
        it("slot habis TTL: persetujuan gagal 409; konsumen menetapkan KEDALUWARSA, menutup instance, NT-46 ke pemohon + approver", async () => {
            const r = await ajukan(pengguna.guru2, { room_id: Number(ruang.osis), jumlah_peserta: 10, waktu_mulai: wib("2027-05-28", "08:00"), waktu_selesai: wib("2027-05-28", "09:00") });
            const d = r.json.data;
            const lewat = new FixedClock(new Date("2027-05-05T03:00:00Z")); // > 48 jam sejak pengajuan
            await jalankanKedaluwarsaSlot(getDb(), lewat);
            expect((await slot([d.id]))[0]?.status).toBe("RELEASED");

            // Event belum diproses: approver memutus pada saat itu → objek tak lagi tersedia (FR-10.2 A5).
            const tolak = await putuskan(d.approval.instance_id, "DISETUJUI");
            expect(tolak.status).toBe(409);
            expect(tolak.json.error?.code).toBe("RESERVATION_CONFLICT");
            expect((await reservasi([d.id]))[0]?.status).toBe("MENUNGGU_PERSETUJUAN");

            await dispatcher(lewat).drain();
            expect((await reservasi([d.id]))[0]?.status).toBe("KEDALUWARSA");
            expect(await instance(d.approval.instance_id)).toEqual([{ status: "DIBATALKAN", referensi_id: d.id, langkah_aktif: null }]);
            expect(await kueri(`SELECT aksi FROM activity_logs WHERE entitas = 'reservations' AND entitas_id = '${d.id}' AND aksi = 'RESERVATION_EXPIRED'`)).toHaveLength(1);
            const nt46 = await notif("NT-46", [pengguna.guru2.id, pengguna.approver.id]);
            expect(nt46.filter((n) => n.isi.includes(d.nomor)).map((n) => Number(n.user_id)).sort((a, b) => a - b)).toEqual([pengguna.guru2.id, pengguna.approver.id].sort((a, b) => a - b));
            expect(nt46.find((n) => n.isi.includes(d.nomor))?.isi).toBe(`Pengajuan ${d.nomor} kedaluwarsa karena belum diputuskan hingga batas waktu.`);
        });
    });
});
