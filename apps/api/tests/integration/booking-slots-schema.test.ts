// Acceptance PR-02-16 — "Skema booking_slots + exclusion constraint + btree_gist"
// (CI-01, SDD-AVL-01…04) terhadap PostgreSQL NYATA: "dua slot bertumpang tindih
// → 23P01". Murni skema — SlotService milik PR-02-17 — sehingga uji menulis SQL
// mentah (pola m04-assets-schema.test.ts). Galat nyata juga dilewatkan ke
// ErrorMapper untuk membuktikan pemecahan constraint per jenis (keputusan 63)
// sampai ke kode 409 yang benar (CI-04).

import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mapError } from "../../src/shared/errors/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

let urut = 0;
function kodeUnik(awalan: string): string {
    urut += 1;
    return `${awalan}-${urut}`;
}

async function seedRuangan(): Promise<string> {
    const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('G', '${kodeUnik("GDG")}') RETURNING id::text`);
    const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${g?.id}, 'A', '${kodeUnik("ARA")}') RETURNING id::text`);
    const [r] = await kueri<{ id: string }>(
        `INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${a?.id}, 'R', '${kodeUnik("RG")}', 'KELAS') RETURNING id::text`,
    );
    if (r === undefined) throw new Error("Gagal menyisipkan ruangan uji");
    return r.id;
}

async function seedAset(roomId: string): Promise<string> {
    const [k] = await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('K', '${kodeUnik("KAT")}') RETURNING id::text`);
    const [a] = await kueri<{ id: string }>(`
        INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi)
        VALUES ('${kodeUnik("BRG")}', 'Proyektor', ${k?.id}, 2024, 'PEMBELIAN', ${roomId}, 'BAIK') RETURNING id::text
    `);
    if (a === undefined) throw new Error("Gagal menyisipkan aset uji");
    return a.id;
}

interface Slot {
    readonly jenis: "room" | "asset";
    readonly id: string;
    readonly rentang: string | null;
    readonly status?: "TENTATIVE" | "CONFIRMED" | "ACTIVE" | "RELEASED";
    readonly expiresAt?: string | null;
}

function sqlSlot(s: Slot): string {
    const status = s.status ?? "CONFIRMED";
    const expires = s.expiresAt === undefined ? (status === "TENTATIVE" ? "now() + interval '1 day'" : "NULL") : s.expiresAt === null ? "NULL" : `'${s.expiresAt}'`;
    const rentang = s.rentang === null ? "NULL" : `'${s.rentang}'`;
    return `INSERT INTO booking_slots (resource_type, resource_id, slot_range, status, origin, expires_at)
            VALUES ('${s.jenis}', ${s.id}, ${rentang}, '${status}', 'reservation', ${expires}) RETURNING id::text`;
}

const PAGI = "[2026-10-01 08:00+07, 2026-10-01 10:00+07)";
const TUMPANG = "[2026-10-01 09:00+07, 2026-10-01 11:00+07)";
const SIANG = "[2026-10-01 10:00+07, 2026-10-01 12:00+07)";

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM booking_slots");
    await kueri("DELETE FROM asset_movements");
    await kueri("DELETE FROM asset_condition_history");
    await kueri("DELETE FROM assets");
    await kueri("DELETE FROM asset_code_counters");
    await kueri("DELETE FROM asset_categories");
    await kueri("DELETE FROM rooms");
    await kueri("DELETE FROM areas");
    await kueri("DELETE FROM buildings");
}

describe.skipIf(!ADA_DB)("PR-02-16 — skema booking_slots + exclusion constraint (acceptance)", () => {
    let ruang: string;
    let aset: string;

    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await bersihkan();
        ruang = await seedRuangan();
        aset = await seedAset(ruang);
    });

    afterAll(bersihkan);

    it("ekstensi btree_gist aktif (SDD-01 §4.1; dinyalakan 0001)", async () => {
        expect(await kueri("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'")).toHaveLength(1);
    });

    it("CI-01: dua slot ASET bertumpang tindih -> 23P01 booking_slots_asset_no_overlap -> 409 ASSET_NOT_AVAILABLE", async () => {
        await kueri(sqlSlot({ jenis: "asset", id: aset, rentang: PAGI }));
        const galat = await kueri(sqlSlot({ jenis: "asset", id: aset, rentang: TUMPANG })).catch((e: unknown) => e);

        expect(galat).toMatchObject({ code: "23P01", constraint: "booking_slots_asset_no_overlap" });
        expect(mapError(galat)).toMatchObject({ status: 409, kode: "ASSET_NOT_AVAILABLE" });
    });

    it("CI-01: dua slot RUANGAN bertumpang tindih -> 23P01 booking_slots_room_no_overlap -> 409 RESERVATION_CONFLICT", async () => {
        await kueri(sqlSlot({ jenis: "room", id: ruang, rentang: PAGI }));
        const galat = await kueri(sqlSlot({ jenis: "room", id: ruang, rentang: TUMPANG })).catch((e: unknown) => e);

        expect(galat).toMatchObject({ code: "23P01", constraint: "booking_slots_room_no_overlap" });
        expect(mapError(galat)).toMatchObject({ status: 409, kode: "RESERVATION_CONFLICT" });
    });

    it.each([
        ["TENTATIVE", "CONFIRMED"],
        ["CONFIRMED", "ACTIVE"],
        ["ACTIVE", "TENTATIVE"],
    ] as const)("status aktif %s vs %s saling menghalangi", async (a, b) => {
        await kueri(sqlSlot({ jenis: "asset", id: aset, rentang: PAGI, status: a }));
        await expect(kueri(sqlSlot({ jenis: "asset", id: aset, rentang: TUMPANG, status: b }))).rejects.toMatchObject({ code: "23P01" });
    });

    it("SDD-AVL-02 half-open: 08:00–10:00 dan 10:00–12:00 TIDAK bentrok", async () => {
        await kueri(sqlSlot({ jenis: "asset", id: aset, rentang: PAGI }));
        await expect(kueri(sqlSlot({ jenis: "asset", id: aset, rentang: SIANG }))).resolves.toHaveLength(1);
    });

    it("slot RELEASED tidak menghalangi (predikat constraint)", async () => {
        await kueri(sqlSlot({ jenis: "asset", id: aset, rentang: PAGI, status: "RELEASED" }));
        await expect(kueri(sqlSlot({ jenis: "asset", id: aset, rentang: TUMPANG }))).resolves.toHaveLength(1);
    });

    it("sumber daya berbeda pada rentang sama tidak bentrok — termasuk ruangan & aset ber-id sama (SDD-AVL-01)", async () => {
        const asetLain = await seedAset(ruang);
        await kueri(sqlSlot({ jenis: "asset", id: aset, rentang: PAGI }));
        await expect(kueri(sqlSlot({ jenis: "asset", id: asetLain, rentang: PAGI }))).resolves.toHaveLength(1);

        // Ruangan dan aset ber-id SAMA (id eksplisit di luar jangkauan sequence) — yang diuji
        // benar-benar pembeda resource_type, bukan kebetulan id berbeda.
        const x = String(900_000_000 + urut);
        const [area] = await kueri<{ area_id: string }>(`SELECT area_id::text FROM rooms WHERE id = ${ruang}`);
        await kueri(`INSERT INTO rooms (id, area_id, nama, kode, jenis) VALUES (${x}, ${area?.area_id}, 'X', '${kodeUnik("RX")}', 'KELAS')`);
        await kueri(`INSERT INTO assets (id, kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi)
                     SELECT ${x}, '${kodeUnik("BX")}', 'X', category_id, 2024, 'PEMBELIAN', ${x}, 'BAIK' FROM assets WHERE id = ${aset}`);
        await kueri(sqlSlot({ jenis: "asset", id: x, rentang: PAGI }));
        await expect(kueri(sqlSlot({ jenis: "room", id: x, rentang: PAGI }))).resolves.toHaveLength(1);
    });

    it("SDD-AVL-02: batas tertutup '[]' ditolak CHECK slot_range_bounds", async () => {
        await expect(
            kueri(sqlSlot({ jenis: "asset", id: aset, rentang: "[2026-10-01 08:00+07, 2026-10-01 10:00+07]" })),
        ).rejects.toMatchObject({ code: "23514", constraint: "slot_range_bounds" });
    });

    it("BR-023b: TENTATIVE tanpa expires_at ditolak CHECK tentative_needs_ttl", async () => {
        await expect(
            kueri(sqlSlot({ jenis: "asset", id: aset, rentang: PAGI, status: "TENTATIVE", expiresAt: null })),
        ).rejects.toMatchObject({ code: "23514", constraint: "tentative_needs_ttl" });
    });

    it("slot tanpa rentang hanya sah bila RELEASED atau anak slot berulang (slot_range_required)", async () => {
        await expect(kueri(sqlSlot({ jenis: "asset", id: aset, rentang: null }))).rejects.toMatchObject({
            code: "23514",
            constraint: "slot_range_required",
        });
        await expect(kueri(sqlSlot({ jenis: "asset", id: aset, rentang: null, status: "RELEASED" }))).resolves.toHaveLength(1);
    });

    it("SDD-AVL-04: resource_id yang tidak ada ditolak trigger sebagai 23503 — pada INSERT dan UPDATE", async () => {
        await expect(kueri(sqlSlot({ jenis: "asset", id: "999999999", rentang: PAGI }))).rejects.toMatchObject({ code: "23503" });
        await expect(kueri(sqlSlot({ jenis: "room", id: "999999999", rentang: PAGI }))).rejects.toMatchObject({ code: "23503" });

        const [slot] = await kueri<{ id: string }>(sqlSlot({ jenis: "asset", id: aset, rentang: PAGI }));
        await expect(kueri(`UPDATE booking_slots SET resource_id = 999999999 WHERE id = ${slot?.id}`)).rejects.toMatchObject({
            code: "23503",
        });
    });

    it("CI-01 di bawah konkurensi: 20 transaksi serentak memesan rentang beririsan -> tepat SATU berhasil", async () => {
        const hasil = await Promise.allSettled(
            Array.from({ length: 20 }, async (_, i) => {
                const client = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
                await client.connect();
                try {
                    await client.query("BEGIN");
                    // Rentang digeser per menit: seluruhnya tetap beririsan satu sama lain.
                    await client.query(sqlSlot({ jenis: "asset", id: aset, rentang: `[2026-10-02 08:${String(i).padStart(2, "0")}+07, 2026-10-02 10:00+07)` }));
                    await client.query("COMMIT");
                } catch (e) {
                    await client.query("ROLLBACK");
                    throw e;
                } finally {
                    await client.end();
                }
            }),
        );

        expect(hasil.filter((h) => h.status === "fulfilled")).toHaveLength(1);
        const ditolak = hasil.filter((h): h is PromiseRejectedResult => h.status === "rejected");
        expect(ditolak).toHaveLength(19);
        expect(ditolak.every((h) => (h.reason as { code?: string }).code === "23P01")).toBe(true);
    });
});
