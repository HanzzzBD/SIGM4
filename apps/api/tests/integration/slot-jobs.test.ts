// Acceptance PR-02-37 (keputusan 88d): job `tentative-slot-expiry` (BR-023b) dan
// `slot-activation` (BR-005b, CI-05, SDD-AVL-11) terhadap PostgreSQL NYATA.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SlotService } from "../../src/shared/booking/index.js";
import type { RentangWaktu } from "../../src/shared/booking/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { registry } from "../../src/worker/index.js";
import {
    CRON_AKTIVASI_SLOT,
    CRON_KEDALUWARSA_SLOT,
    PEKERJAAN_AKTIVASI_SLOT,
    PEKERJAAN_KEDALUWARSA_SLOT,
    jalankanAktivasiSlot,
    jalankanKedaluwarsaSlot,
} from "../../src/worker/slot-jobs.js";
import { AKSI_RINGKASAN } from "../../src/worker/system-job.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
/** Kamis 1 Oktober 2026 08.00 WIB. */
const T0 = new Date("2026-10-01T01:00:00Z");
const jam = (n: number) => new Date(T0.getTime() + n * 3_600_000);
const PAGI: RentangWaktu = { mulai: jam(2), selesai: jam(4) };

let urut = 0;
const unik = (a: string) => `${a}${String((urut += 1))}${String(Date.now()).slice(-6)}`;
let ctx: AuthContext;
let ruang: string;
let kategori: string;
let petugas: number;
let sejakLog = 0;

async function seedAset(status = "TERSEDIA"): Promise<number> {
    const [a] = await kueri<{ id: string }>(`
        INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi, status, dapat_dipinjam)
        VALUES ('${unik("BRGJ")}', 'Proyektor', ${kategori}, 2024, 'PEMBELIAN', ${ruang}, 'BAIK', '${status}', true) RETURNING id::text`);
    return Number(a?.id);
}
const slot = (pada: Date) => new SlotService(new FixedClock(pada));
const dalamTx = <T>(fn: Parameters<typeof withTransaction<T>>[1]) => withTransaction(ctx, fn, getDb());
const pesanAset = (id: number, status: "CONFIRMED" | "TENTATIVE", rentang: RentangWaktu = PAGI, kedaluwarsa = jam(1)) =>
    dalamTx((s) => slot(T0).reserve(s, { sumberDaya: [{ jenis: "asset", id }], rentang, asal: "reservation", ...(status === "TENTATIVE" ? { status, kedaluwarsa } : { status }) }));
const statusAset = async (id: number) => (await kueri<{ status: string }>(`SELECT status::text FROM assets WHERE id = ${String(id)}`))[0]?.status;
const statusSlot = async (id: string) => (await kueri<{ status: string; expires_at: string | null }>(`SELECT status::text, expires_at::text FROM booking_slots WHERE id = ${id}`))[0];
const logStatus = () =>
    kueri<{ entitas_id: string; user_id: string | null; nilai_sebelum: { status: string }; nilai_sesudah: { status: string } }>(
        `SELECT entitas_id, user_id::text, nilai_sebelum, nilai_sesudah FROM activity_logs WHERE aksi = 'ASSET_STATUS_CHANGED' AND id > ${String(sejakLog)} ORDER BY id`,
    );
const ringkasan = (pekerjaan: string) =>
    kueri<{ hasil: string; nilai_sesudah: { diproses: number } }>(`SELECT hasil::text, nilai_sesudah FROM activity_logs WHERE aksi = '${AKSI_RINGKASAN}' AND nilai_sesudah->>'pekerjaan' = '${pekerjaan}' AND id > ${String(sejakLog)} ORDER BY id`);

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM booking_slots");
    await kueri("DELETE FROM event_outbox WHERE event_name = 'TentativeSlotExpired'");
    await kueri("DELETE FROM asset_movements");
    await kueri("DELETE FROM asset_condition_history");
    await kueri("DELETE FROM assets");
    await kueri("DELETE FROM asset_code_counters");
    await kueri("DELETE FROM asset_categories");
    await kueri("DELETE FROM rooms");
    await kueri("DELETE FROM areas");
    await kueri("DELETE FROM buildings");
    if (petugas !== undefined) await kueri(`DELETE FROM users WHERE id = ${String(petugas)}`);
}

describe.skipIf(!ADA_DB)("PR-02-37 — job slot (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });
    beforeEach(async () => {
        await bersihkan();
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Petugas Job Slot', '${unik("jslot")}@sekolah.sch.id', 'x', '${unik("NIPJS")}', (SELECT id FROM roles WHERE kode = 'R-02'), 'AKTIF', false) RETURNING id::text`);
        petugas = Number(u?.id);
        ctx = createAuthContext({ userId: petugas, roleCode: "R-02", scopes: new Map() });
        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('G', '${unik("G")}') RETURNING id::text`);
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${String(g?.id)}, 'A', '${unik("A")}') RETURNING id::text`);
        const [r] = await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${String(a?.id)}, 'R', '${unik("R")}', 'KELAS') RETURNING id::text`);
        ruang = r?.id ?? "";
        const [k] = await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('K', '${unik("K")}') RETURNING id::text`);
        kategori = k?.id ?? "";
        sejakLog = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
    });
    afterAll(bersihkan);

    it("terdaftar di worker: slot-activation tiap 5 menit, tentative-slot-expiry tiap 15 menit (Bab 26)", () => {
        expect(registry.get(PEKERJAAN_AKTIVASI_SLOT)?.cron).toBe(CRON_AKTIVASI_SLOT);
        expect(registry.get(PEKERJAAN_KEDALUWARSA_SLOT)?.cron).toBe(CRON_KEDALUWARSA_SLOT);
        expect([CRON_AKTIVASI_SLOT, CRON_KEDALUWARSA_SLOT]).toEqual(["*/5 * * * *", "*/15 * * * *"]);
    });

    describe("tentative-slot-expiry (BR-023b)", () => {
        it("hanya TENTATIVE yang melewati TTL dilepas; event TentativeSlotExpired per slot; jalan ulang tanpa efek (JOB-03)", async () => {
            const [habis] = await pesanAset(await seedAset(), "TENTATIVE", PAGI, jam(1));
            const [belum] = await pesanAset(await seedAset(), "TENTATIVE", PAGI, jam(3));
            const [pasti] = await pesanAset(await seedAset(), "CONFIRMED");
            const [ruangHabis] = await dalamTx((s) =>
                slot(T0).reserve(s, { sumberDaya: [{ jenis: "room", id: Number(ruang) }], rentang: PAGI, asal: "reservation", status: "TENTATIVE", kedaluwarsa: jam(1) }),
            );

            const hasil = await jalankanKedaluwarsaSlot(getDb(), new FixedClock(jam(2)));
            expect(hasil.diproses).toBe(2);
            expect(await statusSlot(String(habis?.id))).toEqual({ status: "RELEASED", expires_at: null });
            expect((await statusSlot(String(ruangHabis?.id)))?.status).toBe("RELEASED");
            expect((await statusSlot(String(belum?.id)))?.status).toBe("TENTATIVE");
            expect((await statusSlot(String(pasti?.id)))?.status).toBe("CONFIRMED");

            const ev = await kueri<{ slot_id: string; resource_type: string; origin: string }>(
                "SELECT payload->>'slot_id' AS slot_id, payload->>'resource_type' AS resource_type, payload->>'origin' AS origin FROM event_outbox WHERE event_name = 'TentativeSlotExpired' ORDER BY id",
            );
            expect(ev.map((e) => e.slot_id).sort()).toEqual([String(habis?.id), String(ruangHabis?.id)].sort());
            expect(ev.every((e) => e.origin === "reservation")).toBe(true);

            expect((await jalankanKedaluwarsaSlot(getDb(), new FixedClock(jam(2)))).diproses).toBe(0);
            expect(await kueri("SELECT 1 FROM event_outbox WHERE event_name = 'TentativeSlotExpired'")).toHaveLength(2);
            expect((await ringkasan(PEKERJAAN_KEDALUWARSA_SLOT)).map((r) => [r.hasil, r.nilai_sesudah.diproses])).toEqual([
                ["SUKSES", 2],
                ["SUKSES", 0],
            ]);
        });

        it("per batch: batas baris per transaksi dihormati; job mengulang sampai habis", async () => {
            for (let i = 0; i < 3; i += 1) await pesanAset(await seedAset(), "TENTATIVE", PAGI, jam(1));
            const satu = await dalamTx((s) => slot(jam(2)).lepasTentatifKedaluwarsa(s, 1));
            expect(satu).toHaveLength(1);
            // batas 1 per transaksi: dua sisanya hanya habis bila job mengulang.
            expect((await jalankanKedaluwarsaSlot(getDb(), new FixedClock(jam(2)), 1)).diproses).toBe(2);
            expect(await kueri("SELECT 1 FROM booking_slots WHERE status = 'TENTATIVE'")).toEqual([]);
        });
    });

    describe("slot-activation (BR-005b, CI-05)", () => {
        it("TERSEDIA → DIRESERVASI saat slot CONFIRMED mencakup kini; status penulis lain tak ditimpa; TENTATIVE & slot mendatang diabaikan", async () => {
            const a = await seedAset();
            const dipinjam = await seedAset("DIPINJAM");
            const mendatang = await seedAset();
            const tentatif = await seedAset();
            await pesanAset(a, "CONFIRMED");
            await pesanAset(dipinjam, "CONFIRMED");
            await pesanAset(mendatang, "CONFIRMED", { mulai: jam(10), selesai: jam(12) });
            await pesanAset(tentatif, "TENTATIVE", PAGI, jam(5));

            expect((await jalankanAktivasiSlot(getDb(), new FixedClock(jam(1)))).diproses).toBe(0);
            const hasil = await jalankanAktivasiSlot(getDb(), new FixedClock(jam(3)));
            expect(hasil).toMatchObject({ diproses: 1, rincian: { ditetapkan: 1, dikembalikan: 0 } });
            expect([await statusAset(a), await statusAset(dipinjam), await statusAset(mendatang), await statusAset(tentatif)]).toEqual(["DIRESERVASI", "DIPINJAM", "TERSEDIA", "TERSEDIA"]);
            expect(await logStatus()).toEqual([{ entitas_id: String(a), user_id: null, nilai_sebelum: { status: "TERSEDIA" }, nilai_sesudah: { status: "DIRESERVASI" } }]);
            // JOB-03 selama slot masih berlaku: tidak ada bolak-balik status maupun log tambahan.
            expect((await jalankanAktivasiSlot(getDb(), new FixedClock(jam(3.5)))).diproses).toBe(0);
            expect(await statusAset(a)).toBe("DIRESERVASI");
            expect(await logStatus()).toHaveLength(1);
        });

        it("slot berakhir tanpa serah terima → kembali TERSEDIA; jalan ulang tanpa perubahan maupun log (JOB-03)", async () => {
            const a = await seedAset();
            await pesanAset(a, "CONFIRMED");
            await jalankanAktivasiSlot(getDb(), new FixedClock(jam(3)));
            // Batas atas `[)`: tepat di akhir slot, slot tidak lagi mencakup kini.
            const sesudah = await jalankanAktivasiSlot(getDb(), new FixedClock(jam(4)));
            expect(sesudah).toMatchObject({ rincian: { ditetapkan: 0, dikembalikan: 1 } });
            expect(await statusAset(a)).toBe("TERSEDIA");
            expect((await jalankanAktivasiSlot(getDb(), new FixedClock(jam(4)))).diproses).toBe(0);
            expect((await logStatus()).map((l) => [l.nilai_sebelum.status, l.nilai_sesudah.status])).toEqual([
                ["TERSEDIA", "DIRESERVASI"],
                ["DIRESERVASI", "TERSEDIA"],
            ]);
        });
    });
});
