// Acceptance PR-03-04 — skema `stored_files` + `users.foto_file_id` (SDD-FS-02, SDD-09 §4.1,
// migration 0038) terhadap PostgreSQL NYATA. PR ini belum punya service penulis (`PR-03-25`),
// jadi uji menulis SQL mentah — pola `m04-assets-schema.test.ts`.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const SHA = "a".repeat(64);

describe.skipIf(!ADA_DB)("PR-03-04 — skema stored_files (acceptance)", () => {
    let pengguna = "";
    const berkas: string[] = [];

    beforeAll(async () => {
        dbmate("up");
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Uji Berkas', 'berkas-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPB${randomUUID().slice(0, 8)}',
                    (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false) RETURNING id::text`);
        pengguna = u?.id ?? "";
    });
    afterAll(async () => {
        await kueri(`UPDATE users SET foto_file_id = NULL WHERE id = ${pengguna}`);
        if (berkas.length > 0) await kueri(`DELETE FROM stored_files WHERE id IN (${berkas.join(",")})`);
        await kueri(`DELETE FROM users WHERE id = ${pengguna}`);
    });

    const sisip = async (kolom: Record<string, string>) => {
        const isi = { object_key: `'USER_PHOTO/2026/10/${randomUUID()}.png'`, mime: "'image/png'", ukuran: "1024", owner_type: "'USER_PHOTO'", uploaded_by: pengguna, ...kolom };
        const [b] = await kueri<{ id: string; scan_status: string; owner_id: string | null; checksum: string | null }>(
            `INSERT INTO stored_files (${Object.keys(isi).join(", ")}) VALUES (${Object.values(isi).join(", ")}) RETURNING id::text, scan_status::text, owner_id::text, checksum`,
        );
        if (b !== undefined) berkas.push(b.id);
        return b;
    };

    it("baris baru: PENDING, yatim (owner_id NULL), belum dikonfirmasi (checksum NULL)", async () => {
        expect(await sisip({})).toMatchObject({ scan_status: "PENDING", owner_id: null, checksum: null });
    });

    it("SDD-FS-06: object_key unik; owner_type wajib dan tertutup pada enum Bab 11.3", async () => {
        const kunci = `'USER_PHOTO/2026/10/${randomUUID()}.png'`;
        await sisip({ object_key: kunci });
        await expect(sisip({ object_key: kunci })).rejects.toThrow(/stored_files_object_key_key|duplicate key/);
        await expect(sisip({ owner_type: "NULL" })).rejects.toThrow(/null value|not-null/);
        await expect(sisip({ owner_type: "'FOTO_LAIN'" })).rejects.toThrow(/invalid input value for enum file_owner_type/);
    });

    it("CHECK: ukuran > 0 dan checksum SHA-256 heksadesimal 64 karakter", async () => {
        await expect(sisip({ ukuran: "0" })).rejects.toThrow(/stored_files_ukuran_check/);
        await expect(sisip({ checksum: "'bukan-sha'" })).rejects.toThrow(/stored_files_checksum_check/);
        expect(await sisip({ checksum: `'${SHA}'` })).toMatchObject({ checksum: SHA });
    });

    it("FR-01.4: users.foto_file_id merujuk stored_files; id tak ada ditolak FK", async () => {
        const b = await sisip({});
        await kueri(`UPDATE users SET foto_file_id = ${String(b?.id)} WHERE id = ${pengguna}`);
        expect((await kueri<{ f: string }>(`SELECT foto_file_id::text AS f FROM users WHERE id = ${pengguna}`))[0]?.f).toBe(b?.id);
        await expect(kueri(`UPDATE users SET foto_file_id = 999999999 WHERE id = ${pengguna}`)).rejects.toThrow(/users_foto_file_id_fkey/);
    });

    it("indeks parsial yatim & pindai-tertunda ada (SDD-FS-09, PR-03-05)", async () => {
        const idx = await kueri<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE tablename = 'stored_files' ORDER BY indexname");
        expect(idx.map((i) => i.indexname)).toEqual(expect.arrayContaining(["stored_files_orphan", "stored_files_pending_scan", "stored_files_owner_idx"]));
    });
});
