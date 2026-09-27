// Acceptance PR-02-20 — "Resolusi approver + delegasi + fallback" (RE-10 … RE-13,
// SDD-APR-04/13/14/16; keputusan 67) terhadap PostgreSQL NYATA: "Approver nonaktif →
// langkah dilewati beralasan `approver nonaktif`, lalu jalur fallback RE-11;
// `fallback_approver` kosong berarti Administrator".
//
// Langkah role memakai role UJI tersendiri agar himpunan pemegangnya terkendali.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApprovalService } from "../../src/modules/m10-approval/index.js";
import type { PengajuanBaru } from "../../src/modules/m10-approval/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { BusinessCalendarService } from "../../src/shared/calendar/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { DomainError } from "../../src/shared/errors/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
/** Senin 28 September 2026, 09.00 WIB — di dalam jam operasional. */
const SEKARANG = new Date("2026-09-28T02:00:00Z");
const HARI_INI = "2026-09-28";

const service = new ApprovalService(getDb(), new AuditLogger({ clock: new FixedClock(SEKARANG) }), new FixedClock(SEKARANG));

const penggunaUji: number[] = [];
const roleUji: number[] = [];

async function pengguna(roleId: number | string, status: "AKTIF" | "NONAKTIF" = "AKTIF"): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Uji Approval', 'apr-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPAPR${randomUUID().replace(/-/g, "").slice(0, 12)}',
                ${String(roleId)}, '${status}', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}

const idRole = async (kode: string): Promise<number> => Number((await kueri<{ id: string }>(`SELECT id::text FROM roles WHERE kode = '${kode}'`))[0]?.id);

async function roleBaru(): Promise<number> {
    const kode = `RT-${randomUUID().slice(0, 8)}`;
    const [b] = await kueri<{ id: string }>(`INSERT INTO roles (kode, nama) VALUES ('${kode}', 'Role Uji ${kode}') RETURNING id::text`);
    const id = Number(b?.id);
    roleUji.push(id);
    return id;
}

type LangkahUji = { role: number } | { user: number };

async function aturan(langkah: readonly LangkahUji[], opsi: { prioritas?: number; fallbackUser?: number; kondisi?: unknown } = {}): Promise<number> {
    const fallback = opsi.fallbackUser === undefined ? "NULL, NULL" : `'user', ${String(opsi.fallbackUser)}`;
    const [r] = await kueri<{ id: string }>(`
        INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas, fallback_approver_type, fallback_user_id)
        VALUES ('PENGADAAN_BARANG', '${JSON.stringify(opsi.kondisi ?? {})}', ${String(opsi.prioritas ?? 10)}, ${fallback}) RETURNING id::text`);
    for (const [i, l] of langkah.entries()) {
        const [tipe, role, user] = "role" in l ? ["role", l.role, "NULL"] : ["user", "NULL", l.user];
        await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_role_id, approver_user_id, sla_jam)
                     VALUES (${String(r?.id)}, ${String(i + 1)}, '${tipe}', ${String(role)}, ${String(user)}, ${String(8 * (i + 1))})`);
    }
    return Number(r?.id);
}

let refUrut = 0;
async function ajukan(pemohonId: number, fakta: PengajuanBaru["fakta"] = {}) {
    const ctx = createAuthContext({ userId: pemohonId, roleCode: "UJI", scopes: new Map() });
    refUrut += 1;
    const hasil = await withTransaction(ctx, (scope) => service.createInstance(scope, { jenis: "PENGADAAN_BARANG", referensiId: 900_000 + refUrut, pemohonId, fakta }), getDb());
    const langkah = await kueri<{ urutan: number; approver_type: string; approver_role_id: string | null; approver_user_id: string | null; keputusan: string | null; alasan_dilewati: string | null; sla_deadline: Date | null }>(
        `SELECT urutan, approver_type, approver_role_id::text, approver_user_id::text, keputusan, alasan_dilewati, sla_deadline
           FROM approval_steps WHERE instance_id = ${String(hasil.instanceId)} ORDER BY urutan`,
    );
    const [inst] = await kueri<{ langkah_aktif: number | null; pemohon_id: string; rule_id: string | null; rule_snapshot: Record<string, unknown>; status: string }>(
        `SELECT langkah_aktif, pemohon_id::text, rule_id::text, rule_snapshot, status FROM approval_instances WHERE id = ${String(hasil.instanceId)}`,
    );
    return { ...hasil, langkah, inst };
}

const tenggat = (jam: number): Promise<Date> => new BusinessCalendarService().addWorkingHours(getDb(), SEKARANG, jam);

async function bersihkan(): Promise<void> {
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

describe.skipIf(!ADA_DB)("PR-02-20 — resolusi approver, delegasi, fallback (acceptance)", () => {
    let pemohon: number;
    let rolePemohon: number;

    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await bersihkan();
        await kueri(`DELETE FROM holidays WHERE tanggal BETWEEN '2026-09-28' AND '2026-10-10'`);
        rolePemohon = await idRole("R-06");
        pemohon = await pengguna(rolePemohon);
    });

    afterAll(bersihkan);

    describe("pemilihan & snapshot (RE-04/05/06)", () => {
        it("tanpa aturan -> DEFAULT_RULE: satu langkah role Petugas Sarpras (R-02), SLA 24 jam kerja, rule_id NULL", async () => {
            await pengguna(await idRole("R-02"));
            const r = await ajukan(pemohon);
            expect(r.ruleId).toBeNull();
            expect(r.inst?.rule_id).toBeNull();
            expect(r.langkah).toHaveLength(1);
            expect(r.langkah[0]).toMatchObject({ urutan: 1, approver_type: "role", approver_role_id: String(await idRole("R-02")), keputusan: null });
            expect(r.langkah[0]?.sla_deadline).toEqual(await tenggat(24));
            expect(r.inst).toMatchObject({ langkah_aktif: 1, status: "MENUNGGU", pemohon_id: String(pemohon) });
        });

        it("aturan terpilih disalin UTUH ke rule_snapshot (RE-05): versi, kondisi, langkah, fallback, terminal", async () => {
            const role = await roleBaru();
            await pengguna(role);
            const id = await aturan([{ role }], { kondisi: { field: "total_value", op: "gt", value: 1000 } });
            const r = await ajukan(pemohon, { total_value: 5000 });
            expect(r.ruleId).toBe(id);
            expect(r.inst?.rule_snapshot).toEqual({
                rule_id: id,
                versi: 1,
                prioritas: 10,
                kondisi: { field: "total_value", op: "gt", value: 1000 },
                langkah: [{ urutan: 1, approver_type: "role", approver_role_id: role, approver_user_id: null, sla_jam: 8, on_sla_breach: "remind", eskalasi_ke: null }],
                fallback_approver: null,
                terminal_on_exhausted_escalation: "hold_and_alert",
            });
            expect(r.langkah[0]?.sla_deadline).toEqual(await tenggat(8));
        });

        it("fakta tak cocok -> aturan bawaan, bukan aturan yang kondisinya gagal", async () => {
            await pengguna(await idRole("R-02"));
            await aturan([{ role: await roleBaru() }], { kondisi: { field: "total_value", op: "gt", value: 1000 } });
            expect((await ajukan(pemohon, { total_value: 10 })).ruleId).toBeNull();
        });

        it("activity log: APPROVAL_INSTANCE_CREATED beserta aturan yang dipakai (AL-01)", async () => {
            const role = await roleBaru();
            await pengguna(role);
            const id = await aturan([{ role }]);
            const r = await ajukan(pemohon);
            const [log] = await kueri<{ aksi: string; nilai_sesudah: Record<string, unknown> }>(
                `SELECT aksi, nilai_sesudah FROM activity_logs WHERE modul = 'm10-approval' AND entitas = 'approval_instances' AND entitas_id = '${String(r.instanceId)}'`,
            );
            expect(log).toMatchObject({ aksi: "APPROVAL_INSTANCE_CREATED", nilai_sesudah: { rule_id: id, versi: 1 } });
        });
    });

    describe("RE-13 / SDD-APR-14 — approver nonaktif (acceptance)", () => {
        it("langkah user nonaktif dilewati beralasan `approver nonaktif`; langkah berikutnya aktif", async () => {
            const nonaktif = await pengguna(await idRole("R-03"), "NONAKTIF");
            const aktif = await pengguna(await idRole("R-03"));
            await aturan([{ user: nonaktif }, { user: aktif }]);
            const r = await ajukan(pemohon);
            expect(r.langkah.map((l) => [l.urutan, l.keputusan, l.alasan_dilewati])).toEqual([
                [1, "DILEWATI", "approver nonaktif"],
                [2, null, null],
            ]);
            expect(r.langkahAktif).toBe(2);
            expect(r.langkah[1]?.sla_deadline).toEqual(await tenggat(16));
            const lewat = await kueri<{ aksi: string; keterangan: string }>(`SELECT aksi, keterangan FROM activity_logs WHERE modul = 'm10-approval' AND aksi = 'APPROVAL_STEP_SKIPPED'`);
            expect(lewat).toEqual([{ aksi: "APPROVAL_STEP_SKIPPED", keterangan: "dilewati — approver nonaktif" }]);
        });

        it("langkah role tanpa satu pun pemegang aktif diperlakukan sama (SDD-APR-16)", async () => {
            const role = await roleBaru();
            await pengguna(role, "NONAKTIF");
            await aturan([{ role }, { user: await pengguna(await idRole("R-03")) }]);
            const r = await ajukan(pemohon);
            expect(r.langkah[0]).toMatchObject({ keputusan: "DILEWATI", alasan_dilewati: "approver nonaktif" });
            expect(r.langkahAktif).toBe(2);
        });

        it("seluruh langkah nonaktif + fallback kosong -> langkah fallback role ADMINISTRATOR, 24 jam kerja, alarm NT-47", async () => {
            await aturan([{ user: await pengguna(await idRole("R-03"), "NONAKTIF") }, { user: await pengguna(await idRole("R-02"), "NONAKTIF") }]);
            const r = await ajukan(pemohon);
            expect(r.langkah.map((l) => [l.urutan, l.keputusan, l.approver_type, l.approver_role_id])).toEqual([
                [1, "DILEWATI", "user", null],
                [2, "DILEWATI", "user", null],
                [3, null, "role", String(await idRole("R-01"))],
            ]);
            expect(r.langkahAktif).toBe(3);
            expect(r.inst?.status).toBe("MENUNGGU"); // BR-039a: tidak pernah disetujui otomatis
            expect(r.langkah[2]?.sla_deadline).toEqual(await tenggat(24));
            const ev = await kueri<{ event_name: string; payload: Record<string, unknown> }>(
                `SELECT event_name, payload FROM event_outbox WHERE aggregate_type = 'approval_instance' AND aggregate_id = '${String(r.instanceId)}'`,
            );
            expect(ev).toEqual([{ event_name: "ApprovalFallbackRouted", payload: { instance_id: r.instanceId, urutan_fallback: 3 } }]);
        });

        it("fallback_approver aturan dipakai bila ditetapkan (SDD-APR-13)", async () => {
            const cadangan = await pengguna(await idRole("R-03"));
            await aturan([{ user: await pengguna(await idRole("R-03"), "NONAKTIF") }], { fallbackUser: cadangan });
            const r = await ajukan(pemohon);
            expect(r.langkah[1]).toMatchObject({ urutan: 2, approver_type: "user", approver_user_id: String(cadangan), keputusan: null });
            expect(r.langkahAktif).toBe(2);
        });

        it("langkah fallback TIDAK dilewati meski pemutusnya pun tak tersedia — ditahan, bukan disetujui", async () => {
            const cadanganNonaktif = await pengguna(await idRole("R-03"), "NONAKTIF");
            await aturan([{ user: await pengguna(await idRole("R-03"), "NONAKTIF") }], { fallbackUser: cadanganNonaktif });
            const r = await ajukan(pemohon);
            expect(r.langkah).toHaveLength(2);
            expect(r.langkah[1]).toMatchObject({ keputusan: null });
            expect(r.inst).toMatchObject({ langkah_aktif: 2, status: "MENUNGGU" });

            // Aktivasi ulang (mis. setelah keputusan, PR-02-21) tetap pada fallback — tidak menumpuk fallback baru.
            const ctx = createAuthContext({ userId: pemohon, roleCode: "UJI", scopes: new Map() });
            expect(await withTransaction(ctx, (scope) => service.aktifkanBerikutnya(scope, r.instanceId), getDb())).toBe(2);
            expect(await kueri(`SELECT 1 FROM approval_steps WHERE instance_id = ${String(r.instanceId)}`)).toHaveLength(2);
        });
    });

    describe("RE-10 / BR-039 — konflik kepentingan", () => {
        it("langkah user = pemohon dilewati SAAT LAHIR, termasuk langkah yang belum aktif", async () => {
            const kepala = await pengguna(await idRole("R-03"));
            await aturan([{ user: kepala }, { user: pemohon }]);
            const r = await ajukan(pemohon);
            expect(r.langkah.map((l) => [l.keputusan, l.alasan_dilewati])).toEqual([
                [null, null],
                ["DILEWATI", "konflik kepentingan"],
            ]);
            expect(r.langkahAktif).toBe(1);
        });

        it("langkah role: pemohon satu-satunya pemegang -> dilewati; ada pemegang lain -> tetap berjalan", async () => {
            const role = await roleBaru();
            const pemohonBerole = await pengguna(role);
            const lanjut = await pengguna(await idRole("R-03"));
            await aturan([{ role }, { user: lanjut }]);
            const r = await ajukan(pemohonBerole);
            expect(r.langkah[0]).toMatchObject({ keputusan: "DILEWATI", alasan_dilewati: "konflik kepentingan" });
            expect(r.langkahAktif).toBe(2);

            await pengguna(role);
            const r2 = await ajukan(pemohonBerole);
            expect(r2.langkah[0]).toMatchObject({ keputusan: null });
            expect(r2.langkahAktif).toBe(1);
        });

        it("seluruh langkah konflik -> fallback (RE-11)", async () => {
            await aturan([{ user: pemohon }]);
            const r = await ajukan(pemohon);
            expect(r.langkah.map((l) => [l.keputusan, l.approver_role_id])).toEqual([
                ["DILEWATI", null],
                [null, String(await idRole("R-01"))],
            ]);
        });
    });

    describe("delegasi dalam resolusi (SDD-APR-16)", () => {
        it("pemegang tunggal role yang mendelegasikan kepada PEMOHON -> konflik, dilewati", async () => {
            const role = await roleBaru();
            const pimpinan = await pengguna(role);
            await kueri(`INSERT INTO approval_delegations (pemberi_id, penerima_id, mulai, selesai) VALUES (${String(pimpinan)}, ${String(pemohon)}, '${HARI_INI}', '${HARI_INI}')`);
            await aturan([{ role }, { user: await pengguna(await idRole("R-03")) }]);
            const r = await ajukan(pemohon);
            expect(r.langkah[0]).toMatchObject({ keputusan: "DILEWATI", alasan_dilewati: "konflik kepentingan" });
        });

        it("delegasi di luar rentang tanggal tidak berlaku", async () => {
            const role = await roleBaru();
            const pimpinan = await pengguna(role);
            await kueri(`INSERT INTO approval_delegations (pemberi_id, penerima_id, mulai, selesai) VALUES (${String(pimpinan)}, ${String(pemohon)}, '2026-10-01', '2026-10-05')`);
            await aturan([{ role }]);
            expect((await ajukan(pemohon)).langkah[0]).toMatchObject({ keputusan: null });
        });

        it("pemegang nonaktif yang mendelegasikan tidak menghidupkan langkah (RE-13 menang)", async () => {
            const nonaktif = await pengguna(await idRole("R-03"), "NONAKTIF");
            const pengganti = await pengguna(await idRole("R-03"));
            await kueri(`INSERT INTO approval_delegations (pemberi_id, penerima_id, mulai, selesai) VALUES (${String(nonaktif)}, ${String(pengganti)}, '${HARI_INI}', '${HARI_INI}')`);
            await aturan([{ user: nonaktif }, { user: pengganti }]);
            expect((await ajukan(pemohon)).langkah[0]).toMatchObject({ keputusan: "DILEWATI", alasan_dilewati: "approver nonaktif" });
        });
    });

    describe("POST /approvals/delegate — layanan (FR-10.2 A3)", () => {
        let pimpinan: number;
        let ctx: AuthContext;
        const delegasi = (penerimaId: number, mulai = HARI_INI, selesai = "2026-10-02") => service.delegasikan(ctx, { penerimaId, mulai, selesai });
        const galat = async (p: Promise<unknown>) => {
            const e = await p.then(
                () => undefined,
                (x: unknown) => x,
            );
            expect(e).toBeInstanceOf(DomainError);
            return { kode: (e as DomainError).kode, field: (e as DomainError).detail?.["field"] };
        };

        beforeEach(async () => {
            pimpinan = await pengguna(await idRole("R-03"));
            ctx = createAuthContext({ userId: pimpinan, roleCode: "PIMPINAN", scopes: new Map([["approval.delegate", "all"]]) });
        });

        it("tersimpan dengan pemberi = pemanggil, dan tercatat APPROVAL_DELEGATED", async () => {
            const wakil = await pengguna(await idRole("R-02"));
            const d = await delegasi(wakil);
            expect(d).toMatchObject({ pemberi_id: String(pimpinan), penerima_id: String(wakil), mulai: HARI_INI, selesai: "2026-10-02" });
            const log = await kueri<{ aksi: string }>(`SELECT aksi FROM activity_logs WHERE entitas = 'approval_delegations' AND entitas_id = '${d.id}'`);
            expect(log).toEqual([{ aksi: "APPROVAL_DELEGATED" }]);
        });

        it("penerima diri sendiri / tak berwenang (tanpa approval.decide) / nonaktif / tak ada -> 422 penerima_id", async () => {
            expect(await galat(delegasi(pimpinan))).toEqual({ kode: "VALIDATION_ERROR", field: "penerima_id" });
            expect(await galat(delegasi(await pengguna(await idRole("R-05"))))).toEqual({ kode: "VALIDATION_ERROR", field: "penerima_id" });
            expect(await galat(delegasi(await pengguna(await idRole("R-02"), "NONAKTIF")))).toEqual({ kode: "VALIDATION_ERROR", field: "penerima_id" });
            expect(await galat(delegasi(999_999_999))).toEqual({ kode: "VALIDATION_ERROR", field: "penerima_id" });
        });

        it("rentang yang sudah lewat -> 422 selesai", async () => {
            expect(await galat(delegasi(await pengguna(await idRole("R-02")), "2026-09-01", "2026-09-27"))).toEqual({ kode: "VALIDATION_ERROR", field: "selesai" });
        });

        it("rentang beririsan dengan delegasi sendiri -> 422 mulai (exclusion constraint), tanpa jejak log", async () => {
            const wakil = await pengguna(await idRole("R-02"));
            await delegasi(wakil, HARI_INI, "2026-10-02");
            expect(await galat(delegasi(wakil, "2026-10-02", "2026-10-05"))).toEqual({ kode: "VALIDATION_ERROR", field: "mulai" });
            // Rentang bersebelahan (tidak beririsan) sah.
            await expect(delegasi(wakil, "2026-10-03", "2026-10-05")).resolves.toBeDefined();
            const log = await kueri(`SELECT 1 FROM activity_logs WHERE aksi = 'APPROVAL_DELEGATED'`);
            expect(log).toHaveLength(2);
        });
    });
});
