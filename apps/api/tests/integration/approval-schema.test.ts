// Acceptance PR-02-18 — "Skema approval: approval_rules, instances, steps +
// rule_snapshot" (FR-10.1, Lampiran D.5, SDD-APR-03/04/12) terhadap PostgreSQL
// NYATA: "snapshot beku; perubahan aturan tidak menyentuh instance berjalan".
// Murni skema — evaluator/eksekusi milik PR-02-19…21 — sehingga uji menulis SQL
// mentah (pola m04-assets-schema.test.ts, booking-slots-schema.test.ts).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

let admin: string;
let rolePetugas: string;
let rolePimpinan: string;

async function buatAturan(opts: { kondisi?: string; fallback?: string } = {}): Promise<string> {
    const [r] = await kueri<{ id: string }>(`
        INSERT INTO approval_rules (jenis_pengajuan, kondisi, prioritas, created_by, updated_by
                                    ${opts.fallback === undefined ? "" : ", fallback_approver_type, fallback_role_id"})
        VALUES ('RESERVASI_ASET', '${opts.kondisi ?? '{"field":"requester_role","op":"eq","value":"Siswa/OSIS"}'}', 100, ${admin}, ${admin}
                ${opts.fallback === undefined ? "" : `, 'role', ${opts.fallback}`})
        RETURNING id::text`);
    if (r === undefined) throw new Error("Gagal menyisipkan aturan");
    await kueri(`
        INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_role_id, sla_jam, on_sla_breach)
        VALUES (${r.id}, 1, 'role', ${rolePetugas}, 24, 'remind')`);
    await kueri(`
        INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_role_id, sla_jam, on_sla_breach, eskalasi_ke)
        VALUES (${r.id}, 2, 'role', ${rolePimpinan}, 48, 'escalate', ${admin})`);
    return r.id;
}

/** Snapshot dirakit dari baris aturan HIDUP — bentuk yang akan dipakai PR-02-19/20 (SDD-APR-03). */
async function buatInstance(ruleId: string | null, referensiId: number): Promise<string> {
    const snapshot =
        ruleId === null
            ? `'{"kondisi":{},"versi":0,"steps":[{"order":1,"approver_type":"role","approver_role":"Petugas Sarana Prasarana","sla_hours":24}]}'::jsonb`
            : `(SELECT jsonb_build_object('rule_id', r.id, 'versi', r.versi, 'kondisi', r.kondisi,
                    'steps', (SELECT jsonb_agg(jsonb_build_object('order', s.urutan, 'approver_type', s.approver_type,
                                  'approver_role_id', s.approver_role_id, 'sla_hours', s.sla_jam, 'on_sla_breach', s.on_sla_breach)
                                  ORDER BY s.urutan) FROM approval_rule_steps s WHERE s.rule_id = r.id))
                 FROM approval_rules r WHERE r.id = ${ruleId})`;
    const [i] = await kueri<{ id: string }>(`
        INSERT INTO approval_instances (jenis_pengajuan, referensi_id, rule_id, rule_snapshot, langkah_aktif)
        VALUES ('RESERVASI_ASET', ${referensiId}, ${ruleId ?? "NULL"}, ${snapshot}, 1) RETURNING id::text`);
    if (i === undefined) throw new Error("Gagal menyisipkan instance");
    return i.id;
}

async function snapshotDari(instanceId: string): Promise<unknown> {
    return (await kueri<{ rule_snapshot: unknown }>(`SELECT rule_snapshot FROM approval_instances WHERE id = ${instanceId}`))[0]
        ?.rule_snapshot;
}

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM approval_steps");
    await kueri("DELETE FROM approval_instances");
    await kueri("DELETE FROM approval_rule_steps");
    await kueri("DELETE FROM approval_rules");
}

describe.skipIf(!ADA_DB)("PR-02-18 — skema approval + rule_snapshot (acceptance)", () => {
    beforeAll(async () => {
        dbmate("up");
        const roleIds = await Promise.all(
            ["R-02", "R-03"].map(async (k) => (await kueri<{ id: string }>(`SELECT id::text FROM roles WHERE kode = '${k}'`))[0]?.id ?? ""),
        );
        rolePetugas = roleIds[0] ?? "";
        rolePimpinan = roleIds[1] ?? "";
    });

    beforeEach(async () => {
        await bersihkan();
        await kueri("DELETE FROM users");
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Admin Approval', 'approval-uji@sekolah.sch.id', 'x', 'NIPAPPROVAL000001',
                    (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false) RETURNING id::text`);
        admin = u?.id ?? "";
    });

    afterAll(bersihkan);

    describe("snapshot beku (acceptance, SDD-APR-03, BR-040/RE-05)", () => {
        it("perubahan aturan — kondisi, versi, langkah dihapus/diganti, dinonaktifkan — TIDAK menyentuh snapshot instance berjalan", async () => {
            const rule = await buatAturan();
            const inst = await buatInstance(rule, 1);
            const sebelum = await snapshotDari(inst);

            await kueri(`UPDATE approval_rules SET kondisi = '{}', versi = versi + 1, status_aktif = false WHERE id = ${rule}`);
            await kueri(`DELETE FROM approval_rule_steps WHERE rule_id = ${rule} AND urutan = 2`);
            await kueri(`UPDATE approval_rule_steps SET sla_jam = 1 WHERE rule_id = ${rule}`);

            expect(await snapshotDari(inst)).toEqual(sebelum);
            expect(sebelum).toMatchObject({ versi: 1, steps: [{ order: 1 }, { order: 2, on_sla_breach: "escalate" }] });
        });

        it("rule_snapshot dan rule_id instance tidak dapat diubah (trigger), status tetap dapat berubah", async () => {
            const inst = await buatInstance(await buatAturan(), 1);

            await expect(kueri(`UPDATE approval_instances SET rule_snapshot = '{}' WHERE id = ${inst}`)).rejects.toMatchObject({ code: "23000" });
            await expect(kueri(`UPDATE approval_instances SET rule_id = NULL WHERE id = ${inst}`)).rejects.toMatchObject({ code: "23000" });
            await expect(
                kueri(`UPDATE approval_instances SET status = 'DISETUJUI', langkah_aktif = NULL, diselesaikan_pada = now() WHERE id = ${inst}`),
            ).resolves.toBeDefined();
        });

        it("aturan yang pernah dipakai instance tidak dapat dihapus (FK RESTRICT) — FR-10.1 AC versi aturan tetap terlacak", async () => {
            const rule = await buatAturan();
            await buatInstance(rule, 1);
            await expect(kueri(`DELETE FROM approval_rules WHERE id = ${rule}`)).rejects.toMatchObject({ code: "23503" });
        });

        it("DEFAULT_RULE (BR-036) adalah konstanta kode: instance tanpa rule_id sah", async () => {
            await expect(buatInstance(null, 1)).resolves.toBeDefined();
        });
    });

    describe("approval_rules / approval_rule_steps — Lampiran D.5", () => {
        it("kondisi bawaan {} (selalu cocok, D.1); terminal bawaan hold_and_alert; versi 1", async () => {
            const [r] = await kueri<Record<string, unknown>>(`
                INSERT INTO approval_rules (jenis_pengajuan, prioritas) VALUES ('PENGADAAN_BARANG', 10)
                RETURNING kondisi, terminal_on_exhausted_escalation, versi, status_aktif`);
            expect(r).toEqual({ kondisi: {}, terminal_on_exhausted_escalation: "hold_and_alert", versi: 1, status_aktif: true });
        });

        it.each([
            ["fallback tipe tanpa target", "fallback_approver_type, prioritas", "'role', 1", "approval_rules_fallback_sah"],
            ["target fallback tanpa tipe", "fallback_user_id, prioritas", "ADMIN, 1", "approval_rules_fallback_sah"],
            ["terminal di luar D.5", "terminal_on_exhausted_escalation, prioritas", "'abaikan', 1", "approval_rules_terminal_sah"],
            ["kondisi bukan objek", "kondisi, prioritas", "'[]', 1", "approval_rules_kondisi_objek"],
        ])("aturan ditolak: %s", async (_n, kolom, nilai, constraint) => {
            await expect(
                kueri(`INSERT INTO approval_rules (jenis_pengajuan, ${kolom}) VALUES ('RESERVASI_ASET', ${nilai.replace("ADMIN", admin)})`),
            ).rejects.toMatchObject({ code: "23514", constraint });
        });

        it.each([
            ["role berisi user", "'role', ROLE, ADMIN, 24, 'remind', NULL", "approval_rule_steps_approver_sah"],
            ["escalate tanpa tujuan", "'role', ROLE, NULL, 24, 'escalate', NULL", "approval_rule_steps_eskalasi_bertujuan"],
            ["on_sla_breach di luar D.5", "'role', ROLE, NULL, 24, 'abaikan', NULL", "approval_rule_steps_breach_sah"],
            ["SLA nol jam", "'role', ROLE, NULL, 0, 'remind', NULL", "approval_rule_steps_sla_positif"],
        ])("langkah aturan ditolak: %s", async (_n, nilai, constraint) => {
            const [r] = await kueri<{ id: string }>("INSERT INTO approval_rules (jenis_pengajuan, prioritas) VALUES ('RESERVASI_ASET', 1) RETURNING id::text");
            await expect(
                kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_role_id, approver_user_id, sla_jam, on_sla_breach, eskalasi_ke)
                       VALUES (${r?.id}, 1, ${nilai.replace("ROLE", rolePetugas).replace("ADMIN", admin)})`),
            ).rejects.toMatchObject({ code: "23514", constraint });
        });

        it("urutan langkah unik per aturan; langkah ikut terhapus bersama aturannya (belum dipakai)", async () => {
            const rule = await buatAturan();
            await expect(
                kueri(`INSERT INTO approval_rule_steps (rule_id, urutan, approver_type, approver_role_id, sla_jam) VALUES (${rule}, 1, 'role', ${rolePetugas}, 24)`),
            ).rejects.toMatchObject({ code: "23505" });
            await kueri(`DELETE FROM approval_rules WHERE id = ${rule}`);
            expect(await kueri(`SELECT id FROM approval_rule_steps WHERE rule_id = ${rule}`)).toHaveLength(0);
        });
    });

    describe("approval_instances / approval_steps — SDD-APR-04/12", () => {
        it("paling banyak SATU instance MENUNGGU per pengajuan; setelah selesai, instance baru boleh", async () => {
            const rule = await buatAturan();
            const inst = await buatInstance(rule, 7);
            await expect(buatInstance(rule, 7)).rejects.toMatchObject({ code: "23505" });

            await kueri(`UPDATE approval_instances SET status = 'PERLU_REVISI', langkah_aktif = NULL, diselesaikan_pada = now() WHERE id = ${inst}`);
            await expect(buatInstance(rule, 7)).resolves.toBeDefined();
        });

        it("status dan diselesaikan_pada konsisten (MENUNGGU ⇔ belum selesai)", async () => {
            const inst = await buatInstance(null, 1);
            await expect(kueri(`UPDATE approval_instances SET diselesaikan_pada = now() WHERE id = ${inst}`)).rejects.toMatchObject({
                code: "23514",
                constraint: "approval_instances_selesai_konsisten",
            });
            await expect(kueri(`UPDATE approval_instances SET status = 'DITOLAK' WHERE id = ${inst}`)).rejects.toMatchObject({ code: "23514" });
        });

        it("langkah menyimpan TARGET (role) terpisah dari PEMUTUS; keputusan manusia wajib berpelaku & berwaktu", async () => {
            const inst = await buatInstance(null, 1);
            const [s] = await kueri<{ id: string }>(`
                INSERT INTO approval_steps (instance_id, urutan, approver_type, approver_role_id) VALUES (${inst}, 1, 'role', ${rolePetugas})
                RETURNING id::text`);

            await expect(kueri(`UPDATE approval_steps SET keputusan = 'DISETUJUI', diputuskan_pada = now() WHERE id = ${s?.id}`)).rejects.toMatchObject({
                constraint: "approval_steps_pemutus_ada",
            });
            await expect(kueri(`UPDATE approval_steps SET keputusan = 'DISETUJUI', diputuskan_oleh = ${admin} WHERE id = ${s?.id}`)).rejects.toMatchObject({
                constraint: "approval_steps_diputuskan_konsisten",
            });
            await expect(
                kueri(`UPDATE approval_steps SET keputusan = 'DISETUJUI', diputuskan_oleh = ${admin}, diputuskan_pada = now() WHERE id = ${s?.id}`),
            ).resolves.toBeDefined();
        });

        it("SDD-APR-12: langkah dilewati tetap tercatat — wajib keputusan DILEWATI + alasan, tanpa pemutus manusia", async () => {
            const inst = await buatInstance(null, 1);
            const sisip = (kolom: string, nilai: string) =>
                kueri(`INSERT INTO approval_steps (instance_id, urutan, approver_type, approver_role_id, ${kolom})
                       VALUES (${inst}, ${Math.floor(Math.random() * 1e6) + 2}, 'role', ${rolePetugas}, ${nilai})`);

            await expect(sisip("dilewati, keputusan, diputuskan_pada, alasan_dilewati", "true, NULL, NULL, 'x'")).rejects.toMatchObject({ constraint: "approval_steps_dilewati_konsisten" });
            await expect(sisip("dilewati, keputusan, diputuskan_pada", "true, 'DILEWATI', now()")).rejects.toMatchObject({ constraint: "approval_steps_dilewati_beralasan" });
            await expect(
                sisip("dilewati, keputusan, diputuskan_pada, alasan_dilewati", "true, 'DILEWATI', now(), 'konflik kepentingan'"),
            ).resolves.toBeDefined();
        });
    });
});
