// Acceptance PR-03-12 (FR-07.4; keputusan 16 log phase-03): transisi otomatis lewat JALUR WORKER
// (`slot-activation`) dan `POST /reservations/{id}/usage` lewat `createApp()` terhadap PostgreSQL nyata.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ReservationUsage, RoomReservationCreated } from "@sigm4/schemas";
import express from "express";
import { sql } from "kysely";
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

const ADA = process.env["DATABASE_URL"] !== undefined && process.env["REDIS_URL"] !== undefined;
// Senin 5 Juli 2027 09.00 WIB — di luar jendela tanggal berkas uji reservasi lain.
const SEKARANG = new Date("2027-07-05T02:00:00Z");
const clock = new FixedClock(SEKARANG);
const wib = (tgl: string, jam: string) => `${tgl}T${jam}:00+07:00`;
const unik = (a: string) => `RSU${a}${randomUUID().slice(0, 6)}`;

interface Peran {
    readonly id: number;
    readonly role: string;
    readonly perms: readonly string[];
}
type Jawaban<T> = { status: number; json: { success: boolean; data: T; error?: { code: string; message: string; details?: { field: string; message: string }[] } } };

describe.skipIf(!ADA)("PR-03-12 — penggunaan & penyelesaian reservasi ruangan (acceptance)", () => {
    let server: Server;
    let url = "";
    let gedung = "";
    let ruang = "";
    let aturanId = "";
    const pengguna: Record<"guru" | "petugas" | "approver", Peran> = {} as never;

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
            setAuthContext(res, createAuthContext({ userId: Number(req.header("x-uji-user")), roleCode: req.header("x-uji-role") ?? "R-05", scopes: new Map<string, Scope>(perms.map((p) => [p, "all"])) }));
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
                VALUES ('${nama}', '${unik("u")}@uji-m07u.sch.id', 'x', '${unik("N")}', (SELECT id FROM roles WHERE kode = '${role}'), 'AKTIF', false) RETURNING id::text`);
            return { id: Number(u?.id), role, perms };
        };
        pengguna.guru = await buat("R-05", "Pak Budi Guru", ["reservation.view", "reservation.create", "reservation.cancel_own"]);
        pengguna.petugas = await buat("R-02", "Pak Joko Petugas", ["reservation.view", "reservation.create", "reservation.urgent", "reservation.record_usage"]);
        pengguna.approver = await buat("R-03", "Bu Wakasek Approver", ["approval.decide"]);

        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('Gedung Uji M07U', '${unik("G")}') RETURNING id::text`);
        gedung = g?.id ?? "";
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${gedung}, 'Lt 1', '${unik("A")}') RETURNING id::text`);
        ruang = (await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, dapat_direservasi, boleh_direservasi_siswa, status)
            VALUES (${a?.id ?? ""}, 'Aula Uji Pakai', '${unik("R")}', 'AULA', 100, true, false, 'AKTIF') RETURNING id::text`))[0]?.id ?? "";
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
    const ajukan = (siapa: Peran, tgl: string, mulai: string, selesai: string, o: Record<string, unknown> = {}) =>
        kirim<RoomReservationCreated>("/reservations", siapa, { room_id: Number(ruang), waktu_mulai: wib(tgl, mulai), waktu_selesai: wib(tgl, selesai), nama_kegiatan: "Rapat Komite", jenis_kegiatan: "Rapat", jumlah_peserta: 40, ...o });
    /** Diajukan Guru lalu disetujui — slot CONFIRMED. */
    const disetujui = async (tgl: string, mulai: string, selesai: string, o: Record<string, unknown> = {}) => {
        const r = await ajukan(pengguna.guru, tgl, mulai, selesai, o);
        expect(r.status).toBe(201);
        expect((await kirim(`/approvals/${String(r.json.data.approval.instance_id)}/decide`, pengguna.approver, { urutan: 1, keputusan: "DISETUJUI", catatan: null })).status).toBe(200);
        return r.json.data;
    };
    const catat = (id: string, hasil: unknown, catatan: unknown = null, siapa = pengguna.petugas) => kirim<ReservationUsage>(`/reservations/${id}/usage`, siapa, { hasil, catatan });
    const status = async (id: string) => (await kueri<{ status: string }>(`SELECT status::text FROM reservations WHERE id = ${id}`))[0]?.status;
    const slot = async (id: string) => (await kueri<{ status: string }>(`SELECT status::text FROM booking_slots WHERE reservation_id = ${id}`))[0]?.status;
    const log = (id: string) => kueri<{ aksi: string; keterangan: string | null }>(`SELECT aksi, keterangan FROM activity_logs WHERE entitas = 'reservations' AND entitas_id = '${id}' AND aksi = 'RESERVATION_UPDATED' ORDER BY id`);
    /** Jam disetel ke `iso`, fungsi dijalankan, jam dikembalikan — uji lain tetap pada SEKARANG. */
    const pada = async <T>(iso: string, f: () => Promise<T>): Promise<T> => {
        const geser = new Date(iso).getTime() - clock.now().getTime();
        clock.advance(geser);
        try {
            return await f();
        } finally {
            clock.advance(-geser);
        }
    };
    const job = () => jalankanAktivasiSlot(getDb(), clock);

    describe("transisi otomatis lewat job slot-activation (FR-07.4 langkah 1-2)", () => {
        it("waktu mulai → Berlangsung + slot ACTIVE; waktu selesai → Selesai, slot tetap ACTIVE; putaran ulang tak mengubah apa pun", async () => {
            const r = await disetujui("2027-07-06", "08:00", "10:00");
            await pada(wib("2027-07-06", "07:59"), job);
            expect(await status(r.id)).toBe("DISETUJUI");
            await pada(wib("2027-07-06", "08:00"), job);
            expect([await status(r.id), await slot(r.id)]).toEqual(["BERLANGSUNG", "ACTIVE"]);
            await pada(wib("2027-07-06", "10:00"), job);
            expect([await status(r.id), await slot(r.id)]).toEqual(["SELESAI", "ACTIVE"]);
            await pada(wib("2027-07-06", "10:05"), job);
            expect((await log(r.id)).filter((l) => l.keterangan?.startsWith("Waktu")).map((l) => l.keterangan)).toEqual([
                "Waktu mulai tiba (FR-07.4 langkah 1) (pekerjaan terjadwal: slot-activation)",
                "Waktu selesai tiba (FR-07.4 langkah 2) (pekerjaan terjadwal: slot-activation)",
            ]);
            const [pelaku] = await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM activity_logs WHERE entitas_id = '${r.id}' AND aksi = 'RESERVATION_UPDATED' AND user_id IS NULL AND keterangan LIKE 'Waktu%'`);
            expect(pelaku?.n).toBe("2"); // pelaku SYSTEM (AL-06)
        });

        it("mulai dan selesai di antara dua putaran → Selesai dalam satu putaran; pengajuan yang masih menunggu tidak disentuh", async () => {
            const r = await disetujui("2027-07-07", "08:00", "09:00");
            const tunggu = (await ajukan(pengguna.guru, "2027-07-07", "10:00", "11:00")).json.data;
            await pada(wib("2027-07-07", "12:00"), job);
            expect(await status(r.id)).toBe("SELESAI");
            expect(await status(tunggu.id)).toBe("MENUNGGU_PERSETUJUAN");
        });

        it("job tidak menunggu baris yang dikunci transaksi lain (SKIP LOCKED); putaran berikut menyusul", async () => {
            const r = await disetujui("2027-07-08", "08:00", "09:00");
            await getDb()
                .transaction()
                .execute(async (trx) => {
                    await sql`SELECT id FROM reservations WHERE id = ${Number(r.id)} FOR UPDATE`.execute(trx);
                    await pada(wib("2027-07-08", "08:30"), job);
                });
            expect(await status(r.id)).toBe("DISETUJUI");
            await pada(wib("2027-07-08", "08:30"), job);
            expect(await status(r.id)).toBe("BERLANGSUNG");
        });

        it("berulang: tiap tanggal berjalan sendiri; induk Selesai begitu tak ada tanggal yang hidup (keputusan 16c)", async () => {
            const r = await disetujui("2027-07-09", "13:00", "14:00", { pengulangan: { hari: [5], sampai: "2027-07-16" } });
            const [t1, t2] = r.tanggal.map((t) => t.id) as [string, string];
            await pada(wib("2027-07-09", "14:00"), job);
            expect([await status(r.id), await status(t1), await status(t2)]).toEqual(["DISETUJUI", "SELESAI", "DISETUJUI"]);
            await pada(wib("2027-07-16", "14:00"), job);
            expect([await status(r.id), await status(t1), await status(t2)]).toEqual(["SELESAI", "SELESAI", "SELESAI"]);
            expect((await log(r.id)).map((l) => l.keterangan)).toContain("Seluruh tanggal reservasi berulang telah berakhir (BR-024a) (pekerjaan terjadwal: slot-activation)");
        });
    });

    describe("POST /reservations/{id}/usage (FR-07.4 langkah 3, A1)", () => {
        it("tanpa reservation.record_usage → 403; hasil tak sah → 422 per isian", async () => {
            const r = await disetujui("2027-07-12", "08:00", "09:00");
            await pada(wib("2027-07-12", "09:00"), job);
            expect((await catat(r.id, "BAIK", null, pengguna.guru)).status).toBe(403);
            const salah = await catat(r.id, "RUSAK");
            expect(salah.status).toBe(422);
            expect(salah.json.error?.details?.map((d) => d.field)).toEqual(["hasil"]);
            expect((await catat("999999999", "BAIK")).status).toBe(404);
        });

        it("Selesai → kondisi Baik/Perlu Perhatian + catatan tercatat sekali; pencatatan kedua ditolak", async () => {
            const r = await disetujui("2027-07-12", "10:00", "11:00");
            await pada(wib("2027-07-12", "11:00"), job);
            const c = await catat(r.id, "PERLU_PERHATIAN", "Dua kursi patah.");
            expect(c.status).toBe(200);
            expect(c.json.data).toEqual({ id: r.id, nomor: r.nomor, status: "SELESAI", kondisi_ruangan: "PERLU_PERHATIAN", catatan: "Dua kursi patah." });
            const [baris] = await kueri<{ kondisi_ruangan: string; catatan_penggunaan: string; penggunaan_dicatat_oleh: string }>(
                `SELECT kondisi_ruangan::text, catatan_penggunaan, penggunaan_dicatat_oleh::text FROM reservations WHERE id = ${r.id}`,
            );
            expect(baris).toEqual({ kondisi_ruangan: "PERLU_PERHATIAN", catatan_penggunaan: "Dua kursi patah.", penggunaan_dicatat_oleh: String(pengguna.petugas.id) });
            expect((await log(r.id)).at(-1)?.keterangan).toBe("Dua kursi patah.");
            const lagi = await catat(r.id, "BAIK");
            expect(lagi.status).toBe(422);
            expect(lagi.json.error?.message).toBe("Penggunaan reservasi ini sudah dicatat.");
        });

        it("kondisi sebelum Selesai ditolak; Tidak Digunakan sebelum Berlangsung ditolak", async () => {
            const r = await disetujui("2027-07-12", "13:00", "15:00");
            expect((await catat(r.id, "TIDAK_DIGUNAKAN")).json.error?.message).toBe("Hanya reservasi yang sedang berlangsung atau sudah selesai yang dapat ditandai Tidak Digunakan.");
            await pada(wib("2027-07-12", "13:30"), job);
            const dini = await catat(r.id, "BAIK");
            expect(dini.status).toBe(422);
            expect(dini.json.error?.message).toBe("Kondisi ruangan dicatat setelah kegiatan selesai.");
        });

        it("A1: Tidak Digunakan saat Berlangsung → status Tidak Digunakan, slot dilepas, sisa waktunya langsung dapat dipesan", async () => {
            const r = await disetujui("2027-07-13", "08:00", "12:00");
            await pada(wib("2027-07-13", "08:30"), async () => {
                await job();
                const c = await catat(r.id, "TIDAK_DIGUNAKAN", "Pemohon tidak hadir.");
                expect(c.json.data).toEqual({ id: r.id, nomor: r.nomor, status: "TIDAK_DIGUNAKAN", kondisi_ruangan: null, catatan: "Pemohon tidak hadir." });
                expect(await slot(r.id)).toBe("RELEASED");
                // reservation.urgent (BR-020) memesan sisa waktu hari yang sama.
                expect((await ajukan(pengguna.petugas, "2027-07-13", "10:00", "12:00")).status).toBe(201);
                // Job berikutnya tak mengubahnya menjadi Selesai.
                await job();
            });
            await pada(wib("2027-07-13", "12:30"), job);
            expect(await status(r.id)).toBe("TIDAK_DIGUNAKAN");
        });

        it("Tidak Digunakan setelah Selesai juga sah; induk berulang dicatat per tanggal", async () => {
            const r = await disetujui("2027-07-14", "08:00", "09:00");
            await pada(wib("2027-07-14", "09:00"), job);
            expect((await catat(r.id, "TIDAK_DIGUNAKAN")).json.data.status).toBe("TIDAK_DIGUNAKAN");
            expect([await status(r.id), await slot(r.id)]).toEqual(["TIDAK_DIGUNAKAN", "RELEASED"]);

            const b = await disetujui("2027-07-14", "13:00", "14:00", { pengulangan: { hari: [3], sampai: "2027-07-21" } });
            const induk = await catat(b.id, "TIDAK_DIGUNAKAN");
            expect(induk.status).toBe(422);
            expect(induk.json.error?.message).toBe("Penggunaan reservasi berulang dicatat per tanggal.");
        });
    });
});
