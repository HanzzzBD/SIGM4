// Acceptance PR-02-22 — "SLA, pengingat, eskalasi (job terjadwal)" (FR-10.2 A2/A2a,
// BR-039a, Lampiran D.5, SDD-02 §4.5, SDD-APR-06/07/15; keputusan 70 & 73) terhadap
// PostgreSQL NYATA: "Perhitungan memakai jam operasional terkonfigurasi (CAL-01);
// tenggat di luar jam itu tidak bertambah". Job dijalankan lewat jalur worker sungguhan
// (`jalankanPemeriksaanSla`, pelaku SYSTEM) dengan jam tetap (TD-04).

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApprovalService, DecisionService, SlaTracker } from "../../src/modules/m10-approval/index.js";
import type { PenanganHasil } from "../../src/modules/m10-approval/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { DomainError } from "../../src/shared/errors/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { registry } from "../../src/worker/index.js";
import { CRON_SLA, PEKERJAAN_SLA, jalankanPemeriksaanSla } from "../../src/worker/approval-sla-check.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
/** Senin 28 September 2026, 09.00 WIB — di dalam jam operasional (06.00–18.00). */
const DIBUAT = new Date("2026-09-28T02:00:00Z");
/** SLA 8 jam kerja dari 09.00 WIB → Senin 17.00 WIB. */
const TENGGAT_1 = new Date("2026-09-28T10:00:00Z");
const pada = (iso: string) => new FixedClock(new Date(iso));
const SEBELUM = pada("2026-09-28T09:59:00Z"); // Senin 16.59 WIB
const LEWAT = pada("2026-09-28T11:00:00Z"); // Senin 18.00 WIB — gedung tutup
const MALAM = pada("2026-09-28T13:00:00Z"); // Senin 20.00 WIB — hari WIB yang sama
const BESOK = pada("2026-09-29T00:00:00Z"); // Selasa 07.00 WIB
/**
 * Eskalasi pada Senin 18.00 WIB: 8 jam kerja TIDAK dihitung dari malam hari (CAL-01) —
 * mulai Selasa 06.00 → Selasa 14.00 WIB. Tenggat kalender polos akan jatuh Selasa 02.00.
 */
const TENGGAT_ESKALASI = new Date("2026-09-29T07:00:00Z");
const SESUDAH_ESKALASI = pada("2026-09-29T08:00:00Z"); // Selasa 15.00 WIB

const penggunaUji: number[] = [];

async function pengguna(kodeRole: string, status: "AKTIF" | "NONAKTIF" = "AKTIF"): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Uji SLA', 'sla-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPSLA${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), '${status}', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

interface LangkahUji {
    readonly user: number;
    readonly breach?: "remind" | "escalate";
    readonly eskalasiKe?: number;
}

async function aturan(langkah: readonly LangkahUji[], terminal: "hold_and_alert" | "auto_reject" = "hold_and_alert"): Promise<void> {
    const [r] = await kueri<{ id: string }>(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas, terminal_on_exhausted_escalation)
                                             VALUES ('PENGADAAN_BARANG', '{}', 50, '${terminal}') RETURNING id::text`);
    for (const [i, l] of langkah.entries()) {
        await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_user_id, sla_jam, on_sla_breach, eskalasi_ke)
                     VALUES (${String(r?.id)}, ${String(i + 1)}, 'user', ${String(l.user)}, 8, '${l.breach ?? "remind"}', ${String(l.eskalasiKe ?? "NULL")})`);
    }
}

let ref = 0;
async function ajukan(pemohonId: number): Promise<number> {
    ref += 1;
    const clock = new FixedClock(DIBUAT);
    const approval = new ApprovalService(getDb(), new AuditLogger({ clock }), clock);
    const ctx = createAuthContext({ userId: pemohonId, roleCode: "UJI", scopes: new Map() });
    return (await withTransaction(ctx, (s) => approval.createInstance(s, { jenis: "PENGADAAN_BARANG", referensiId: 900_000 + ref, pemohonId, fakta: {} }), getDb()))
        .instanceId;
}

const langkahDb = (id: number) =>
    kueri<{
        urutan: number;
        keputusan: string | null;
        alasan_dilewati: string | null;
        approver_user_id: string | null;
        sla_deadline: Date | null;
        dieskalasi_pada: Date | null;
        eskalasi_dari_user_id: string | null;
        pengingat_terakhir_pada: Date | null;
        alarm_terminal_pada: Date | null;
    }>(`SELECT urutan, keputusan, alasan_dilewati, approver_user_id::text, sla_deadline, dieskalasi_pada, eskalasi_dari_user_id::text,
               pengingat_terakhir_pada, alarm_terminal_pada FROM approval_steps WHERE instance_id = ${String(id)} ORDER BY urutan`);
const instansi = async (id: number) =>
    (await kueri<{ status: string; langkah_aktif: number | null }>(`SELECT status::text, langkah_aktif FROM approval_instances WHERE id = ${String(id)}`))[0];
const eventSla = (id: number) =>
    kueri<{ event_name: string; payload: Record<string, unknown>; actor_id: string | null }>(
        `SELECT event_name, payload, actor_id FROM event_outbox WHERE aggregate_type = 'approval_instance' AND aggregate_id = '${String(id)}'
            AND event_name IN ('ApprovalSlaBreached', 'ApprovalDecided') ORDER BY id`,
    );
const log = (aksi: string) =>
    kueri<{ user_id: string | null; role: string | null; keterangan: string | null; nilai_sesudah: Record<string, unknown> }>(
        `SELECT user_id::text, role, keterangan, nilai_sesudah FROM activity_logs WHERE aksi = '${aksi}' AND modul IN ('m10-approval', 'm18-activity-log') ORDER BY id`,
    );

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM approval_steps");
    await kueri("DELETE FROM approval_instances");
    await kueri("DELETE FROM approval_rule_steps");
    await kueri("DELETE FROM approval_rules");
    await kueri("DELETE FROM event_outbox WHERE aggregate_type = 'approval_instance'");
    await kueri("DELETE FROM activity_logs WHERE modul = 'm10-approval' OR aksi = 'SCHEDULED_JOB_EXECUTED'");
    if (penggunaUji.length > 0) await kueri(`DELETE FROM users WHERE id IN (${penggunaUji.splice(0).join(",")})`);
}

describe.skipIf(!ADA_DB)("PR-02-22 — SLA, pengingat, eskalasi (acceptance)", () => {
    let pemohon: number;
    let approver: number;

    beforeAll(() => {
        dbmate("up");
    });
    beforeEach(async () => {
        await bersihkan();
        await kueri(`DELETE FROM holidays WHERE tanggal BETWEEN '2026-09-28' AND '2026-10-03'`);
        pemohon = await pengguna("R-06");
        approver = await pengguna("R-02");
    });
    afterAll(bersihkan);

    it("terdaftar di worker tiap 30 menit", () => {
        expect(registry.get(PEKERJAAN_SLA)?.cron).toBe(CRON_SLA);
        expect(CRON_SLA).toBe("*/30 * * * *");
    });

    describe("remind (keputusan 70)", () => {
        it("sebelum tenggat tidak terjadi apa-apa; tenggat = 8 jam KERJA sejak aktif (SDD-APR-07)", async () => {
            await aturan([{ user: approver }]);
            const id = await ajukan(pemohon);
            await jalankanPemeriksaanSla(getDb(), SEBELUM);
            const [l] = await langkahDb(id);
            expect(l?.sla_deadline).toEqual(TENGGAT_1);
            expect(l?.pengingat_terakhir_pada).toBeNull();
            expect(await eventSla(id)).toEqual([]);
        });

        it("NT-06 maks 1×/hari WIB per langkah, tercatat APPROVAL_SLA_REMINDED pelaku SYSTEM", async () => {
            await aturan([{ user: approver }]);
            const id = await ajukan(pemohon);
            await jalankanPemeriksaanSla(getDb(), LEWAT);
            await jalankanPemeriksaanSla(getDb(), MALAM);
            expect(await eventSla(id)).toEqual([{ event_name: "ApprovalSlaBreached", payload: { instance_id: id, urutan: 1, tindakan: "REMIND" }, actor_id: null }]);
            await jalankanPemeriksaanSla(getDb(), BESOK);
            expect((await eventSla(id)).map((e) => e.payload["tindakan"])).toEqual(["REMIND", "REMIND"]);

            const [pertama] = await log("APPROVAL_SLA_REMINDED");
            expect(pertama).toMatchObject({ user_id: null, role: "SYSTEM" });
            expect(pertama?.keterangan).toContain(PEKERJAAN_SLA);
            expect(await log("APPROVAL_SLA_REMINDED")).toHaveLength(2);
        });

        it("TIDAK pernah terminal — auto_reject tak menolak pengajuan karena langkah remind telat", async () => {
            await aturan([{ user: approver }], "auto_reject");
            const id = await ajukan(pemohon);
            for (const c of [LEWAT, BESOK, SESUDAH_ESKALASI]) await jalankanPemeriksaanSla(getDb(), c);
            expect(await instansi(id)).toEqual({ status: "MENUNGGU", langkah_aktif: 1 });
            expect((await langkahDb(id))[0]?.alarm_terminal_pada).toBeNull();
        });
    });

    describe("escalate + hold_and_alert", () => {
        it("pelanggaran pertama → dialihkan ke eskalasi_ke; tenggat baru dihitung jam kerja, tidak bertambah di luar jam (CAL-01)", async () => {
            const kepala = await pengguna("R-03");
            await aturan([{ user: approver, breach: "escalate", eskalasiKe: kepala }]);
            const id = await ajukan(pemohon);

            await jalankanPemeriksaanSla(getDb(), LEWAT);

            const [l] = await langkahDb(id);
            expect(l).toMatchObject({
                keputusan: null,
                approver_user_id: String(kepala),
                eskalasi_dari_user_id: String(approver),
                dieskalasi_pada: LEWAT.now(),
                sla_deadline: TENGGAT_ESKALASI,
                alarm_terminal_pada: null,
            });
            expect(await eventSla(id)).toEqual([
                { event_name: "ApprovalSlaBreached", payload: { instance_id: id, urutan: 1, tindakan: "ESCALATE", eskalasi_ke: kepala }, actor_id: null },
            ]);
            const [esk] = await log("APPROVAL_ESCALATED");
            expect(esk).toMatchObject({ user_id: null, role: "SYSTEM" });
            expect(esk?.nilai_sesudah).toMatchObject({ instance_id: id, eskalasi_ke: kepala });
        });

        it("pelanggaran sesudah eskalasi = eskalasi habis → tetap Menunggu + NT-47 SEKALI, tak pernah disetujui (BR-039a)", async () => {
            const kepala = await pengguna("R-03");
            await aturan([{ user: approver, breach: "escalate", eskalasiKe: kepala }]);
            const id = await ajukan(pemohon);
            await jalankanPemeriksaanSla(getDb(), LEWAT);
            await jalankanPemeriksaanSla(getDb(), SESUDAH_ESKALASI);
            await jalankanPemeriksaanSla(getDb(), pada("2026-09-30T03:00:00Z"));

            expect(await instansi(id)).toEqual({ status: "MENUNGGU", langkah_aktif: 1 });
            expect((await langkahDb(id))[0]?.alarm_terminal_pada).toEqual(SESUDAH_ESKALASI.now());
            expect((await eventSla(id)).map((e) => e.payload["tindakan"])).toEqual(["ESCALATE", "EXHAUSTED"]);
            expect(await log("APPROVAL_ESCALATION_EXHAUSTED")).toHaveLength(1);
        });

        it.each([
            ["nonaktif", async () => pengguna("R-03", "NONAKTIF")],
            ["pemohon sendiri (BR-039)", async () => Promise.resolve(-1)],
        ])("target eskalasi %s → langsung eskalasi habis, tidak dialihkan (keputusan 73)", async (_, target) => {
            let kepala = await target();
            if (kepala === -1) kepala = pemohon;
            await aturan([{ user: approver, breach: "escalate", eskalasiKe: kepala }]);
            const id = await ajukan(pemohon);
            await jalankanPemeriksaanSla(getDb(), LEWAT);

            const [l] = await langkahDb(id);
            expect(l).toMatchObject({ approver_user_id: String(approver), dieskalasi_pada: null, alarm_terminal_pada: LEWAT.now() });
            expect((await eventSla(id)).map((e) => e.payload["tindakan"])).toEqual(["EXHAUSTED"]);
        });
    });

    it("escalate + auto_reject: eskalasi habis → Ditolak oleh SYSTEM, objek dilepas penangan, NT-03 lewat ApprovalDecided", async () => {
        const kepala = await pengguna("R-03");
        await aturan([{ user: approver, breach: "escalate", eskalasiKe: kepala }], "auto_reject");
        const id = await ajukan(pemohon);
        const dilepas: string[] = [];
        const penangan: PenanganHasil = {
            jenis: "PENGADAAN_BARANG",
            sebelumDisetujui: () => Promise.reject(new Error("tidak boleh disetujui")),
            setelahDitutup: (_s, referensiId, status) => {
                dilepas.push(`${String(referensiId)}:${status}`);
                return Promise.resolve();
            },
        };
        const tracker = (c: FixedClock) => {
            const audit = new AuditLogger({ clock: c });
            const approval = new ApprovalService(getDb(), audit, c);
            return new SlaTracker(getDb(), audit, c, approval, new DecisionService(getDb(), audit, c, approval, [penangan]), new Logger({ clock: c, tulis: () => undefined }));
        };
        const ctx = createSystemAuthContext(PEKERJAAN_SLA);
        await tracker(LEWAT).periksa(ctx);
        const hasil = await tracker(SESUDAH_ESKALASI).periksa(ctx);

        expect(hasil).toMatchObject({ diperiksa: 1, ditolak: 1, galat: 0 });
        expect(await instansi(id)).toEqual({ status: "DITOLAK", langkah_aktif: null });
        expect((await langkahDb(id))[0]?.keputusan).toBeNull(); // tanpa pemutus manusia
        expect(dilepas).toEqual([`${String(900_000 + ref)}:DITOLAK`]);
        const ev = await eventSla(id);
        expect(ev.map((e) => e.event_name)).toEqual(["ApprovalSlaBreached", "ApprovalDecided"]);
        expect(ev[1]?.payload).toEqual({ instance_id: id, urutan: 1, keputusan: "DITOLAK", status: "DITOLAK", langkah_aktif: null });
        const [putus] = await log("APPROVAL_DECIDED");
        expect(putus).toMatchObject({ user_id: null, role: "SYSTEM" });
    });

    it("RE-13 / SDD-02 §4.4: approver dinonaktifkan SESUDAH langkah aktif → dilewati, langkah berikutnya diaktifkan", async () => {
        const kedua = await pengguna("R-03");
        await aturan([{ user: approver }, { user: kedua }]);
        const id = await ajukan(pemohon);
        await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE id = ${String(approver)}`);

        await jalankanPemeriksaanSla(getDb(), SEBELUM);

        const [l1, l2] = await langkahDb(id);
        expect(l1).toMatchObject({ keputusan: "DILEWATI", alasan_dilewati: "approver nonaktif" });
        expect(l2?.sla_deadline).not.toBeNull();
        expect(await instansi(id)).toEqual({ status: "MENUNGGU", langkah_aktif: 2 });
    });

    it("balapan job vs keputusan approver: tanpa deadlock, tiap instance tepat satu pemenang (kunci langkah → instance)", async () => {
        const kepala = await pengguna("R-03");
        await aturan([{ user: approver, breach: "escalate", eskalasiKe: kepala }]);
        const ids: number[] = [];
        for (let i = 0; i < 15; i += 1) ids.push(await ajukan(pemohon));
        const audit = new AuditLogger({ clock: LEWAT });
        const approval = new ApprovalService(getDb(), audit, LEWAT);
        const decision = new DecisionService(getDb(), audit, LEWAT, approval);
        const ctxApprover = createAuthContext({ userId: approver, roleCode: "UJI", scopes: new Map([["approval.decide", "all"]]) });

        const putus = ids.map((id) =>
            withTransaction(ctxApprover, (s) => decision.putuskan(s, id, { urutan: 1, keputusan: "DISETUJUI", catatan: null }), getDb()).then(
                () => "MENANG",
                (e: unknown) => ((e as { code?: string }).code === "40P01" ? "DEADLOCK" : "KALAH"),
            ),
        );
        const [job, ...hasil] = await Promise.all([jalankanPemeriksaanSla(getDb(), LEWAT), ...putus]);

        expect(hasil).not.toContain("DEADLOCK");
        expect(job.galat).toBe(0);
        for (const [i, id] of ids.entries()) {
            const [l] = await langkahDb(id);
            const inst = await instansi(id);
            // Approver menang → Disetujui dan tak dieskalasi; job menang → dieskalasi, approver ditolak.
            if (hasil[i] === "MENANG") expect({ status: inst?.status, dieskalasi: l?.dieskalasi_pada }).toEqual({ status: "DISETUJUI", dieskalasi: null });
            else expect({ status: inst?.status, target: l?.approver_user_id }).toEqual({ status: "MENUNGGU", target: String(kepala) });
        }
    });

    it("DETERMINISTIK: target dialihkan eskalasi saat `decide` menunggu kunci langkah → approver lama 409, langkah tak diputus", async () => {
        const kepala = await pengguna("R-03");
        await aturan([{ user: approver, breach: "escalate", eskalasiKe: kepala }]);
        const id = await ajukan(pemohon);
        const audit = new AuditLogger({ clock: LEWAT });
        const approval = new ApprovalService(getDb(), audit, LEWAT);
        const decision = new DecisionService(getDb(), audit, LEWAT, approval);
        const ctxApprover = createAuthContext({ userId: approver, roleCode: "UJI", scopes: new Map([["approval.decide", "all"]]) });

        // Koneksi ini memerankan transaksi job: kunci langkah lebih dulu (SlaRepository.kunci).
        const job = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
        await job.connect();
        try {
            await job.query("BEGIN");
            await job.query(`SELECT id FROM approval_steps WHERE instance_id = ${String(id)} AND keputusan IS NULL FOR UPDATE`);

            // Pemeriksaan pemutus sah LOLOS (target masih approver), lalu UPDATE bersyarat tertahan kunci.
            const putus = withTransaction(ctxApprover, (s) => decision.putuskan(s, id, { urutan: 1, keputusan: "DISETUJUI", catatan: null }), getDb()).then(
                () => undefined,
                (e: unknown) => e,
            );
            const batas = Date.now() + 10_000;
            for (;;) {
                const [t] = await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM pg_stat_activity
                    WHERE wait_event_type = 'Lock' AND query ILIKE '%update "approval_steps"%'`);
                if (t?.n !== "0") break;
                if (Date.now() > batas) throw new Error("decide tidak pernah tertahan kunci langkah");
                await new Promise((r) => setTimeout(r, 25));
            }

            await job.query(`UPDATE approval_steps SET approver_user_id = ${String(kepala)}, eskalasi_dari_user_id = ${String(approver)},
                                    dieskalasi_pada = now() WHERE instance_id = ${String(id)}`);
            await job.query("COMMIT");

            const e = await putus;
            expect(e).toBeInstanceOf(DomainError);
            expect((e as DomainError).kode).toBe("APPROVAL_ALREADY_DECIDED");
        } finally {
            await job.end();
        }
        const [l] = await langkahDb(id);
        expect(l).toMatchObject({ keputusan: null, approver_user_id: String(kepala) });
        expect(await instansi(id)).toEqual({ status: "MENUNGGU", langkah_aktif: 1 });
    });

    it("keputusan 73(c): approver eskalasi yang lalu nonaktif TIDAK memicu aktivasi ulang — langkah tetap, berujung eskalasi habis", async () => {
        const kepala = await pengguna("R-03");
        const kedua = await pengguna("R-03");
        await aturan([{ user: approver, breach: "escalate", eskalasiKe: kepala }, { user: kedua }]);
        const id = await ajukan(pemohon);
        await jalankanPemeriksaanSla(getDb(), LEWAT);
        await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE id = ${String(kepala)}`);

        await jalankanPemeriksaanSla(getDb(), BESOK); // sebelum tenggat eskalasi Selasa 14.00
        expect(await instansi(id)).toEqual({ status: "MENUNGGU", langkah_aktif: 1 });
        expect((await langkahDb(id))[0]).toMatchObject({ keputusan: null, approver_user_id: String(kepala) });

        await jalankanPemeriksaanSla(getDb(), SESUDAH_ESKALASI);
        expect((await eventSla(id)).map((e) => e.payload["tindakan"])).toEqual(["ESCALATE", "EXHAUSTED"]);
    });

    it("DETERMINISTIK: instance ditutup di antara daftar dan kunci job → langkah dilewati tanpa efek", async () => {
        await aturan([{ user: approver }]);
        const id = await ajukan(pemohon);
        const lain = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
        await lain.connect();
        try {
            await lain.query("BEGIN");
            await lain.query(`SELECT id FROM approval_steps WHERE instance_id = ${String(id)} FOR UPDATE`);
            const job = jalankanPemeriksaanSla(getDb(), LEWAT);
            const batas = Date.now() + 10_000;
            for (;;) {
                const [t] = await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM pg_stat_activity
                    WHERE wait_event_type = 'Lock' AND query ILIKE '%from "approval_steps"%for update%'`);
                if (t?.n !== "0") break;
                if (Date.now() > batas) throw new Error("job tidak pernah tertahan kunci langkah");
                await new Promise((r) => setTimeout(r, 25));
            }
            // Pengajuan dibatalkan modul pengaju — langkahnya tetap tanpa keputusan.
            await lain.query(`UPDATE approval_instances SET status = 'DIBATALKAN', diselesaikan_pada = now(), langkah_aktif = NULL WHERE id = ${String(id)}`);
            await lain.query("COMMIT");
            expect(await job).toMatchObject({ diproses: 1, galat: 0, rincian: { pengingat: 0 } });
        } finally {
            await lain.end();
        }
        expect(await eventSla(id)).toEqual([]);
        expect((await langkahDb(id))[0]?.pengingat_terakhir_pada).toBeNull();
    });

    it("langkah yang sudah diputus tidak disentuh; ringkasan JOB-05 memuat hitungannya", async () => {
        await aturan([{ user: approver }]);
        const diputus = await ajukan(pemohon);
        await kueri(`UPDATE approval_steps SET keputusan = 'DISETUJUI', diputuskan_oleh = ${String(approver)}, diputuskan_pada = now() WHERE instance_id = ${String(diputus)}`);
        await kueri(`UPDATE approval_instances SET status = 'DISETUJUI', diselesaikan_pada = now(), langkah_aktif = NULL WHERE id = ${String(diputus)}`);
        await ajukan(pemohon);

        await jalankanPemeriksaanSla(getDb(), LEWAT);

        expect(await eventSla(diputus)).toEqual([]);
        const [ringkasan] = await log("SCHEDULED_JOB_EXECUTED");
        expect(ringkasan?.nilai_sesudah).toMatchObject({ pekerjaan: PEKERJAAN_SLA, diproses: 1, galat: 0, pengingat: 1, eskalasi: 0 });
    });
});
