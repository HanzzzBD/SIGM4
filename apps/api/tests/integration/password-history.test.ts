// Acceptance PR-02-31 — migration 0037 (SDD-SESS-19, keputusan 84b/d/e) terhadap PostgreSQL nyata:
// isi awal dari hash yang berlaku, trigger di setiap jalur tulis `password_hash`, pemangkasan 3.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const idUji: number[] = [];

async function pengguna(hash = "$argon2id$v=19$m=19456,t=2,p=1$uji$awal"): Promise<number> {
    const [b] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Uji Riwayat', 'riwayat-${randomUUID().slice(0, 8)}@sekolah.sch.id', '${hash}', 'NIPRWY${randomUUID().replace(/-/g, "").slice(0, 12)}',
                (SELECT id FROM roles WHERE kode = 'R-05'), 'AKTIF', false) RETURNING id::text`);
    idUji.push(Number(b?.id));
    return Number(b?.id);
}
const riwayat = async (id: number) =>
    (await kueri<{ password_hash: string }>(`SELECT password_hash FROM password_history WHERE user_id = ${String(id)} ORDER BY berlaku_sejak DESC, id DESC`)).map((r) => r.password_hash);

describe.skipIf(!ADA)("PR-02-31 — riwayat password (migration 0037)", () => {
    beforeAll(() => {
        dbmate("up");
    });
    afterAll(async () => {
        dbmate("up");
        if (idUji.length > 0) await kueri(`DELETE FROM users WHERE id IN (${idUji.join(",")})`);
    });

    it("akun yang sudah ada sebelum migration → riwayatnya diisi dari password_hash saat ini (84e)", async () => {
        dbmate("rollback");
        try {
            const id = await pengguna("$argon2id$v=19$m=19456,t=2,p=1$uji$lama");
            dbmate("up");
            expect(await riwayat(id)).toEqual(["$argon2id$v=19$m=19456,t=2,p=1$uji$lama"]);
        } finally {
            dbmate("up");
        }
    });

    it("trigger: INSERT dan setiap UPDATE password_hash tercatat; dipangkas menjadi 3 terbaru; UPDATE kolom lain tidak", async () => {
        const id = await pengguna("h1");
        for (const h of ["h2", "h3", "h4"]) await kueri(`UPDATE users SET password_hash = '${h}' WHERE id = ${String(id)}`);
        expect(await riwayat(id)).toEqual(["h4", "h3", "h2"]);
        await kueri(`UPDATE users SET nama = 'Uji Riwayat Ubah' WHERE id = ${String(id)}`);
        await kueri(`UPDATE users SET password_hash = 'h4' WHERE id = ${String(id)}`);
        expect(await riwayat(id)).toEqual(["h4", "h3", "h2"]);
    });

    it("menghapus akun ikut menghapus riwayatnya (CASCADE)", async () => {
        const id = await pengguna("hapus");
        await kueri(`DELETE FROM users WHERE id = ${String(id)}`);
        expect(await riwayat(id)).toEqual([]);
    });
});
