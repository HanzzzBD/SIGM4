// Acceptance PR-02-23 — "Riwayat & pelacakan persetujuan" (FR-10.3, SDD-02 §4.5a,
// keputusan 76) terhadap PostgreSQL NYATA: "Linimasa menampilkan seluruh langkah +
// alasan". Waktu dalam MENIT KERJA (CAL-01) dengan jam tetap; scope `own` dan
// SDD-AUTH-08 lewat `createApp()` terakit.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { ApprovalService, DecisionService } from "../../src/modules/m10-approval/index.js";
import { HistoryService } from "../../src/modules/m10-approval/services/history.service.js";
import type { Linimasa } from "../../src/modules/m10-approval/services/history.service.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { ForbiddenError, NotFoundError } from "../../src/shared/errors/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const jam = (iso: string) => new FixedClock(new Date(iso));
const SENIN_0900 = jam("2026-09-28T02:00:00Z");
const SENIN_1100 = jam("2026-09-28T04:00:00Z");
const SELASA_0700 = jam("2026-09-29T00:00:00Z");
const SELASA_0900 = jam("2026-09-29T02:00:00Z");
const SELASA_1600 = jam("2026-09-29T09:00:00Z");

const penggunaUji: number[] = [];
async function pengguna(kodeRole: string, nama: string): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('${nama}', 'his-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPHIS${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), 'AKTIF', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

async function aturan(pengguna: readonly number[]): Promise<void> {
    const [r] = await kueri<{ id: string }>(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas) VALUES ('PENGADAAN_BARANG', '{}', 50) RETURNING id::text`);
    for (const [i, u] of pengguna.entries()) {
        await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_user_id, sla_jam) VALUES (${String(r?.id)}, ${String(i + 1)}, 'user', ${String(u)}, 8)`);
    }
}

const ctxDari = (userId: number, lihat: Scope | null = "own"): AuthContext =>
    createAuthContext({
        userId,
        roleCode: "UJI",
        scopes: new Map<string, Scope>([["approval.decide", "all"], ...(lihat === null ? [] : [["approval.view", lihat] as [string, Scope]])]),
    });

const layanan = (c: FixedClock) => {
    const audit = new AuditLogger({ clock: c });
    const approval = new ApprovalService(getDb(), audit, c);
    return { approval, decision: new DecisionService(getDb(), audit, c, approval, []), history: new HistoryService(getDb(), c, approval) };
};

let ref = 0;
async function ajukan(pemohon: number): Promise<number> {
    ref += 1;
    const { approval } = layanan(SENIN_0900);
    const id = (await withTransaction(ctxDari(pemohon), (s) => approval.createInstance(s, { jenis: "PENGADAAN_BARANG", referensiId: 800_000 + ref, pemohonId: pemohon, fakta: {} }), getDb()))
        .instanceId;
    // `created_at` = now() basis data, bukan Clock uji: disetel ke waktu lahir yang dimaksud uji.
    await kueri(`UPDATE approval_instances SET created_at = ${"'"}${SENIN_0900.now().toISOString()}${"'"} WHERE id = ${String(id)}`);
    return id;
}

function putuskan(c: FixedClock, userId: number, id: number, urutan: number, keputusan: "DISETUJUI" | "DITOLAK", catatan: string | null = null) {
    return withTransaction(ctxDari(userId), (s) => layanan(c).decision.putuskan(s, id, { urutan, keputusan, catatan }), getDb());
}

const linimasa = (c: FixedClock, userId: number, id: number, lihat: Scope = "all"): Promise<Linimasa> => layanan(c).history.linimasa(ctxDari(userId, lihat), id);

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM idempotency_keys WHERE endpoint LIKE 'POST /approvals/%'");
    await kueri("DELETE FROM approval_steps");
    await kueri("DELETE FROM approval_instances");
    await kueri("DELETE FROM approval_rule_steps");
    await kueri("DELETE FROM approval_rules");
    await kueri("DELETE FROM approval_delegations");
    await kueri("DELETE FROM event_outbox WHERE aggregate_type = 'approval_instance'");
    await kueri("DELETE FROM activity_logs WHERE modul = 'm10-approval'");
    if (penggunaUji.length > 0) await kueri(`DELETE FROM users WHERE id IN (${penggunaUji.splice(0).join(",")})`);
}

describe.skipIf(!ADA_DB)("PR-02-23 — riwayat & pelacakan persetujuan (acceptance)", () => {
    let pemohon: number;
    let a: number;
    let b: number;
    let c: number;
    let d: number;

    beforeAll(() => {
        dbmate("up");
    });
    beforeEach(async () => {
        await bersihkan();
        await kueri(`DELETE FROM holidays WHERE tanggal BETWEEN '2026-09-28' AND '2026-10-03'`);
        pemohon = await pengguna("R-06", "Pemohon");
        a = await pengguna("R-02", "Approver A");
        b = await pengguna("R-03", "Approver B");
        c = await pengguna("R-02", "Penerima Delegasi C");
        d = await pengguna("R-03", "Approver D");
    });
    afterAll(bersihkan);

    /** A setuju Senin 11.00; C (delegasi dari B) setuju Selasa 07.00; D aktif sejak Selasa 07.00 (tenggat 15.00 WIB). */
    async function tigaLangkah(): Promise<number> {
        await aturan([a, b, d]);
        const id = await ajukan(pemohon);
        await putuskan(SENIN_1100, a, id, 1, "DISETUJUI", "Anggaran sesuai");
        await kueri(`INSERT INTO approval_delegations (pemberi_id, penerima_id, mulai, selesai) VALUES (${String(b)}, ${String(c)}, '2026-09-28', '2026-09-30')`);
        await putuskan(SELASA_0700, c, id, 2, "DISETUJUI");
        return id;
    }

    it("seluruh langkah: keputusan, catatan, pemutus, delegasi (RE-12), durasi MENIT KERJA, sisa SLA langkah aktif", async () => {
        const id = await tigaLangkah();
        const h = await linimasa(SELASA_0900, pemohon, id);

        expect(h).toMatchObject({ instance_id: id, status: "MENUNGGU", langkah_aktif: 3, ditolak_otomatis: false, pemohon: { id: pemohon, nama: "Pemohon" } });
        const [l1, l2, l3] = h.langkah;
        expect(l1).toMatchObject({
            status: "DISETUJUI",
            approver: { tipe: "user", user: { id: a, nama: "Approver A" }, role: null },
            catatan: "Anggaran sesuai",
            diputuskan_oleh: { id: a, nama: "Approver A" },
            atas_nama: null,
            fallback: false,
            sla: null,
            durasi_menit_kerja: 120, // Senin 09.00 → 11.00
        });
        // Senin 11.00 → Selasa 07.00: 420 (s.d. 18.00) + 60 (06.00–07.00) — BUKAN 1.200 menit kalender.
        expect(l2).toMatchObject({ status: "DISETUJUI", diputuskan_oleh: { id: c }, atas_nama: { id: b, nama: "Approver B" }, durasi_menit_kerja: 480 });
        expect(l3).toMatchObject({ status: "AKTIF", durasi_menit_kerja: null, diputuskan_oleh: null });
        expect(l3?.sla).toEqual({ deadline: new Date("2026-09-29T08:00:00Z"), sisa_menit_kerja: 360, terlambat: false });

        const telat = (await linimasa(SELASA_1600, pemohon, id)).langkah[2]?.sla;
        expect(telat).toMatchObject({ sisa_menit_kerja: 0, terlambat: true });
    });

    it("sisa SLA melewati jam tutup dihitung MENIT KERJA (CAL-01), bukan selisih kalender", async () => {
        await aturan([a]);
        const id = await ajukan(pemohon);
        // Langkah aktif Senin 16.00 WIB → tenggat 8 jam kerja = Selasa 12.00 WIB.
        await kueri(`UPDATE approval_steps SET sla_deadline = '2026-09-29T05:00:00Z' WHERE instance_id = ${String(id)}`);
        const sla = (await linimasa(jam("2026-09-28T10:00:00Z"), pemohon, id)).langkah[0]?.sla; // Senin 17.00 WIB
        // 60 (17.00–18.00) + 360 (Selasa 06.00–12.00) = 420; kalender = 1.140.
        expect(sla).toMatchObject({ sisa_menit_kerja: 420, terlambat: false });
    });

    it("penolakan menghentikan alur: alasan tampil, langkah sesudahnya TIDAK_DIJALANKAN; langkah belum aktif = BELUM_AKTIF", async () => {
        await aturan([a, b]);
        const berjalan = await ajukan(pemohon);
        expect((await linimasa(SENIN_1100, pemohon, berjalan)).langkah.map((l) => l.status)).toEqual(["AKTIF", "BELUM_AKTIF"]);

        await putuskan(SENIN_1100, a, berjalan, 1, "DITOLAK", "Dana tidak tersedia");
        const h = await linimasa(SENIN_1100, pemohon, berjalan);
        expect(h.status).toBe("DITOLAK");
        expect(h.langkah.map((l) => [l.status, l.catatan])).toEqual([
            ["DITOLAK", "Dana tidak tersedia"],
            ["TIDAK_DIJALANKAN", null],
        ]);
        expect(h.ditolak_otomatis).toBe(false);
    });

    it("langkah dilewati beserta alasannya + langkah fallback bertanda (RE-10, RE-11)", async () => {
        await aturan([pemohon]); // approver = pemohon → konflik kepentingan
        const id = await ajukan(pemohon);
        const [lewat, fallback] = (await linimasa(SENIN_0900, a, id)).langkah;
        expect(lewat).toMatchObject({ status: "DILEWATI", alasan_dilewati: "konflik kepentingan", fallback: false });
        expect(fallback).toMatchObject({ status: "AKTIF", fallback: true, approver: { tipe: "role", role: { nama: "Administrator" } } });
    });

    it("FR-10.3 A2: penanda eskalasi (asal & waktu) dan penolakan otomatis Lampiran D.5", async () => {
        await aturan([a]);
        const id = await ajukan(pemohon);
        await kueri(`UPDATE approval_steps SET approver_user_id = ${String(d)}, eskalasi_dari_user_id = ${String(a)},
                            dieskalasi_pada = '2026-09-28T11:00:00Z', alarm_terminal_pada = '2026-09-29T09:00:00Z' WHERE instance_id = ${String(id)}`);
        await kueri(`UPDATE approval_instances SET status = 'DITOLAK', diselesaikan_pada = '2026-09-29T09:00:00Z', langkah_aktif = NULL WHERE id = ${String(id)}`);

        const h = await linimasa(SELASA_1600, pemohon, id);
        expect(h).toMatchObject({ status: "DITOLAK", ditolak_otomatis: true });
        expect(h.langkah[0]).toMatchObject({
            status: "TIDAK_DIJALANKAN",
            approver: { user: { id: d } },
            eskalasi: { pada: new Date("2026-09-28T11:00:00Z"), dari: { id: a, nama: "Approver A" } },
            eskalasi_habis_pada: new Date("2026-09-29T09:00:00Z"),
            sla: null,
        });
    });

    describe("scope `own` (FR-10.3 A1, keputusan 76) & SDD-AUTH-08", () => {
        it.each([
            ["pemohon", () => pemohon],
            ["pemutus langkah selesai", () => a],
            ["penerima delegasi yang memutus", () => c],
            ["approver asli yang diwakili (atas_nama)", () => b],
            ["pemutus sah langkah aktif", () => d],
        ])("%s → boleh", async (_, siapa) => {
            const id = await tigaLangkah();
            await expect(linimasa(SELASA_0900, siapa(), id, "own")).resolves.toMatchObject({ instance_id: id });
        });

        it("pihak lain ber-scope own → 403, SAMA dengan instance yang tidak ada; scope all → boleh", async () => {
            const id = await tigaLangkah();
            const lain = await pengguna("R-05", "Guru Lain");
            await expect(linimasa(SELASA_0900, lain, id, "own")).rejects.toBeInstanceOf(ForbiddenError);
            await expect(linimasa(SELASA_0900, lain, 999_999_999, "own")).rejects.toBeInstanceOf(ForbiddenError);
            await expect(linimasa(SELASA_0900, lain, id, "all")).resolves.toMatchObject({ instance_id: id });
            // Scope `all` berhak atas semuanya — tak ada yang disamarkan: yang tak ada = 404.
            await expect(linimasa(SELASA_0900, lain, 999_999_999, "all")).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe("kontrak HTTP", () => {
        let server: Server;
        let url: string;
        let sebagai: AuthContext = ctxDari(0);

        beforeAll(async () => {
            const app = createApp({
                health: new HealthRegistry(30),
                limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
                security: { objectStorageOrigin: "http://minio:9000" },
                logger: new Logger({ clock: SELASA_0900, tulis: () => undefined }),
                clock: SELASA_0900,
                db: getDb(),
                auth: authPalsu(),
            });
            const luar = express();
            luar.use((_req, res, next) => {
                setAuthContext(res, sebagai);
                setAmr(res, ["pwd", AMR_OTP]);
                next();
            });
            luar.use(app);
            server = createServer(luar);
            await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
            url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
        });
        afterAll(async () => {
            await new Promise<void>((r) => server.close(() => r()));
        });

        async function get(ctx: AuthContext, id: number | string) {
            sebagai = ctx;
            const res = await fetch(`${url}/approvals/${String(id)}/history`);
            return { status: res.status, json: (await res.json()) as { data?: Linimasa; error?: { code: string } } };
        }

        it("200 berenvelope; 403 identik untuk instance orang lain & yang tak ada; tanpa approval.view → 403; id cacat → 400", async () => {
            const id = await tigaLangkah();
            const ok = await get(ctxDari(pemohon), id);
            expect(ok.status).toBe(200);
            expect(ok.json.data?.langkah).toHaveLength(3);
            expect(ok.json.data?.langkah[2]?.sla).toEqual({ deadline: "2026-09-29T08:00:00.000Z", sisa_menit_kerja: 360, terlambat: false });

            const lain = await pengguna("R-05", "Guru Lain");
            const milikOrang = await get(ctxDari(lain), id);
            const takAda = await get(ctxDari(lain), 999_999_999);
            expect(milikOrang.status).toBe(403);
            // Identik kecuali korelasi permintaan (request_id) — tak membocorkan keberadaan data.
            const tanpaKorelasi = (r: typeof takAda) => ({ ...r, json: { ...r.json, request_id: undefined } });
            expect(tanpaKorelasi(milikOrang)).toEqual(tanpaKorelasi(takAda));
            expect(milikOrang.json.error?.code).toBeDefined();
            expect((await get(ctxDari(lain, null), id)).status).toBe(403);
            expect((await get(ctxDari(pemohon), "abc")).status).toBe(400);
        });
    });
});
