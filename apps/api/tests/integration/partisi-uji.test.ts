// Partisi `activity_logs` jendela uji (log phase-02 §7, 1 Oktober 2026): uji ber-FixedClock
// September 2026 tidak boleh kehilangan entri log hanya karena basis datanya dibuat pada
// bulan sesudahnya (migration 0008 = bulan berjalan + 3).

import { describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const ada = async (nama: string) => (await kueri(`SELECT 1 FROM pg_tables WHERE tablename = '${nama}'`)).length === 1;

describe.skipIf(!ADA_DB)("partisi activity_logs jendela uji", () => {
    it("`dbmate up` menyiapkan seluruh bulan jendela, termasuk yang sudah lewat (September 2026)", async () => {
        // Bulan yang tidak dipakai uji mana pun — aman dihapus tanpa membuang entri berkas lain.
        await kueri("DROP TABLE IF EXISTS activity_logs_2027_11");
        dbmate("up");
        expect(await ada("activity_logs_2027_11")).toBe(true);
        expect(await ada("activity_logs_2026_09")).toBe(true);
        expect(await ada("activity_logs_2026_01")).toBe(true);
    });

    it("AL-03b: partisi jendela tetap tertutup bagi akun aplikasi (REVOKE diulang per partisi)", async () => {
        const [hak] = await kueri<{ ubah: boolean; hapus: boolean }>(
            "SELECT has_table_privilege('sigm4_app', 'activity_logs_2027_11', 'UPDATE') AS ubah, has_table_privilege('sigm4_app', 'activity_logs_2027_11', 'DELETE') AS hapus",
        );
        expect(hak).toEqual({ ubah: false, hapus: false });
    });
});
