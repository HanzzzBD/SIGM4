// PR-02-07 — balapan `refresh` × `enroll/confirm` pada `refresh_tokens.otp_verified` (SDD-SESS-16), terhadap
// PostgreSQL nyata dengan DUA koneksi yang dijadwalkan deterministik (bukan `sleep` tebakan: uji menunggu sampai
// transaksi konfirmasi benar-benar tertahan kunci baris, baru melepas transaksi refresh).
//
// Kejadian yang dijaga: transaksi refresh menahan kunci token daun R1 dan menyisipkan R2 yang mewarisi
// `otp_verified = false`. Konfirmasi yang memakai SATU `UPDATE … WHERE family_id` memperbarui R1 tetapi tidak
// melihat R2 (dibuat setelah snapshot statement-nya) — sesi kehilangan `otp` pada refresh berikutnya. Terbukti pada
// probe PostgreSQL 15 sebelum perbaikan (logs/phase-02.md §7).

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTwoFactorRepository } from "../../src/modules/m01-auth/repositories/two-factor.repository.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const hex = () => `${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;

describe.skipIf(!ADA)("PR-02-07 — otp_verified: balapan refresh × enroll/confirm (PostgreSQL nyata)", () => {
    const idPengguna: number[] = [];

    beforeAll(() => {
        dbmate("up");
    });

    afterAll(async () => {
        if (idPengguna.length > 0) {
            const daftar = idPengguna.join(",");
            await kueri(`DELETE FROM refresh_tokens WHERE user_id IN (${daftar})`);
            await kueri(`DELETE FROM users WHERE id IN (${daftar})`);
        }
    });

    async function seedPengguna(): Promise<number> {
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Uji Balapan', 'balapan-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPBALAP${randomUUID().replace(/-/g, "").slice(0, 10)}',
                    (SELECT id FROM roles WHERE kode = 'R-05'), 'AKTIF', false)
            RETURNING id::text`);
        const id = Number(u?.id);
        idPengguna.push(id);
        return id;
    }

    async function seedToken(uid: number, familyId: string, opsi: { dicabut?: boolean } = {}): Promise<string> {
        const [r] = await kueri<{ id: string }>(`
            INSERT INTO refresh_tokens (user_id, family_id, token_hash, platform, expires_at, otp_verified, revoked_at)
            VALUES (${String(uid)}, '${familyId}', decode('${hex()}', 'hex'), 'ANDROID', now() + interval '1 day', false, ${opsi.dicabut === true ? "now()" : "NULL"})
            RETURNING id::text`);
        return r?.id ?? "0";
    }

    const ctxDari = (uid: number) => createAuthContext({ userId: uid, roleCode: "R-05", scopes: new Map() });
    const flag = (familyId: string) =>
        kueri<{ otp: boolean; rotated: boolean; dicabut: boolean }>(
            `SELECT otp_verified AS otp, (rotated_at IS NOT NULL) AS rotated, (revoked_at IS NOT NULL) AS dicabut FROM refresh_tokens WHERE family_id = '${familyId}' ORDER BY id`,
        );

    async function tungguTertahanKunci(): Promise<void> {
        for (let i = 0; i < 100; i++) {
            const [b] = await kueri<{ n: string }>(
                "SELECT count(*)::text AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
            );
            if (Number(b?.n) > 0) return;
            await new Promise((r) => setTimeout(r, 50));
        }
        throw new Error("transaksi konfirmasi tidak pernah tertahan kunci — skenario balapan tidak terbentuk");
    }

    it("refresh yang serentak: token hasil rotasi (daun) IKUT ditandai terverifikasi", async () => {
        const uid = await seedPengguna();
        const fam = randomUUID();
        const r1 = await seedToken(uid, fam);

        const refresh = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
        await refresh.connect();
        try {
            // transaksi refresh: kunci daun R1, rotasi, sisipkan R2 yang mewarisi otp_verified=false — BELUM commit
            await refresh.query("BEGIN");
            await refresh.query(`SELECT id FROM refresh_tokens WHERE id = ${r1} FOR UPDATE`);
            await refresh.query(`UPDATE refresh_tokens SET rotated_at = now() WHERE id = ${r1}`);
            await refresh.query(`INSERT INTO refresh_tokens (user_id, family_id, parent_id, token_hash, platform, expires_at, otp_verified)
                VALUES (${String(uid)}, '${fam}', ${r1}, decode('${hex()}', 'hex'), 'ANDROID', now() + interval '1 day', false)`);

            // konfirmasi serentak: harus tertahan kunci R1
            const konfirmasi = getDb()
                .transaction()
                .execute((tx) => createTwoFactorRepository(tx).tandaiSesiTerverifikasi(ctxDari(uid), fam));
            await tungguTertahanKunci();
            await refresh.query("COMMIT");
            await konfirmasi;
        } finally {
            await refresh.end();
        }

        // R1 (sudah dirotasi) DAN R2 (daun yang dipakai refresh berikutnya) — keduanya true
        expect(await flag(fam)).toEqual([
            { otp: true, rotated: true, dicabut: false },
            { otp: true, rotated: false, dicabut: false },
        ]);
    });

    it("hanya sesi milik pemanggil yang belum dicabut yang ditandai; sesi lain dan token tercabut tidak tersentuh", async () => {
        const uid = await seedPengguna();
        const lain = await seedPengguna();
        const fam = randomUUID();
        const famLain = randomUUID();
        await seedToken(uid, fam);
        await seedToken(uid, fam, { dicabut: true });
        await seedToken(lain, famLain);
        // keluarga MILIK ORANG LAIN dipanggil dengan ctx pengguna ini: tidak boleh berubah (scope own)
        const famMilikLain = randomUUID();
        await seedToken(lain, famMilikLain);

        await getDb().transaction().execute(async (tx) => {
            const repo = createTwoFactorRepository(tx);
            await repo.tandaiSesiTerverifikasi(ctxDari(uid), fam);
            await repo.tandaiSesiTerverifikasi(ctxDari(uid), famMilikLain);
        });

        expect(await flag(fam)).toEqual([
            { otp: true, rotated: false, dicabut: false },
            { otp: false, rotated: false, dicabut: true },
        ]);
        expect(await flag(famLain)).toEqual([{ otp: false, rotated: false, dicabut: false }]);
        expect(await flag(famMilikLain)).toEqual([{ otp: false, rotated: false, dicabut: false }]);
    });
});
