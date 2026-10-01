// Acceptance PR-02-21 — "Eksekusi persetujuan + first-responder-wins" (FR-10.2, BR-035 …
// BR-039a, RE-09, SDD-APR-05/07/17; keputusan 69) terhadap PostgreSQL NYATA:
// "Dua approver serentak → satu 200, satu 409". Layanan diuji langsung; kontrak HTTP
// (Idempotency-Key ID-01, 403 SDD-AUTH-08, 409 RE-09) lewat `createApp()` terakit.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { ApprovalService } from "../../src/modules/m10-approval/index.js";
import type { PenanganHasil } from "../../src/modules/m10-approval/index.js";
import { DecisionService } from "../../src/modules/m10-approval/services/decision.service.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { DomainError, mapError } from "../../src/shared/errors/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
/** Senin 28 September 2026, 09.00 WIB — di dalam jam operasional. */
const SEKARANG = new Date("2026-09-28T02:00:00Z");
const HARI_INI = "2026-09-28";

const clock = new FixedClock(SEKARANG);
const audit = new AuditLogger({ clock });
const approval = new ApprovalService(getDb(), audit, clock);

const penggunaUji: number[] = [];
const roleUji: number[] = [];

async function pengguna(roleId: number, status: "AKTIF" | "NONAKTIF" = "AKTIF", nama = "Uji Keputusan"): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('${nama}', 'dec-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPDEC${randomUUID().replace(/-/g, "").slice(0, 12)}',
                ${String(roleId)}, '${status}', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

const idRole = async (kode: string): Promise<number> => Number((await kueri<{ id: string }>(`SELECT id::text FROM roles WHERE kode = '${kode}'`))[0]?.id);

async function roleBaru(): Promise<number> {
    const kode = `RD-${randomUUID().slice(0, 8)}`;
    const [b] = await kueri<{ id: string }>(`INSERT INTO roles (kode, nama) VALUES ('${kode}', 'Role Uji ${kode}') RETURNING id::text`);
    const id = Number(b?.id);
    roleUji.push(id);
    return id;
}

type LangkahUji = { role: number } | { user: number };

async function aturan(langkah: readonly LangkahUji[]): Promise<void> {
    const [r] = await kueri<{ id: string }>(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas) VALUES ('PENGADAAN_BARANG', '{}', 50) RETURNING id::text`);
    for (const [i, l] of langkah.entries()) {
        const [tipe, role, user] = "role" in l ? ["role", l.role, "NULL"] : ["user", "NULL", l.user];
        await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_role_id, approver_user_id, sla_jam)
                     VALUES (${String(r?.id)}, ${String(i + 1)}, '${tipe}', ${String(role)}, ${String(user)}, 8)`);
    }
}

const ctxDari = (userId: number): AuthContext => createAuthContext({ userId, roleCode: "UJI", scopes: new Map([["approval.decide", "all"]]) });

let refUrut = 0;
async function ajukan(pemohonId: number): Promise<number> {
    refUrut += 1;
    const r = await withTransaction(
        ctxDari(pemohonId),
        (s) => approval.createInstance(s, { jenis: "PENGADAAN_BARANG", referensiId: 700_000 + refUrut, pemohonId, fakta: {} }),
        getDb(),
    );
    return r.instanceId;
}

function layanan(penangan: readonly PenanganHasil[] = []): DecisionService {
    return new DecisionService(getDb(), audit, clock, approval, penangan);
}

function putuskan(s: DecisionService, userId: number, instanceId: number, urutan: number, keputusan: "DISETUJUI" | "DITOLAK" | "PERLU_REVISI", catatan: string | null = null) {
    return withTransaction(ctxDari(userId), (scope) => s.putuskan(scope, instanceId, { urutan, keputusan, catatan }), getDb());
}

async function galat(p: Promise<unknown>): Promise<{ kode: string; details: unknown }> {
    const e = await p.then(
        () => undefined,
        (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(DomainError);
    return { kode: (e as DomainError).kode, details: mapError(e).details };
}

const instansi = async (id: number) =>
    (await kueri<{ status: string; langkah_aktif: number | null; diselesaikan_pada: Date | null }>(`SELECT status, langkah_aktif, diselesaikan_pada FROM approval_instances WHERE id = ${String(id)}`))[0];
const langkah = (id: number) =>
    kueri<{ urutan: number; keputusan: string | null; catatan: string | null; diputuskan_oleh: string | null; atas_nama_user_id: string | null; sla_deadline: Date | null }>(
        `SELECT urutan, keputusan, catatan, diputuskan_oleh::text, atas_nama_user_id::text, sla_deadline FROM approval_steps WHERE instance_id = ${String(id)} ORDER BY urutan`,
    );
const event = (id: number) =>
    kueri<{ event_name: string; payload: Record<string, unknown> }>(`SELECT event_name, payload FROM event_outbox WHERE aggregate_type = 'approval_instance' AND aggregate_id = '${String(id)}' ORDER BY id`);
const logKeputusan = (id: number) =>
    kueri<{ user_id: string }>(`SELECT user_id::text FROM activity_logs WHERE aksi = 'APPROVAL_DECIDED' AND entitas_id = '${String(id)}'`);

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
    if (roleUji.length > 0) await kueri(`DELETE FROM roles WHERE id IN (${roleUji.splice(0).join(",")})`);
}

describe.skipIf(!ADA_DB)("PR-02-21 — eksekusi persetujuan (acceptance)", () => {
    let pemohon: number;
    let role: number;
    let a1: number;
    let a2: number;

    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await bersihkan();
        await kueri(`DELETE FROM holidays WHERE tanggal BETWEEN '2026-09-28' AND '2026-10-10'`);
        pemohon = await pengguna(await idRole("R-06"), "AKTIF", "Pemohon Uji");
        role = await roleBaru();
        a1 = await pengguna(role, "AKTIF", "Approver Satu");
        a2 = await pengguna(role, "AKTIF", "Approver Dua");
    });

    afterAll(bersihkan);

    describe("alur keputusan (FR-10.2 langkah 4-7, BR-038, BR-042)", () => {
        it("setuju pada langkah terakhir -> DISETUJUI, selesai, event ApprovalDecided + APPROVAL_DECIDED", async () => {
            await aturan([{ role }]);
            const id = await ajukan(pemohon);
            const h = await putuskan(layanan(), a1, id, 1, "DISETUJUI", "Oke");
            expect(h).toEqual({ instance_id: id, urutan: 1, keputusan: "DISETUJUI", status: "DISETUJUI", langkah_aktif: null, atas_nama_user_id: null });
            expect(await instansi(id)).toMatchObject({ status: "DISETUJUI", langkah_aktif: null, diselesaikan_pada: SEKARANG });
            expect((await langkah(id))[0]).toMatchObject({ keputusan: "DISETUJUI", catatan: "Oke", diputuskan_oleh: String(a1) });
            expect(await event(id)).toEqual([
                { event_name: "ApprovalDecided", payload: { instance_id: id, urutan: 1, keputusan: "DISETUJUI", status: "DISETUJUI", langkah_aktif: null } },
            ]);
            expect(await logKeputusan(id)).toEqual([{ user_id: String(a1) }]);
        });

        it("setuju pada langkah 1 dari 2 -> lanjut ke langkah 2 (aktif, bertenggat); langkah 2 menuntaskan", async () => {
            const kepala = await pengguna(await idRole("R-03"));
            await aturan([{ role }, { user: kepala }]);
            const id = await ajukan(pemohon);
            const h = await putuskan(layanan(), a1, id, 1, "DISETUJUI");
            expect(h).toMatchObject({ status: "MENUNGGU", langkah_aktif: 2 });
            expect(await instansi(id)).toMatchObject({ status: "MENUNGGU", langkah_aktif: 2, diselesaikan_pada: null });
            expect((await langkah(id))[1]?.sla_deadline).not.toBeNull();
            expect((await putuskan(layanan(), kepala, id, 2, "DISETUJUI")).status).toBe("DISETUJUI");
        });

        it("BR-038: ditolak pada langkah 1 -> alur berhenti, langkah 2 tak pernah aktif", async () => {
            await aturan([{ role }, { user: await pengguna(await idRole("R-03")) }]);
            const id = await ajukan(pemohon);
            const h = await putuskan(layanan(), a2, id, 1, "DITOLAK", "Anggaran habis");
            expect(h).toMatchObject({ status: "DITOLAK", langkah_aktif: null });
            expect(await instansi(id)).toMatchObject({ status: "DITOLAK", langkah_aktif: null });
            expect((await langkah(id)).map((l) => [l.keputusan, l.sla_deadline === null])).toEqual([
                ["DITOLAK", false],
                [null, true],
            ]);
        });

        it("A1: perlu revisi -> PERLU_REVISI, alur berhenti", async () => {
            await aturan([{ role }]);
            const id = await ajukan(pemohon);
            expect((await putuskan(layanan(), a1, id, 1, "PERLU_REVISI", "Lampirkan RAB")).status).toBe("PERLU_REVISI");
            expect(await instansi(id)).toMatchObject({ status: "PERLU_REVISI" });
        });

        it("catatan wajib saat menolak / meminta revisi (BR-042, keputusan 69) -> 422 catatan, tanpa perubahan", async () => {
            await aturan([{ role }]);
            const id = await ajukan(pemohon);
            for (const k of ["DITOLAK", "PERLU_REVISI"] as const) {
                expect(await galat(putuskan(layanan(), a1, id, 1, k, "   "))).toMatchObject({ kode: "VALIDATION_ERROR", details: [{ field: "catatan" }] });
                expect(await galat(putuskan(layanan(), a1, id, 1, k, null))).toMatchObject({ kode: "VALIDATION_ERROR" });
            }
            expect(await instansi(id)).toMatchObject({ status: "MENUNGGU", langkah_aktif: 1 });
            expect(await logKeputusan(id)).toEqual([]);
        });

        it("setuju langkah 1, approver langkah 2 nonaktif -> dilewati, fallback Administrator (RE-11/13)", async () => {
            await aturan([{ role }, { user: await pengguna(await idRole("R-03"), "NONAKTIF") }]);
            const id = await ajukan(pemohon);
            expect(await putuskan(layanan(), a1, id, 1, "DISETUJUI")).toMatchObject({ status: "MENUNGGU", langkah_aktif: 3 });
            expect((await langkah(id)).map((l) => l.keputusan)).toEqual(["DISETUJUI", "DILEWATI", null]);
        });
    });

    describe("otorisasi tingkat objek (FR-10.2 AC, BR-039, SDD-AUTH-08)", () => {
        it("bukan pemutus sah langkah itu -> FORBIDDEN; instance/langkah tak ada -> FORBIDDEN yang SAMA", async () => {
            await aturan([{ role }]);
            const id = await ajukan(pemohon);
            const orangLain = await pengguna(await idRole("R-03"));
            expect(await galat(putuskan(layanan(), orangLain, id, 1, "DISETUJUI"))).toMatchObject({ kode: "FORBIDDEN" });
            expect(await galat(putuskan(layanan(), a1, 999_999_999, 1, "DISETUJUI"))).toMatchObject({ kode: "FORBIDDEN" });
            expect(await galat(putuskan(layanan(), a1, id, 9, "DISETUJUI"))).toMatchObject({ kode: "FORBIDDEN" });
        });

        it("BR-039: pemohon pemegang role langkah (ada pemegang lain) tidak dapat memutus pengajuannya sendiri", async () => {
            await aturan([{ role }]);
            const id = await ajukan(a1);
            expect(await galat(putuskan(layanan(), a1, id, 1, "DISETUJUI"))).toMatchObject({ kode: "FORBIDDEN" });
            expect((await putuskan(layanan(), a2, id, 1, "DISETUJUI")).status).toBe("DISETUJUI");
        });

        it("RE-12: penerima delegasi memutus atas nama pemberi (atas_nama_user_id); pemberi tidak lagi berhak", async () => {
            const kepala = await pengguna(await idRole("R-03"), "AKTIF", "Kepala");
            const wakil = await pengguna(await idRole("R-02"), "AKTIF", "Wakil");
            await kueri(`INSERT INTO approval_delegations (pemberi_id, penerima_id, mulai, selesai) VALUES (${String(kepala)}, ${String(wakil)}, '${HARI_INI}', '${HARI_INI}')`);
            await aturan([{ user: kepala }]);
            const id = await ajukan(pemohon);
            expect(await galat(putuskan(layanan(), kepala, id, 1, "DISETUJUI"))).toMatchObject({ kode: "FORBIDDEN" });
            expect(await putuskan(layanan(), wakil, id, 1, "DISETUJUI")).toMatchObject({ status: "DISETUJUI", atas_nama_user_id: kepala });
            expect((await langkah(id))[0]).toMatchObject({ diputuskan_oleh: String(wakil), atas_nama_user_id: String(kepala) });
        });
    });

    describe("RE-09 — first responder wins (acceptance)", () => {
        it("dua approver serentak (×10 putaran) -> tepat satu berhasil, yang kalah 409 beserta nama pemutus & waktunya; satu log & satu event", async () => {
            await aturan([{ role }]);
            for (let p = 0; p < 10; p += 1) {
                const id = await ajukan(pemohon);
                // Palang: `LOCK TABLE … IN SHARE MODE` menahan UPDATE keduanya sampai KEDUANYA menunggu, lalu
                // dilepas — balapan terjadi di setiap putaran, bukan kebetulan (pola uji regresi keputusan 68).
                const palang = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
                await palang.connect();
                await palang.query("BEGIN");
                await palang.query("LOCK TABLE approval_steps IN SHARE MODE");
                const janji = Promise.allSettled([a1, a2].map((u) => putuskan(layanan(), u, id, 1, "DISETUJUI")));
                for (let coba = 0; ; coba += 1) {
                    const { rows } = await palang.query<{ n: string }>("SELECT count(DISTINCT pid)::text AS n FROM pg_locks WHERE NOT granted AND pid <> pg_backend_pid()");
                    if (Number(rows[0]?.n) >= 2) break;
                    if (coba > 400) throw new Error("palang: kedua keputusan tidak tertahan");
                    await new Promise((r) => setTimeout(r, 25));
                }
                await palang.query("COMMIT");
                await palang.end();
                const hasil = await janji;
                const menang = hasil.filter((h) => h.status === "fulfilled");
                const kalah = hasil.filter((h): h is PromiseRejectedResult => h.status === "rejected");
                expect(menang, `putaran ${String(p)}`).toHaveLength(1);
                expect(kalah).toHaveLength(1);
                const pemenang = (await langkah(id))[0]?.diputuskan_oleh === String(a1) ? "Approver Satu" : "Approver Dua";
                expect(mapError(kalah[0]?.reason)).toMatchObject({
                    status: 409,
                    kode: "APPROVAL_ALREADY_DECIDED",
                    details: [
                        { field: "diputuskan_oleh", message: pemenang },
                        { field: "diputuskan_pada", message: SEKARANG.toISOString() },
                    ],
                });
                expect(await logKeputusan(id)).toHaveLength(1);
                expect(await event(id)).toHaveLength(1);
            }
        }, 60_000);

        it("layar basi: memutus langkah yang sudah lewat -> 409 (pemutusnya disebut); langkah yang belum aktif -> 409 tanpa details", async () => {
            await aturan([{ role }, { role }]);
            const id = await ajukan(pemohon);
            await putuskan(layanan(), a1, id, 1, "DISETUJUI");
            // a1 berhak di kedua langkah: `urutan` 1 yang basi TIDAK memutus langkah 2 tanpa sengaja.
            expect(await galat(putuskan(layanan(), a1, id, 1, "DISETUJUI"))).toMatchObject({
                kode: "APPROVAL_ALREADY_DECIDED",
                details: [{ field: "diputuskan_oleh", message: "Approver Satu" }, { field: "diputuskan_pada" }],
            });
            expect(await instansi(id)).toMatchObject({ status: "MENUNGGU", langkah_aktif: 2 });

            const id2 = await ajukan(pemohon);
            expect(await galat(putuskan(layanan(), a1, id2, 2, "DISETUJUI"))).toEqual({ kode: "APPROVAL_ALREADY_DECIDED", details: undefined });
        });
    });

    describe("penangan hasil per jenis (SDD-APR-17, BR-043, FR-10.2 A5)", () => {
        it("sebelumDisetujui hanya pada keputusan AKHIR; galatnya membatalkan persetujuan seluruhnya", async () => {
            const panggilan: string[] = [];
            let tolak = true;
            const penangan: PenanganHasil = {
                jenis: "PENGADAAN_BARANG",
                sebelumDisetujui: (_s, ref) => {
                    panggilan.push(`setuju:${String(ref)}`);
                    return tolak ? Promise.reject(new DomainError("ASSET_NOT_AVAILABLE", "Objek tidak lagi tersedia.")) : Promise.resolve();
                },
                setelahDitutup: (_s, ref, status) => {
                    panggilan.push(`tutup:${String(ref)}:${status}`);
                    return Promise.resolve();
                },
            };
            await aturan([{ role }, { role }]);
            const id = await ajukan(pemohon);
            const [inst] = await kueri<{ referensi_id: string }>(`SELECT referensi_id::text FROM approval_instances WHERE id = ${String(id)}`);
            const ref = inst?.referensi_id ?? "";

            await putuskan(layanan([penangan]), a1, id, 1, "DISETUJUI");
            expect(panggilan).toEqual([]); // bukan langkah terakhir

            expect(await galat(putuskan(layanan([penangan]), a2, id, 2, "DISETUJUI"))).toMatchObject({ kode: "ASSET_NOT_AVAILABLE" });
            expect(await instansi(id)).toMatchObject({ status: "MENUNGGU", langkah_aktif: 2 });
            expect((await langkah(id))[1]).toMatchObject({ keputusan: null });
            expect(await logKeputusan(id)).toHaveLength(1);

            tolak = false;
            expect((await putuskan(layanan([penangan]), a2, id, 2, "DISETUJUI")).status).toBe("DISETUJUI");
            expect(panggilan).toEqual([`setuju:${ref}`, `setuju:${ref}`]);

            const id2 = await ajukan(pemohon);
            await putuskan(layanan([penangan]), a1, id2, 1, "DITOLAK", "Tidak perlu");
            expect(panggilan.at(-1)).toMatch(/^tutup:\d+:DITOLAK$/);
        });

        it("penangan ganda untuk satu jenis ditolak saat dirakit", () => {
            const p = { jenis: "PENGADAAN_BARANG", sebelumDisetujui: () => Promise.resolve(), setelahDitutup: () => Promise.resolve() } as const;
            expect(() => layanan([p, p])).toThrow(/ganda/);
        });
    });

    describe("GET /approvals/pending — layanan (FR-10.2 langkah 2)", () => {
        it("hanya langkah wewenang pemanggil; pemohon & role lain tak melihat; penerima delegasi melihat dengan atas_nama", async () => {
            const kepala = await pengguna(await idRole("R-03"));
            const wakil = await pengguna(await idRole("R-02"));
            await aturan([{ role }]);
            const idRole1 = await ajukan(pemohon);
            // Aturan terpakai tak dapat dihapus (FK RESTRICT, PR-02-18) — dinonaktifkan.
            await kueri("UPDATE approval_rules SET status_aktif = false");
            await aturan([{ user: kepala }]);
            const idKepala = await ajukan(pemohon);

            const lihat = async (u: number) => (await layanan().pending(ctxDari(u), 1, 25)).rows.map((r) => [r.instance_id, r.atas_nama_user_id]);
            expect(await lihat(a1)).toEqual([[idRole1, null]]);
            expect(await lihat(kepala)).toEqual([[idKepala, null]]);
            expect(await lihat(pemohon)).toEqual([]);

            await kueri(`INSERT INTO approval_delegations (pemberi_id, penerima_id, mulai, selesai) VALUES (${String(kepala)}, ${String(wakil)}, '${HARI_INI}', '${HARI_INI}')`);
            expect(await lihat(wakil)).toEqual([[idKepala, kepala]]);
            expect(await lihat(kepala)).toEqual([]);

            await putuskan(layanan(), a2, idRole1, 1, "DISETUJUI");
            expect(await lihat(a1)).toEqual([]);
        });

        it("urut tenggat SLA terdekat lebih dulu; paginasi dengan total", async () => {
            await aturan([{ role }]);
            const ids = [await ajukan(pemohon), await ajukan(pemohon), await ajukan(pemohon)];
            await kueri(`UPDATE approval_steps SET sla_deadline = '2026-10-05T00:00:00Z' WHERE instance_id = ${String(ids[0])}`);
            // Tenggat bawaan ids[1] = 09.00 WIB + 8 jam kerja = 10.00Z hari ini; ids[2] dibuat lebih mendesak.
            await kueri(`UPDATE approval_steps SET sla_deadline = '2026-09-28T05:00:00Z' WHERE instance_id = ${String(ids[2])}`);
            const hal1 = await layanan().pending(ctxDari(a1), 1, 2);
            expect(hal1.total).toBe(3);
            expect(hal1.rows.map((r) => r.instance_id)).toEqual([ids[2], ids[1]]);
            expect((await layanan().pending(ctxDari(a1), 2, 2)).rows.map((r) => r.instance_id)).toEqual([ids[0]]);
        });
    });

    describe("kontrak HTTP (ID-01, SDD-AUTH-08, RE-09)", () => {
        let server: Server;
        let url: string;
        let sebagai = 0;

        beforeAll(async () => {
            const app = createApp({
                appBaseUrl: "https://sigm4.sekolah.test",
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
                setAuthContext(res, ctxDari(sebagai));
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

        async function decide(userId: number, id: number, body: unknown, kunci: string | null) {
            sebagai = userId;
            const res = await fetch(`${url}/approvals/${String(id)}/decide`, {
                method: "POST",
                headers: { "content-type": "application/json", ...(kunci === null ? {} : { "idempotency-key": kunci }) },
                body: JSON.stringify(body),
            });
            return { status: res.status, json: (await res.json()) as { data?: Record<string, unknown>; error?: { code: string; details?: unknown } } };
        }

        it("tanpa Idempotency-Key -> 400; kunci sama body sama -> respons tersimpan tanpa efek ganda; body beda -> 409 IDEMPOTENCY_KEY_REUSED", async () => {
            await aturan([{ role }]);
            const id = await ajukan(pemohon);
            const body = { urutan: 1, keputusan: "DISETUJUI" };
            expect((await decide(a1, id, body, null)).status).toBe(400);
            const kunci = randomUUID();
            const pertama = await decide(a1, id, body, kunci);
            expect(pertama).toMatchObject({ status: 200, json: { data: { status: "DISETUJUI" } } });
            expect(await decide(a1, id, body, kunci)).toEqual(pertama);
            expect(await logKeputusan(id)).toHaveLength(1);
            expect((await decide(a1, id, { ...body, catatan: "x" }, kunci)).json.error?.code).toBe("IDEMPOTENCY_KEY_REUSED");
        });

        it("409 APPROVAL_ALREADY_DECIDED membawa details pemutus; 403 bagi bukan pemutus; body cacat -> 400", async () => {
            await aturan([{ role }]);
            const id = await ajukan(pemohon);
            expect((await decide(a1, id, { urutan: 1, keputusan: "DISETUJUI" }, randomUUID())).status).toBe(200);
            const kalah = await decide(a2, id, { urutan: 1, keputusan: "DISETUJUI" }, randomUUID());
            expect(kalah).toMatchObject({
                status: 409,
                json: { error: { code: "APPROVAL_ALREADY_DECIDED", details: [{ field: "diputuskan_oleh", message: "Approver Satu" }, { field: "diputuskan_pada", message: SEKARANG.toISOString() }] } },
            });
            const lain = await pengguna(await idRole("R-03"));
            expect((await decide(lain, id, { urutan: 1, keputusan: "DISETUJUI" }, randomUUID())).status).toBe(403);
            expect((await decide(a1, id, { urutan: 0, keputusan: "SETUJU" }, randomUUID())).status).toBe(400);
        });
    });
});
