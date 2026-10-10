// Acceptance PR-03-11 (FR-07.3, BR-024a, BR-025; keputusan 15 log phase-03):
// `POST /reservations/{id}/cancel` lewat `createApp()` terhadap PostgreSQL nyata — slot dilepas
// seketika, instance approval yang berjalan ditutup, NT-08 lewat konsumen outbox, pembatalan per
// tanggal turunan, dan balapan pembatalan × persetujuan.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ReservationCancelled, RoomReservationCreated } from "@sigm4/schemas";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { penangananReservasiRuangan } from "../../src/modules/m07-reservation-room/services/approval-outcome.js";
import { fcmCheck, pasangKonsumenNotifikasi } from "../../src/modules/m17-notifications/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher } from "../../src/shared/events/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined && process.env["REDIS_URL"] !== undefined;
// Senin 7 Juni 2027 09.00 WIB — di luar jendela tanggal berkas uji reservasi lain.
const SEKARANG = new Date("2027-06-07T02:00:00Z");
const clock = new FixedClock(SEKARANG);
const wib = (tgl: string, jam: string) => `${tgl}T${jam}:00+07:00`;
const unik = (a: string) => `RSC${a}${randomUUID().slice(0, 6)}`;

interface Peran {
    readonly id: number;
    readonly role: string;
    readonly perms: readonly string[];
}
type Jawaban<T> = { status: number; json: { success: boolean; data: T; error?: { code: string; message: string; details?: { field: string; message: string }[] } } };

describe.skipIf(!ADA)("PR-03-11 — pembatalan reservasi ruangan (acceptance)", () => {
    let server: Server;
    let url = "";
    let gedung = "";
    let ruang = "";
    let aturanId = "";
    const pengguna: Record<"guru" | "guru2" | "petugas" | "teknisi" | "approver", Peran> = {} as never;

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
                    scopes: new Map<string, Scope>(perms.map((p) => [p, "all"])),
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
                VALUES ('${nama}', '${unik("u")}@uji-m07c.sch.id', 'x', '${unik("N")}', (SELECT id FROM roles WHERE kode = '${role}'), 'AKTIF', false) RETURNING id::text`);
            return { id: Number(u?.id), role, perms };
        };
        const PEMOHON = ["reservation.view", "reservation.create", "reservation.cancel_own"];
        pengguna.guru = await buat("R-05", "Pak Budi Guru", PEMOHON);
        pengguna.guru2 = await buat("R-05", "Bu Ani Guru", PEMOHON);
        pengguna.petugas = await buat("R-02", "Pak Joko Petugas", [...PEMOHON, "reservation.cancel_any"]);
        pengguna.teknisi = await buat("R-04", "Pak Teknisi", ["reservation.view"]);
        pengguna.approver = await buat("R-03", "Bu Wakasek Approver", ["approval.decide"]);

        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung Uji M07C', '${unik("G")}') RETURNING id::text`);
        gedung = g?.id ?? "";
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedung}, 'Lt 1', '${unik("A")}') RETURNING id::text`);
        ruang = (await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, dapat_direservasi, boleh_direservasi_siswa, status)
            VALUES (${a?.id ?? ""}, 'Aula Uji Batal', '${unik("R")}', 'AULA', 100, true, false, 'AKTIF') RETURNING id::text`))[0]?.id ?? "";
        const [r] = await kueri<{ id: string }>(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas, terminal_on_exhausted_escalation)
            VALUES ('RESERVASI_RUANGAN', '{"field":"room_id","op":"in","value":[${ruang}]}', 95, 'hold_and_alert') RETURNING id::text`);
        aturanId = r?.id ?? "";
        await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_user_id, sla_jam, on_sla_breach) VALUES (${aturanId}, 1, 'user', ${String(pengguna.approver.id)}, 8, 'remind')`);
    });

    afterAll(async () => {
        await new Promise<void>((r) => server.close(() => r()));
        const ids = Object.values(pengguna).map((p) => p.id).join(",");
        await kueri(`DELETE FROM notifications WHERE user_id IN (${ids})`);
        // Notifikasi peran (NT-06/NT-47 ke SELURUH Petugas/Admin) dapat menyasar pengguna berkas lain: dihapus menurut rujukannya.
        await kueri(`DELETE FROM notifications WHERE referensi_jenis = 'approval_instance' AND referensi_id IN (SELECT id FROM approval_instances WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM notifications WHERE referensi_jenis = 'reservation' AND referensi_id IN (SELECT id FROM reservations WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM approval_steps WHERE instance_id IN (SELECT id FROM approval_instances WHERE pemohon_id IN (${ids}))`);
        await kueri(`DELETE FROM approval_instances WHERE pemohon_id IN (${ids})`);
        await kueri(`DELETE FROM approval_rule_steps WHERE rule_id = ${aturanId}`);
        await kueri(`DELETE FROM approval_rules WHERE id = ${aturanId}`);
        await kueri(`DELETE FROM booking_slots WHERE resource_type = 'room' AND resource_id = ${ruang}`);
        await kueri(`DELETE FROM reservations WHERE room_id = ${ruang} AND parent_id IS NOT NULL`);
        await kueri(`DELETE FROM reservations WHERE room_id = ${ruang}`);
        await kueri(`DELETE FROM rooms WHERE id = ${ruang}`);
        await kueri(`DELETE FROM areas WHERE building_id = ${gedung}`);
        await kueri(`DELETE FROM buildings WHERE id = ${gedung}`);
        await kueri("DELETE FROM event_outbox");
        await kueri(`DELETE FROM users WHERE id IN (${ids})`);
    });

    const kirim = async <T>(path: string, siapa: Peran, body: unknown): Promise<Jawaban<T>> => {
        const res = await fetch(`${url}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-uji-user": String(siapa.id), "x-uji-role": siapa.role, "x-uji-perms": siapa.perms.join(","), "idempotency-key": randomUUID() },
            body: JSON.stringify(body),
        });
        return { status: res.status, json: (await res.json()) as Jawaban<T>["json"] };
    };
    /** Rentang jam per tanggal agar tiap uji memegang slotnya sendiri. */
    const ajukan = (siapa: Peran, tgl: string, mulai: string, selesai: string, o: Record<string, unknown> = {}) =>
        kirim<RoomReservationCreated>("/reservations", siapa, {
            room_id: Number(ruang),
            waktu_mulai: wib(tgl, mulai),
            waktu_selesai: wib(tgl, selesai),
            nama_kegiatan: "Rapat Komite",
            jenis_kegiatan: "Rapat",
            jumlah_peserta: 40,
            ...o,
        });
    const batalkan = (id: string, siapa: Peran, alasan: unknown = "Kegiatan diundur.") => kirim<ReservationCancelled>(`/reservations/${id}/cancel`, siapa, { alasan });
    const putuskan = (instanceId: number, keputusan: "DISETUJUI" | "DITOLAK") =>
        kirim<unknown>(`/approvals/${String(instanceId)}/decide`, pengguna.approver, { urutan: 1, keputusan, catatan: keputusan === "DITOLAK" ? "Ruangan dipakai." : null });
    const status = (ids: readonly string[]) => kueri<{ id: string; status: string }>(`SELECT id::text, status::text FROM reservations WHERE id IN (${ids.join(",")}) ORDER BY id`);
    const slot = (ids: readonly string[]) => kueri<{ reservation_id: string; status: string }>(`SELECT reservation_id::text, status::text FROM booking_slots WHERE reservation_id IN (${ids.join(",")}) ORDER BY reservation_id`);
    const instance = async (id: number) => (await kueri<{ status: string }>(`SELECT status::text FROM approval_instances WHERE id = ${String(id)}`))[0]?.status;
    const pelaku = createSystemAuthContext("uji-m07c");
    const drain = () => {
        const registry = new EventHandlerRegistry();
        pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => pelaku });
        return new OutboxDispatcher({ registry, clock, db: getDb(), logger: new Logger({ clock, tulis: () => undefined }) }).drain();
    };
    const nt08 = (userId: number) => kueri<{ isi: string; deep_link: string | null }>(`SELECT isi, deep_link FROM notifications WHERE kode = 'NT-08' AND user_id = ${String(userId)} ORDER BY id`);

    describe("otorisasi & validasi (m07 §7, BR-025)", () => {
        it("tanpa reservation.cancel_own → 403 di gerbang route; pemohon lain tanpa cancel_any → 403 FORBIDDEN, tak ada yang berubah", async () => {
            const r = (await ajukan(pengguna.guru, "2027-06-08", "08:00", "09:00")).json.data;
            expect((await batalkan(r.id, pengguna.teknisi)).status).toBe(403);
            // Gerbang route sungguh `cancel_own`: pemohonnya sendiri tanpa permission itu tetap ditolak.
            expect((await batalkan(r.id, { ...pengguna.guru, perms: ["reservation.view", "reservation.create"] })).status).toBe(403);
            const lain = await batalkan(r.id, pengguna.guru2);
            expect(lain.status).toBe(403);
            expect(lain.json.error?.code).toBe("FORBIDDEN");
            expect(await status([r.id])).toEqual([{ id: r.id, status: "MENUNGGU_PERSETUJUAN" }]);
            expect(await slot([r.id])).toEqual([{ reservation_id: r.id, status: "TENTATIVE" }]);
        });

        it("alasan kosong → 422 per isian; id bukan bilangan → 400; reservasi tak ada → 404", async () => {
            const r = (await ajukan(pengguna.guru, "2027-06-08", "09:00", "10:00")).json.data;
            const kosong = await batalkan(r.id, pengguna.guru, "   ");
            expect(kosong.status).toBe(422);
            expect(kosong.json.error?.details).toEqual([{ field: "alasan", message: "Alasan pembatalan wajib diisi." }]);
            expect((await batalkan("abc", pengguna.guru)).status).toBe(400);
            expect((await batalkan("999999999", pengguna.guru)).status).toBe(404);
            expect(await status([r.id])).toEqual([{ id: r.id, status: "MENUNGGU_PERSETUJUAN" }]);
        });
    });

    describe("pembatalan tunggal (FR-07.3 langkah 1-3)", () => {
        it("pemohon membatalkan pengajuan menunggu: slot dilepas & langsung dapat dipesan orang lain, instance DIBATALKAN, alasan tercatat; tanpa NT-08", async () => {
            const r = (await ajukan(pengguna.guru, "2027-06-08", "13:00", "14:00")).json.data;
            const b = await batalkan(r.id, pengguna.guru, "Rapat dipindah ke daring.");
            expect(b.status).toBe(200);
            expect(b.json.data).toEqual({ id: r.id, nomor: r.nomor, status: "DIBATALKAN", dibatalkan: [{ id: r.id, nomor: r.nomor }] });
            expect(await status([r.id])).toEqual([{ id: r.id, status: "DIBATALKAN" }]);
            expect(await slot([r.id])).toEqual([{ reservation_id: r.id, status: "RELEASED" }]);
            expect(await instance(r.approval.instance_id)).toBe("DIBATALKAN");
            const [log] = await kueri<{ keterangan: string; user_id: string }>(`SELECT keterangan, user_id::text FROM activity_logs WHERE aksi = 'RESERVATION_CANCELLED' AND entitas_id = '${r.id}'`);
            expect(log).toEqual({ keterangan: "Rapat dipindah ke daring.", user_id: String(pengguna.guru.id) });
            // FR-07.3 AC: slot yang dibatalkan langsung dapat dipesan pengguna lain.
            expect((await ajukan(pengguna.guru2, "2027-06-08", "13:00", "14:00")).status).toBe(201);
            // Instance tertutup: approver tak dapat lagi memutus.
            expect((await putuskan(r.approval.instance_id, "DISETUJUI")).status).toBe(409);
            await drain();
            expect(await nt08(pengguna.guru.id)).toEqual([]);
        });

        it("A2: Petugas membatalkan reservasi DISETUJUI milik Guru → slot CONFIRMED dilepas, pemohon menerima NT-08 setelah commit", async () => {
            const r = (await ajukan(pengguna.guru, "2027-06-09", "08:00", "10:00")).json.data;
            expect((await putuskan(r.approval.instance_id, "DISETUJUI")).status).toBe(200);
            expect(await slot([r.id])).toEqual([{ reservation_id: r.id, status: "CONFIRMED" }]);
            const b = await batalkan(r.id, pengguna.petugas, "Aula dipakai rapat dinas mendadak");
            expect(b.status).toBe(200);
            expect(await status([r.id])).toEqual([{ id: r.id, status: "DIBATALKAN" }]);
            expect(await slot([r.id])).toEqual([{ reservation_id: r.id, status: "RELEASED" }]);
            expect(await instance(r.approval.instance_id)).toBe("DISETUJUI");
            expect((await nt08(pengguna.guru.id)).filter((n) => n.isi.includes(r.nomor))).toEqual([]);
            await drain();
            expect((await nt08(pengguna.guru.id)).filter((n) => n.isi.includes(r.nomor))).toEqual([
                { isi: `Reservasi ${r.nomor} dibatalkan oleh Pak Joko Petugas. Alasan: Aula dipakai rapat dinas mendadak.`, deep_link: `/reservasi/${r.id}` },
            ]);
        });

        it("A1: kegiatan sudah dimulai → 422, slot tetap; status selain Menunggu/Disetujui (sudah dibatalkan, ditolak) → 422", async () => {
            const r = (await ajukan(pengguna.guru, "2027-06-09", "13:00", "15:00")).json.data;
            expect((await putuskan(r.approval.instance_id, "DISETUJUI")).status).toBe(200);
            const maju = new Date(wib("2027-06-09", "13:30")).getTime() - clock.now().getTime();
            clock.advance(maju);
            try {
                const b = await batalkan(r.id, pengguna.guru);
                expect(b.status).toBe(422);
                expect(b.json.error?.message).toBe("Kegiatan sudah dimulai; reservasi tidak dapat dibatalkan. Petugas dapat menandainya Selesai atau Tidak Digunakan.");
                expect(await slot([r.id])).toEqual([{ reservation_id: r.id, status: "CONFIRMED" }]);
            } finally {
                clock.advance(-maju);
            }
            expect((await batalkan(r.id, pengguna.guru)).status).toBe(200);
            const lagi = await batalkan(r.id, pengguna.guru);
            expect(lagi.status).toBe(422);
            expect(lagi.json.error?.message).toBe("Hanya reservasi yang menunggu persetujuan atau sudah disetujui yang dapat dibatalkan.");

            const t = (await ajukan(pengguna.guru, "2027-06-10", "08:00", "09:00")).json.data;
            expect((await putuskan(t.approval.instance_id, "DITOLAK")).status).toBe(200);
            expect((await batalkan(t.id, pengguna.guru)).status).toBe(422);
        });
    });

    describe("reservasi berulang (BR-024a, keputusan 15c)", () => {
        const pola = (sampai: string) => ({ pengulangan: { hari: [5], sampai } });

        it("membatalkan satu tanggal turunan tidak menyentuh induk maupun tanggal lain; persetujuan sesudahnya berlaku bagi sisanya saja", async () => {
            const r = (await ajukan(pengguna.guru, "2027-06-11", "08:00", "10:00", pola("2027-06-25"))).json.data;
            const [t1, t2, t3] = r.tanggal.map((t) => t.id) as [string, string, string];
            const b = await batalkan(t2, pengguna.guru, "Tanggal ini bentrok ujian.");
            expect(b.status).toBe(200);
            expect(b.json.data).toEqual({ id: t2, nomor: `${r.nomor}.02`, status: "DIBATALKAN", dibatalkan: [{ id: t2, nomor: `${r.nomor}.02` }] });
            expect(await status([r.id, t1, t2, t3])).toEqual([
                { id: r.id, status: "MENUNGGU_PERSETUJUAN" },
                { id: t1, status: "MENUNGGU_PERSETUJUAN" },
                { id: t2, status: "DIBATALKAN" },
                { id: t3, status: "MENUNGGU_PERSETUJUAN" },
            ]);
            expect(await instance(r.approval.instance_id)).toBe("MENUNGGU");
            expect((await putuskan(r.approval.instance_id, "DISETUJUI")).status).toBe(200);
            expect(await slot([t1, t2, t3])).toEqual([
                { reservation_id: t1, status: "CONFIRMED" },
                { reservation_id: t2, status: "RELEASED" },
                { reservation_id: t3, status: "CONFIRMED" },
            ]);
            expect((await status([t2]))[0]?.status).toBe("DIBATALKAN");

            // Induk = seluruh tanggal yang tersisa; induk ikut DIBATALKAN.
            const semua = await batalkan(r.id, pengguna.guru, "Program dihentikan.");
            expect(semua.json.data).toEqual({ id: r.id, nomor: r.nomor, status: "DIBATALKAN", dibatalkan: [r.id, t1, t3].map((id) => ({ id, nomor: id === r.id ? r.nomor : `${r.nomor}.0${id === t1 ? "1" : "3"}` })) });
            expect(await slot([t1, t3])).toEqual([
                { reservation_id: t1, status: "RELEASED" },
                { reservation_id: t3, status: "RELEASED" },
            ]);
        });

        it("tanggal yang sudah dimulai tidak ikut saat induk dibatalkan; induk tetap berjalan selama ada tanggal hidup", async () => {
            const r = (await ajukan(pengguna.guru, "2027-06-11", "13:00", "14:00", pola("2027-06-25"))).json.data;
            const [t1, t2, t3] = r.tanggal.map((t) => t.id) as [string, string, string];
            expect((await putuskan(r.approval.instance_id, "DISETUJUI")).status).toBe(200);
            const maju = new Date(wib("2027-06-11", "13:30")).getTime() - clock.now().getTime();
            clock.advance(maju);
            try {
                const b = await batalkan(r.id, pengguna.petugas, "Ekstrakurikuler pindah ruangan.");
                expect(b.status).toBe(200);
                expect(b.json.data.status).toBe("DISETUJUI");
                expect(b.json.data.dibatalkan.map((d) => d.id)).toEqual([t2, t3]);
                expect(await status([r.id, t1])).toEqual([
                    { id: r.id, status: "DISETUJUI" },
                    { id: t1, status: "DISETUJUI" },
                ]);
                expect(await slot([t1])).toEqual([{ reservation_id: t1, status: "CONFIRMED" }]);
                const lagi = await batalkan(r.id, pengguna.petugas, "Lagi.");
                expect(lagi.status).toBe(422);
                expect(lagi.json.error?.message).toBe("Tidak ada tanggal reservasi ini yang masih dapat dibatalkan.");
            } finally {
                clock.advance(-maju);
            }
        });

        it("tanggal terakhir yang dibatalkan satu per satu menutup induk dan instance approval yang masih berjalan", async () => {
            const r = (await ajukan(pengguna.guru, "2027-06-11", "15:00", "16:00", pola("2027-06-18"))).json.data;
            const [t1, t2] = r.tanggal.map((t) => t.id) as [string, string];
            expect((await batalkan(t1, pengguna.guru)).json.data.dibatalkan).toEqual([{ id: t1, nomor: `${r.nomor}.01` }]);
            expect(await instance(r.approval.instance_id)).toBe("MENUNGGU");
            const akhir = await batalkan(t2, pengguna.guru);
            expect(akhir.json.data.dibatalkan.map((d) => d.id)).toEqual([r.id, t2]);
            expect((await status([r.id]))[0]?.status).toBe("DIBATALKAN");
            expect(await instance(r.approval.instance_id)).toBe("DIBATALKAN");
        });
    });

    describe("konkurensi (keputusan 14j: kunci objek LALU instance)", () => {
        it("pembatalan × persetujuan serentak (×5): tanpa 500/deadlock; akhirnya selalu DIBATALKAN dengan slot RELEASED", async () => {
            for (let i = 0; i < 5; i++) {
                const r = (await ajukan(pengguna.guru, "2027-06-14", `${String(8 + i).padStart(2, "0")}:00`, `${String(8 + i).padStart(2, "0")}:30`)).json.data;
                const [b, p] = await Promise.all([batalkan(r.id, pengguna.guru), putuskan(r.approval.instance_id, "DISETUJUI")]);
                expect(b.status).toBe(200);
                expect([200, 409]).toContain(p.status);
                expect(await status([r.id])).toEqual([{ id: r.id, status: "DIBATALKAN" }]);
                expect(await slot([r.id])).toEqual([{ reservation_id: r.id, status: "RELEASED" }]);
                expect(await instance(r.approval.instance_id)).toBe(p.status === 200 ? "DISETUJUI" : "DIBATALKAN");
            }
        });

        it("penolakan yang menunggu kunci lalu mendapati pengajuan sudah dibatalkan kalah (409), tidak menimpa status", async () => {
            const r = (await ajukan(pengguna.guru, "2027-06-14", "14:00", "15:00")).json.data;
            expect((await batalkan(r.id, pengguna.guru)).status).toBe(200);
            const penangan = penangananReservasiRuangan(clock, new AuditLogger({ clock }));
            await expect(withTransaction(pelaku, (scope) => penangan.setelahDitutup(scope, Number(r.id), "DITOLAK"), getDb())).rejects.toMatchObject({ kode: "APPROVAL_ALREADY_DECIDED" });
            expect((await status([r.id]))[0]?.status).toBe("DIBATALKAN");
        });
    });
});
