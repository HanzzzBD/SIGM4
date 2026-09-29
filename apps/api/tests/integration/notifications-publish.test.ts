// Acceptance PR-02-25 — "Skema notifikasi + penerbitan dari event domain" (FR-17.1,
// SDD-NTF-03/04/07/09, SDD-08 §4.1/§4.2a; keputusan 75, 78) terhadap PostgreSQL NYATA
// lewat OutboxDispatcher sungguhan: "Notifikasi terbit hanya setelah transaksi commit".

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UserService } from "../../src/modules/m02-users/index.js";
import { ApprovalService, DecisionService, RegistriPenyediaRincian } from "../../src/modules/m10-approval/index.js";
import { TEMPLAT, pasangKonsumenNotifikasi, templatUntuk } from "../../src/modules/m17-notifications/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { DomainError } from "../../src/shared/errors/index.js";
import { EventHandlerRegistry, OutboxDispatcher, publish } from "../../src/shared/events/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
/** Selasa 29 September 2026, 09.00 WIB. */
const clock = new FixedClock(new Date("2026-09-29T02:00:00Z"));
const audit = new AuditLogger({ clock });
const approval = new ApprovalService(getDb(), audit, clock);
const keputusan = new DecisionService(getDb(), audit, clock, approval, []);

const penggunaUji: number[] = [];
async function pengguna(kodeRole: string, status: "AKTIF" | "NONAKTIF" = "AKTIF", nama = "Uji Notif"): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('${nama}', 'ntf-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPNTF${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), '${status}', false) RETURNING id::text`);
    const id = Number(b?.id);
    penggunaUji.push(id);
    return id;
}
const idRole = async (kode: string) => Number((await kueri<{ id: string }>(`SELECT id::text FROM roles WHERE kode = '${kode}'`))[0]?.id);

const ctxDari = (userId: number, perms: readonly string[] = ["approval.decide"]): AuthContext =>
    createAuthContext({ userId, roleCode: "UJI", scopes: new Map<string, Scope>(perms.map((p) => [p, "all"])) });

async function aturan(langkah: readonly number[]): Promise<void> {
    const [r] = await kueri<{ id: string }>(`INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas) VALUES ('PENGADAAN_BARANG', '{}', 50) RETURNING id::text`);
    for (const [i, u] of langkah.entries()) {
        await kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_user_id, sla_jam) VALUES (${String(r?.id)}, ${String(i + 1)}, 'user', ${String(u)}, 8)`);
    }
}
let ref = 0;
async function ajukan(pemohon: number): Promise<number> {
    ref += 1;
    return (await withTransaction(ctxDari(pemohon), (s) => approval.createInstance(s, { jenis: "PENGADAAN_BARANG", referensiId: 600_000 + ref, pemohonId: pemohon, fakta: {} }), getDb())).instanceId;
}
const putuskan = (u: number, id: number, urutan: number, k: "DISETUJUI" | "DITOLAK" | "PERLU_REVISI", catatan: string | null = null) =>
    withTransaction(ctxDari(u), (s) => keputusan.putuskan(s, id, { urutan, keputusan: k, catatan }), getDb());

function dispatcher(rincian?: RegistriPenyediaRincian): OutboxDispatcher {
    const registry = new EventHandlerRegistry();
    const pelaku = createSystemAuthContext("uji-notifikasi");
    pasangKonsumenNotifikasi(registry, { db: getDb, clock, ctx: () => pelaku, rincian });
    return new OutboxDispatcher({ registry, clock, db: getDb(), logger: new Logger({ clock, tulis: () => undefined }) });
}

type Notif = { user_id: string; kode: string; jenis: string; isi: string; deep_link: string | null; wajib: boolean; referensi_jenis: string | null };
const notif = (kode?: string) =>
    kueri<Notif>(`SELECT user_id::text, kode, jenis::text, isi, deep_link, wajib, referensi_jenis FROM notifications ${kode === undefined ? "" : `WHERE kode = '${kode}'`} ORDER BY id`);
const penerima = async (kode: string) => (await notif(kode)).map((n) => Number(n.user_id)).sort((a, b) => a - b);

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM notifications");
    await kueri("DELETE FROM approval_steps");
    await kueri("DELETE FROM approval_instances");
    await kueri("DELETE FROM approval_rule_steps");
    await kueri("DELETE FROM approval_rules");
    await kueri("DELETE FROM approval_delegations");
    await kueri("DELETE FROM event_outbox");
    await kueri("DELETE FROM activity_logs WHERE modul IN ('m10-approval', 'm02-users')");
    await kueri("DELETE FROM user_import_jobs");
    if (penggunaUji.length > 0) await kueri(`DELETE FROM users WHERE id IN (${penggunaUji.splice(0).join(",")})`);
}

describe.skipIf(!ADA_DB)("PR-02-25 — skema notifikasi + penerbitan dari event domain (acceptance)", () => {
    let pemohon: number;
    let a: number;
    let b: number;
    let admin: number;
    let petugas: number;

    beforeAll(() => {
        dbmate("up");
    });
    beforeEach(async () => {
        await bersihkan();
        await kueri(`DELETE FROM holidays WHERE tanggal BETWEEN '2026-09-28' AND '2026-10-03'`);
        // Pemegang role penerima tetap: sisakan hanya milik uji ini yang AKTIF.
        await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE role_id IN (SELECT id FROM roles WHERE kode IN ('R-01', 'R-02')) AND status = 'AKTIF'`);
        pemohon = await pengguna("R-06", "AKTIF", "Pemohon");
        a = await pengguna("R-03", "AKTIF", "Approver A");
        b = await pengguna("R-03", "AKTIF", "Approver B");
        admin = await pengguna("R-01", "AKTIF", "Admin");
        petugas = await pengguna("R-02", "AKTIF", "Petugas");
        await pengguna("R-01", "NONAKTIF", "Admin Nonaktif");
    });
    afterAll(bersihkan);

    it("notifikasi HANYA lahir dari event yang sudah commit — transaksi yang di-rollback tak meninggalkan apa pun", async () => {
        await aturan([a]);
        const id = await ajukan(pemohon);
        await expect(
            withTransaction(ctxDari(a), async (s) => {
                await keputusan.putuskan(s, id, { urutan: 1, keputusan: "DISETUJUI", catatan: null });
                throw new Error("batal");
            }, getDb()),
        ).rejects.toThrow("batal");
        await dispatcher().drain();
        expect(await notif()).toEqual([]);

        await putuskan(a, id, 1, "DISETUJUI");
        expect(await notif()).toEqual([]); // belum ada sebelum worker memproses outbox
        await dispatcher().drain();
        expect(await notif("NT-02")).toHaveLength(1);
    });

    describe("M-10 (keputusan 75/78)", () => {
        it("NT-02 → pemohon: render generik + deep link linimasa; kelompok PERSETUJUAN, wajib", async () => {
            await aturan([a]);
            const id = await ajukan(pemohon);
            await putuskan(a, id, 1, "DISETUJUI");
            await dispatcher().drain();
            expect(await notif("NT-02")).toEqual([
                {
                    user_id: String(pemohon),
                    kode: "NT-02",
                    jenis: "PERSETUJUAN",
                    isi: `Pengajuan Pengadaan Barang #${String(600_000 + ref)} telah disetujui.`,
                    deep_link: `/persetujuan/${String(id)}`,
                    wajib: true,
                    referensi_jenis: "approval_instance",
                },
            ]);
        });

        it("penyedia rincian modul pengaju mengisi {nomor}/{objek}/{tanggal} dan deep link objek", async () => {
            await aturan([a]);
            const id = await ajukan(pemohon);
            await putuskan(a, id, 1, "DISETUJUI");
            const rincian = new RegistriPenyediaRincian().daftar({
                jenis: "PENGADAAN_BARANG",
                rincian: (_s, referensiId) => Promise.resolve({ label: "Pengadaan PGD-2026-0007", objek: "Proyektor", tanggal: "1 Oktober 2026", deepLink: `/pengadaan/${String(referensiId)}` }),
            });
            await dispatcher(rincian).drain();
            const [n] = await notif("NT-02");
            expect(n).toMatchObject({ isi: "Pengadaan PGD-2026-0007 untuk Proyektor pada 1 Oktober 2026 telah disetujui.", deep_link: `/pengadaan/${String(600_000 + ref)}` });
        });

        it("NT-05 → pemutus sah langkah berikutnya (termasuk penerima delegasi, SDD-APR-16); NT-03 membawa alasan", async () => {
            const c = await pengguna("R-03", "AKTIF", "Penerima Delegasi");
            await aturan([a, b]);
            await kueri(`INSERT INTO approval_delegations (pemberi_id, penerima_id, mulai, selesai) VALUES (${String(b)}, ${String(c)}, '2026-09-28', '2026-09-30')`);
            const id = await ajukan(pemohon);
            await putuskan(a, id, 1, "DISETUJUI");
            await dispatcher().drain();
            expect(await penerima("NT-05")).toEqual([c]);

            await putuskan(c, id, 2, "DITOLAK", "Anggaran habis");
            await dispatcher().drain();
            const [tolak] = await notif("NT-03");
            expect(tolak).toMatchObject({ user_id: String(pemohon), isi: `Pengajuan Pengadaan Barang #${String(600_000 + ref)} ditolak. Alasan: Anggaran habis.` });
        });

        it("NT-04 → pemohon dengan catatan revisi", async () => {
            await aturan([a]);
            const id = await ajukan(pemohon);
            await putuskan(a, id, 1, "PERLU_REVISI", "Lengkapi spesifikasi");
            await dispatcher().drain();
            expect((await notif("NT-04"))[0]?.isi).toContain("Catatan: Lengkapi spesifikasi.");
        });

        it("NT-47 fallback → Administrator + Petugas Sarpras AKTIF saja", async () => {
            await aturan([pemohon]); // konflik kepentingan → fallback (RE-11)
            await ajukan(pemohon);
            await dispatcher().drain();
            expect(await penerima("NT-47")).toEqual([admin, petugas].sort((x, y) => x - y));
        });

        async function sla(id: number, tindakan: string, tambahan: Record<string, unknown> = {}): Promise<void> {
            await withTransaction(ctxDari(admin), (s) => publish(s, { name: "ApprovalSlaBreached", aggregateType: "approval_instance", aggregateId: id, payload: { instance_id: id, urutan: 1, tindakan, ...tambahan } }), getDb());
        }

        it("SLA: REMIND → NT-06 (pemutus + Petugas) maks 1×/hari; ESCALATE → NT-07; EXHAUSTED → NT-47", async () => {
            await aturan([a]);
            const id = await ajukan(pemohon);
            await kueri("DELETE FROM event_outbox");
            await sla(id, "REMIND");
            await sla(id, "REMIND"); // hari WIB yang sama → ditelan dedupe harian
            await sla(id, "ESCALATE", { eskalasi_ke: b });
            await sla(id, "EXHAUSTED");
            await dispatcher().drain();
            expect(await penerima("NT-06")).toEqual([a, petugas].sort((x, y) => x - y));
            expect(await penerima("NT-07")).toEqual([b]);
            expect(await penerima("NT-47")).toEqual([admin, petugas].sort((x, y) => x - y));
        });

        it("payload menyimpang dari kontrak → handler gagal, event TIDAK ditandai selesai (dead letter bila berulang)", async () => {
            await aturan([a]);
            const id = await ajukan(pemohon);
            await kueri("DELETE FROM event_outbox");
            await sla(id, "ESCALATE"); // tanpa eskalasi_ke
            const hasil = await dispatcher().drain();
            expect(hasil.failed).toBe(1);
            // Field tambahan: hanya skema *strict* yang menolaknya — tanpa validasi, NT-06 akan terbit.
            await kueri("DELETE FROM event_outbox");
            await sla(id, "REMIND", { terminal: "hold_and_alert" });
            expect((await dispatcher().drain()).failed).toBe(1);
            const [e] = await kueri<{ processed_at: Date | null; attempts: number }>("SELECT processed_at, attempts FROM event_outbox WHERE event_name = 'ApprovalSlaBreached'");
            expect(e).toMatchObject({ processed_at: null, attempts: 1 });
            expect(await notif()).toEqual([]);
        });

        it("idempoten di bawah pengulangan outbox (SDD-EVT-07): event yang sama diproses dua kali → satu notifikasi per penerima", async () => {
            await aturan([a]);
            const id = await ajukan(pemohon);
            await putuskan(a, id, 1, "DISETUJUI");
            await dispatcher().drain();
            await kueri("UPDATE event_outbox SET processed_at = NULL"); // pengulangan setelah handler sempat commit
            await dispatcher().drain();
            expect(await notif("NT-02")).toHaveLength(1);
        });
    });

    describe("M-02 (keputusan 78)", () => {
        const users = () => new UserService(getDb(), audit, undefined, clock);
        const ctxAdmin = () => ctxDari(admin, ["user.update", "user.create"]);

        it("NT-40: role berubah → pengguna itu, nama role; status berubah → status; tanpa perubahan → tak ada", async () => {
            const target = await pengguna("R-05", "AKTIF", "Guru Target");
            const [u] = await kueri<{ nama: string; email: string; nip_nis: string }>(`SELECT nama, email, nip_nis FROM users WHERE id = ${String(target)}`);
            const input = { nama: u!.nama, email: u!.email, nipNis: u!.nip_nis, workUnitId: null, telepon: null };
            await users().update(ctxAdmin(), target, { ...input, roleId: await idRole("R-05") }); // sama
            await users().update(ctxAdmin(), target, { ...input, roleId: await idRole("R-06") });
            await users().updateStatus(ctxAdmin(), target, { status: "NONAKTIF", alasan: "Uji" });
            await dispatcher().drain();
            expect((await notif("NT-40")).map((n) => [Number(n.user_id), n.isi, n.deep_link])).toEqual([
                [target, "Role akun Anda diubah menjadi Staf / Tata Usaha.", "/profil"],
                [target, "Status akun Anda diubah menjadi Nonaktif.", "/profil"],
            ]);
        });

        it("NT-48: pembuatan siswa tanpa persetujuan wali DITOLAK (rollback), alarm tetap terbit di transaksi terpisah → Administrator", async () => {
            const nip = `NIS${randomUUID().slice(0, 10)}`;
            await expect(
                users().create(ctxAdmin(), { nama: "Siswa Tanpa Wali", email: `sw-${randomUUID().slice(0, 6)}@sekolah.sch.id`, nipNis: nip, roleId: await idRole("R-07"), workUnitId: null, telepon: null }),
            ).rejects.toBeInstanceOf(DomainError);
            expect(await kueri(`SELECT 1 FROM users WHERE nip_nis = '${nip}'`)).toHaveLength(0);
            await dispatcher().drain();
            expect(await notif("NT-48")).toEqual([
                expect.objectContaining({ user_id: String(admin), isi: "Akun siswa Siswa Tanpa Wali tidak dapat diaktifkan: persetujuan wali belum terekam (DP-02).", deep_link: "/pengguna" }),
            ]);
        });

        it("NT-52: impor selesai → pengunggah, dengan ringkasan pekerjaan", async () => {
            const [job] = await kueri<{ id: string }>(`INSERT INTO user_import_jobs (nama_berkas, file_hash, status, total_baris, baris_terproses, sukses, gagal, created_by)
                                                       VALUES ('besar.csv', '${randomUUID().replace(/-/g, "").repeat(2)}', 'SELESAI', 250, 250, 240, 10, ${String(admin)}) RETURNING id::text`);
            await withTransaction(ctxDari(admin), (s) => publish(s, { name: "UserImportCompleted", aggregateType: "user_import_job", aggregateId: Number(job?.id), payload: { job_id: Number(job?.id), oleh: admin } }), getDb());
            await dispatcher().drain();
            expect(await notif("NT-52")).toEqual([expect.objectContaining({ user_id: String(admin), isi: "Impor pengguna selesai: 240 berhasil, 10 gagal dari 250 baris.", deep_link: "/pengguna/impor" })]);
        });
    });

    it("worker memasang konsumen penerbit saat dimuat (SDD-08 §4.2a)", async () => {
        const { eventHandlers } = await import("../../src/worker/index.js");
        for (const nama of ["ApprovalDecided", "ApprovalFallbackRouted", "ApprovalSlaBreached", "UserImportCompleted", "UserAccountChanged", "GuardianConsentMissing"]) {
            expect(eventHandlers.handlersFor(nama).length, nama).toBeGreaterThan(0);
        }
    });

    it("SDD-08 §4.5/§5: setiap templat berkelompok sah; kode tanpa templat gagal keras", () => {
        const kelompok = { "NT-02": "PERSETUJUAN", "NT-06": "PERSETUJUAN", "NT-47": "PERSETUJUAN", "NT-40": "AKUN_SISTEM", "NT-48": "AKUN_SISTEM", "NT-52": "AKUN_SISTEM" };
        for (const [kode, jenis] of Object.entries(kelompok)) expect(TEMPLAT[kode]?.jenis).toBe(jenis);
        expect(() => templatUntuk("NT-99")).toThrow(/Templat notifikasi NT-99/);
    });
});
