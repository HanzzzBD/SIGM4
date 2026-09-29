// Acceptance PR-02-24 — "Antarmuka konfigurasi approval rule + pratinjau" (FR-10.1,
// RE-04 … RE-08, Lampiran D.5, SDD-APR-02/10, SDD-02 §4.5b; keputusan 77) terhadap
// PostgreSQL NYATA lewat `createApp()` terakit: "Pratinjau menunjukkan jalur yang akan terpilih".

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { ApprovalService } from "../../src/modules/m10-approval/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const clock = new FixedClock(new Date("2026-09-28T02:00:00Z"));

const penggunaUji: number[] = [];
async function pengguna(kodeRole: string, status: "AKTIF" | "NONAKTIF" = "AKTIF", nama = "Uji Aturan"): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('${nama}', 'rul-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPRUL${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), '${status}', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

const ctxDari = (userId: number, perms: readonly string[] = ["approval_rule.view", "approval_rule.manage"]): AuthContext =>
    createAuthContext({ userId, roleCode: "UJI", scopes: new Map<string, Scope>(perms.map((p) => [p, "all"])) });

const langkahRole = (order: number, role = "R-02", tambahan: Record<string, unknown> = {}) => ({ order, approver_type: "role", approver_role: role, sla_hours: 24, on_sla_breach: "remind", ...tambahan });
const aturan = (prioritas: number, kondisi: unknown = {}, steps: unknown[] = [langkahRole(1)], tambahan: Record<string, unknown> = {}) => ({
    jenis_pengajuan: "PENGADAAN_BARANG",
    prioritas,
    kondisi,
    steps,
    ...tambahan,
});
const MAHAL = { field: "total_value", op: "gt", value: 10_000_000 };

type Balasan = { status: number; json: { data?: Record<string, unknown> & { id?: number }; error?: { code: string; details?: { field: string; message: string }[] } } };

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM approval_steps");
    await kueri("DELETE FROM approval_instances");
    await kueri("DELETE FROM approval_rule_steps");
    await kueri("DELETE FROM approval_rules");
    await kueri("DELETE FROM event_outbox WHERE aggregate_type = 'approval_instance'");
    await kueri("DELETE FROM activity_logs WHERE modul = 'm10-approval'");
    if (penggunaUji.length > 0) await kueri(`DELETE FROM users WHERE id IN (${penggunaUji.splice(0).join(",")})`);
}

describe.skipIf(!ADA_DB)("PR-02-24 — konfigurasi approval rule + pratinjau (acceptance)", () => {
    let server: Server;
    let url: string;
    let sebagai: AuthContext = ctxDari(0);
    let admin: number;

    beforeAll(async () => {
        dbmate("up");
        const app = createApp({
            health: new HealthRegistry(30),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: "http://minio:9000" },
            logger: new Logger({ clock, tulis: () => undefined }),
            clock,
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
        await bersihkan();
    });
    beforeEach(async () => {
        await bersihkan();
        admin = await pengguna("R-01", "AKTIF", "Admin Aturan");
        sebagai = ctxDari(admin);
    });

    async function kirim(metode: string, path: string, body?: unknown, ctx: AuthContext = ctxDari(admin)): Promise<Balasan> {
        sebagai = ctx;
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: res.status, json: (await res.json()) as Balasan["json"] };
    }
    const simpan = async (a: unknown): Promise<number> => {
        const r = await kirim("POST", "/approval-rules", a);
        expect(r.status, JSON.stringify(r.json)).toBe(201);
        return r.json.data?.id as number;
    };
    const log = (aksi: string) => kueri<{ user_id: string }>(`SELECT user_id::text FROM activity_logs WHERE aksi = '${aksi}'`);

    describe("simpan, ganti, nonaktifkan (FR-10.1)", () => {
        it("POST 201: bentuk D.5 dengan role ber-KODE, versi 1, APPROVAL_RULE_CREATED; GET memuatnya", async () => {
            const kepala = await pengguna("R-03", "AKTIF", "Kepala");
            const r = await kirim("POST", "/approval-rules", aturan(50, MAHAL, [langkahRole(1), { order: 2, approver_type: "user", approver_user_id: kepala, sla_hours: 48, on_sla_breach: "escalate", escalate_to_user_id: admin }], { terminal_on_exhausted_escalation: "auto_reject" }));
            expect(r.status).toBe(201);
            expect(r.json.data).toMatchObject({
                jenis_pengajuan: "PENGADAAN_BARANG",
                prioritas: 50,
                status_aktif: true,
                versi: 1,
                kondisi: MAHAL,
                steps: [
                    { order: 1, approver_type: "role", approver_role: "R-02", sla_hours: 24, on_sla_breach: "remind" },
                    { order: 2, approver_type: "user", approver_user_id: kepala, sla_hours: 48, on_sla_breach: "escalate", escalate_to_user_id: admin },
                ],
                fallback_approver: null,
                terminal_on_exhausted_escalation: "auto_reject",
            });
            expect(await log("APPROVAL_RULE_CREATED")).toEqual([{ user_id: String(admin) }]);
            const daftar = await kirim("GET", "/approval-rules", undefined, ctxDari(admin, ["approval_rule.view"]));
            expect(daftar.status).toBe(200);
            expect((daftar.json.data as unknown as unknown[]).length).toBe(1);
        });

        it("RE-08: SELURUH pelanggaran makna dikembalikan sekaligus sebagai 422 INVALID_RULE_DEFINITION", async () => {
            const nonaktif = await pengguna("R-03", "NONAKTIF");
            const tanpaHak = await pengguna("R-04"); // Teknisi: tanpa approval.decide
            const r = await kirim(
                "POST",
                "/approval-rules",
                aturan(10, { field: "room_type", op: "eq", value: "LAB" }, [
                    langkahRole(1, "R-99"),
                    { order: 2, approver_type: "user", approver_user_id: nonaktif, sla_hours: 8, on_sla_breach: "escalate", escalate_to_user_id: tanpaHak },
                ]),
            );
            expect(r.status).toBe(422);
            expect(r.json.error?.code).toBe("INVALID_RULE_DEFINITION");
            expect(r.json.error?.details?.map((d) => d.field).sort()).toEqual(["kondisi.field", "steps.0.approver_role", "steps.1.approver_user_id", "steps.1.escalate_to_user_id"].sort());
            expect(await kueri("SELECT 1 FROM approval_rules")).toHaveLength(0);
        });

        it.each([
            ["order tidak berurutan", aturan(1, {}, [langkahRole(2)])],
            ["escalate tanpa escalate_to_user_id", aturan(1, {}, [langkahRole(1, "R-02", { on_sla_breach: "escalate" })])],
            ["terminal auto_approve (BR-039a)", aturan(1, {}, [langkahRole(1)], { terminal_on_exhausted_escalation: "auto_approve" })],
        ])("struktur tidak sah (%s) → 422 INVALID_RULE_DEFINITION, bukan 400", async (_, body) => {
            const r = await kirim("POST", "/approval-rules", body);
            expect(r.status).toBe(422);
            expect(r.json.error?.code).toBe("INVALID_RULE_DEFINITION");
        });

        it("PUT: definisi utuh diganti, versi naik; instance berjalan TETAP memakai snapshot lama (BR-040)", async () => {
            const id = await simpan(aturan(50));
            const pemohon = await pengguna("R-06");
            const approval = new ApprovalService(getDb(), new AuditLogger({ clock }), clock);
            const inst = await withTransaction(ctxDari(pemohon), (s) => approval.createInstance(s, { jenis: "PENGADAAN_BARANG", referensiId: 1, pemohonId: pemohon, fakta: {} }), getDb());

            const r = await kirim("PUT", `/approval-rules/${String(id)}`, aturan(60, {}, [langkahRole(1, "R-03"), langkahRole(2, "R-01")]));
            expect(r.status).toBe(200);
            expect(r.json.data).toMatchObject({ id, versi: 2, prioritas: 60, steps: [{ approver_role: "R-03" }, { approver_role: "R-01" }] });
            expect(await log("APPROVAL_RULE_UPDATED")).toHaveLength(1);

            const [snap] = await kueri<{ versi: number; n: number }>(`SELECT (rule_snapshot->>'versi')::int AS versi, jsonb_array_length(rule_snapshot->'langkah') AS n
                                                                      FROM approval_instances WHERE id = ${String(inst.instanceId)}`);
            expect(snap).toEqual({ versi: 1, n: 1 });
            expect((await kirim("PUT", "/approval-rules/999999999", aturan(1))).status).toBe(404);
        });

        it("PATCH status: nonaktif tak lagi terpilih (bawaan berlaku); ulang tanpa entri log; aktif kembali → UPDATED", async () => {
            const id = await simpan(aturan(50, {}, [langkahRole(1, "R-03")]));
            const nonaktif = await kirim("PATCH", `/approval-rules/${String(id)}/status`, { status_aktif: false });
            expect(nonaktif).toMatchObject({ status: 200, json: { data: { status_aktif: false, versi: 1 } } });
            expect((await kirim("POST", "/approval-rules/preview", { jenis_pengajuan: "PENGADAAN_BARANG" })).json.data).toMatchObject({ terpilih: { bawaan: true, rule_id: null } });

            await kirim("PATCH", `/approval-rules/${String(id)}/status`, { status_aktif: false });
            expect(await log("APPROVAL_RULE_DEACTIVATED")).toHaveLength(1);
            await kirim("PATCH", `/approval-rules/${String(id)}/status`, { status_aktif: true });
            expect(await log("APPROVAL_RULE_UPDATED")).toHaveLength(1);
            expect((await kirim("PATCH", "/approval-rules/999999999/status", { status_aktif: false })).status).toBe(404);
        });

        it("tanpa approval_rule.manage → 403 untuk tulis & pratinjau; view cukup untuk GET", async () => {
            const lihat = ctxDari(admin, ["approval_rule.view"]);
            expect((await kirim("POST", "/approval-rules", aturan(1), lihat)).status).toBe(403);
            expect((await kirim("POST", "/approval-rules/preview", { jenis_pengajuan: "PENGADAAN_BARANG" }, lihat)).status).toBe(403);
            expect((await kirim("GET", "/approval-rules", undefined, ctxDari(admin, ["approval.view"]))).status).toBe(403);
        });
    });

    describe("pratinjau (RE-07, FR-10.1 AC 3)", () => {
        const pratinjau = async (body: Record<string, unknown>) => {
            const r = await kirim("POST", "/approval-rules/preview", { jenis_pengajuan: "PENGADAAN_BARANG", ...body });
            expect(r.status, JSON.stringify(r.json)).toBe(200);
            return r.json.data as {
                terpilih: Record<string, unknown>;
                cocok: { rule_id: number | null; draf: boolean; prioritas: number }[];
                langkah: { urutan: number; approver: Record<string, unknown>; fallback: boolean; akan_dilewati: string | null }[];
            };
        };

        it("aturan terpilih = prioritas tertinggi dari yang COCOK dengan fakta (evaluator yang sama); seluruh yang cocok urut RE-04", async () => {
            const mahal = await simpan(aturan(90, MAHAL, [langkahRole(1, "R-03")]));
            const umum = await simpan(aturan(10));
            const p = await pratinjau({ fakta: { total_value: 20_000_000 } });
            expect(p.terpilih).toMatchObject({ rule_id: mahal, draf: false, bawaan: false, prioritas: 90, versi: 1 });
            expect(p.cocok).toEqual([
                { rule_id: mahal, draf: false, prioritas: 90 },
                { rule_id: umum, draf: false, prioritas: 10 },
            ]);
            expect(p.langkah).toEqual([
                { urutan: 1, approver: { tipe: "role", role: { kode: "R-03", nama: "Pimpinan Sekolah" }, user: null }, sla_jam: 24, on_sla_breach: "remind", eskalasi_ke: null, fallback: false, akan_dilewati: null },
            ]);
            expect((await pratinjau({ fakta: { total_value: 5_000_000 } })).terpilih).toMatchObject({ rule_id: umum });
        });

        it("draf SEBELUM disimpan: draf baru berprioritas lebih tinggi menang; seri → aturan tersimpan menang (RE-04, id draf terbesar)", async () => {
            const tersimpan = await simpan(aturan(50));
            const menang = await pratinjau({ aturan_draf: aturan(60, {}, [langkahRole(1, "R-03")]) });
            expect(menang.terpilih).toMatchObject({ draf: true, rule_id: null, prioritas: 60 });
            expect(menang.langkah[0]?.approver).toMatchObject({ role: { kode: "R-03" } });
            expect((await pratinjau({ aturan_draf: aturan(50, {}, [langkahRole(1, "R-03")]) })).terpilih).toMatchObject({ draf: false, rule_id: tersimpan });
        });

        it("draf ber-id MENGGANTIKAN versi tersimpannya dalam pratinjau", async () => {
            const a = await simpan(aturan(90, MAHAL));
            const b = await simpan(aturan(10));
            const p = await pratinjau({ fakta: { total_value: 20_000_000 }, aturan_draf: { ...aturan(5, MAHAL), id: a } });
            expect(p.terpilih).toMatchObject({ rule_id: b, draf: false });
            expect(p.cocok).toEqual([
                { rule_id: b, draf: false, prioritas: 10 },
                { rule_id: a, draf: true, prioritas: 5 },
            ]);
        });

        it("tak ada yang cocok → aturan bawaan RE-06 (R-02, 24 jam)", async () => {
            await simpan(aturan(90, MAHAL));
            const p = await pratinjau({ fakta: { total_value: 1 } });
            expect(p).toMatchObject({ terpilih: { bawaan: true, rule_id: null, prioritas: null }, cocok: [] });
            expect(p.langkah).toEqual([{ urutan: 1, approver: { tipe: "role", role: { kode: "R-02", nama: "Petugas Sarana Prasarana" }, user: null }, sla_jam: 24, on_sla_breach: "remind", eskalasi_ke: null, fallback: false, akan_dilewati: null }]);
        });

        it("pemohon_id: langkah yang akan dilewati (RE-10 konflik, RE-13 nonaktif) + fallback Administrator (RE-11)", async () => {
            const pemohon = await pengguna("R-02", "AKTIF", "Pemohon Petugas");
            const kepala = await pengguna("R-03", "AKTIF", "Kepala");
            await simpan(aturan(50, {}, [{ order: 1, approver_type: "user", approver_user_id: pemohon, sla_hours: 8, on_sla_breach: "remind" }, { order: 2, approver_type: "user", approver_user_id: kepala, sla_hours: 8, on_sla_breach: "remind" }]));
            await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE id = ${String(kepala)}`);

            const p = await pratinjau({ pemohon_id: pemohon });
            expect(p.langkah.map((l) => [l.urutan, l.akan_dilewati, l.fallback])).toEqual([
                [1, "konflik kepentingan", false],
                [2, "approver nonaktif", false],
                [3, null, true],
            ]);
            expect(p.langkah[2]?.approver).toMatchObject({ tipe: "role", role: { kode: "R-01" } });
            // Tanpa pemohon: tidak ada simulasi.
            expect((await pratinjau({})).langkah.every((l) => l.akan_dilewati === null && !l.fallback)).toBe(true);
        });

        it("TANPA efek samping: tak ada aturan, instance, maupun entri log yang tertulis", async () => {
            await simpan(aturan(10));
            const hitung = async () =>
                (await kueri<{ a: string; i: string; l: string }>(`SELECT (SELECT count(*) FROM approval_rules)::text AS a, (SELECT count(*) FROM approval_instances)::text AS i,
                                                                   (SELECT count(*) FROM activity_logs WHERE modul = 'm10-approval')::text AS l`))[0];
            const sebelum = await hitung();
            await pratinjau({ fakta: { total_value: 1 }, aturan_draf: aturan(99), pemohon_id: admin });
            expect(await hitung()).toEqual(sebelum);
        });

        it("draf tidak sah → 422 dengan field berawalan aturan_draf.; jenis draf ≠ skenario → 422", async () => {
            const r = await kirim("POST", "/approval-rules/preview", { jenis_pengajuan: "PENGADAAN_BARANG", aturan_draf: aturan(1, {}, [langkahRole(1, "R-99")]) });
            expect(r.status).toBe(422);
            expect(r.json.error?.details?.map((d) => d.field)).toEqual(["aturan_draf.steps.0.approver_role"]);
            const beda = await kirim("POST", "/approval-rules/preview", { jenis_pengajuan: "PENGADAAN_BARANG", aturan_draf: { ...aturan(1), jenis_pengajuan: "RESERVASI_RUANGAN" } });
            expect(beda.status).toBe(422);
        });
    });
});
