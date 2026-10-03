// Penjaga urutan id lingkungan uji (utang §10 log phase-02): sesudah `dbmate down`/`up`
// sequence yang lahir ulang tidak memulai id dari 1 lagi — id pengguna tidak dipakai ulang
// untuk orang berbeda di berkas uji berikutnya.

import { describe, expect, it } from "vitest";
import { dbmate, kueri, penjagaUrutan } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const nextval = async (seq: string) => BigInt((await kueri<{ v: string }>(`SELECT nextval('${seq}')::text AS v`))[0]?.v ?? "0");

describe.skipIf(!ADA_DB)("penjaga urutan id uji (dbmate down/up)", () => {
    it("sequence yang lahir ulang dinaikkan kembali — id berikutnya melampaui id sebelum `down`", async () => {
        const sebelum = await nextval("users_id_seq");
        penjagaUrutan.simpan();
        // Setara sequence yang di-DROP lalu dibuat ulang oleh `up`: mulai dari 1 lagi.
        await kueri("ALTER SEQUENCE users_id_seq RESTART WITH 1");
        penjagaUrutan.pulihkan();
        expect(await nextval("users_id_seq")).toBeGreaterThan(sebelum);
    });

    it("tidak pernah menurunkan sequence yang sudah lebih maju dari catatan", async () => {
        penjagaUrutan.simpan();
        const maju = (await nextval("users_id_seq")) + 1000n;
        await kueri(`SELECT setval('users_id_seq', ${String(maju)}, true)`);
        penjagaUrutan.pulihkan();
        expect(await nextval("users_id_seq")).toBe(maju + 1n);
    });

    it("jalur sungguhan: `dbmate rollback` men-DROP tabel + sequence-nya, `up` membuatnya ulang — id tetap naik", async () => {
        const sebelum = await nextval("asset_documents_id_seq");
        dbmate("rollback");
        try {
            expect(await kueri("SELECT 1 FROM pg_sequences WHERE sequencename = 'asset_documents_id_seq'")).toEqual([]);
        } finally {
            // Basis data uji dibagi seluruh berkas: skema SELALU dipulihkan, apa pun hasil pemeriksaannya.
            dbmate("up");
        }
        expect(await nextval("asset_documents_id_seq")).toBeGreaterThan(sebelum);
    }, 120_000);
});
