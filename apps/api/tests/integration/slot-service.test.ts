// Acceptance PR-02-17 — "SlotService: reservasi, pelepasan, aktivasi + pemetaan
// 409" (CI-02, CI-03, SDD-AVL-04/05, SDD-SYS-10) terhadap PostgreSQL NYATA:
// "100 permintaan serentak → tepat satu berhasil". Kunci baris, NOWAIT, SKIP
// LOCKED, dan exclusion constraint tidak dapat dibuktikan lewat tiruan.

import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SlotService } from "../../src/shared/booking/index.js";
import type { RentangWaktu, SumberDaya } from "../../src/shared/booking/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { createDb, getDb, withTransaction } from "../../src/shared/db/index.js";
import { mapError } from "../../src/shared/errors/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const SEKARANG = new Date("2026-09-26T00:00:00Z");
const BESOK = new Date("2026-09-27T00:00:00Z");
const PAGI: RentangWaktu = { mulai: new Date("2026-10-01T01:00:00Z"), selesai: new Date("2026-10-01T03:00:00Z") };
const TUMPANG: RentangWaktu = { mulai: new Date("2026-10-01T02:00:00Z"), selesai: new Date("2026-10-01T04:00:00Z") };

let urut = 0;
const unik = (a: string) => `${a}${(urut += 1)}`;

let ctx: AuthContext;
let ruang: string;
let kategori: string;

const service = new SlotService(new FixedClock(SEKARANG));

async function seedAset(opts: Partial<Record<"kondisi" | "status", string>> & { dapat?: boolean; siswa?: boolean; dihapuskan?: boolean } = {}): Promise<number> {
    const [a] = await kueri<{ id: string }>(`
        INSERT INTO assets (kode_barang, nama, category_id, tahun_perolehan, sumber_perolehan, room_id, kondisi, status,
                            dapat_dipinjam, boleh_dipinjam_siswa, dihapuskan)
        VALUES ('${unik("BRG")}', 'Proyektor', ${kategori}, 2024, 'PEMBELIAN', ${ruang}, '${opts.kondisi ?? "BAIK"}',
                '${opts.status ?? "TERSEDIA"}', ${opts.dapat ?? true}, ${opts.siswa ?? false}, ${opts.dihapuskan ?? false})
        RETURNING id::text`);
    return Number(a?.id);
}

const aset = (id: number): SumberDaya => ({ jenis: "asset", id });
const dalamTx = <T>(fn: Parameters<typeof withTransaction<T>>[1]) => withTransaction(ctx, fn, getDb());
const statusSlot = async (id: string) => (await kueri<{ status: string }>(`SELECT status FROM booking_slots WHERE id = ${id}`))[0]?.status;

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

describe.skipIf(!ADA_DB)("PR-02-17 — SlotService (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await bersihkan();
        await kueri("DELETE FROM users");
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Petugas Slot', '${unik("slot")}@sekolah.sch.id', 'x', '${unik("NIPSLOT")}',
                    (SELECT id FROM roles WHERE kode = 'R-02'), 'AKTIF', false) RETURNING id::text`);
        ctx = createAuthContext({ userId: Number(u?.id), roleCode: "PETUGAS", scopes: new Map() });
        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('G', '${unik("G")}') RETURNING id::text`);
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${g?.id}, 'A', '${unik("A")}') RETURNING id::text`);
        const [r] = await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis) VALUES (${a?.id}, 'R', '${unik("R")}', 'KELAS') RETURNING id::text`);
        ruang = r?.id ?? "";
        const [k] = await kueri<{ id: string }>(`INSERT INTO asset_categories (nama, kode) VALUES ('K', '${unik("K")}') RETURNING id::text`);
        kategori = k?.id ?? "";
    });

    afterAll(bersihkan);

    describe("reserve() — sumber daya eksplisit", () => {
        it("memesan aset: slot CONFIRMED tersimpan dengan rentang half-open dan pembuatnya", async () => {
            const id = await seedAset();
            const [slot] = await dalamTx((s) => service.reserve(s, { sumberDaya: [aset(id)], rentang: PAGI, asal: "reservation", status: "CONFIRMED" }));

            expect(slot).toMatchObject({ resource_type: "asset", resource_id: String(id), status: "CONFIRMED", origin: "reservation" });
            expect(slot?.slot_range).toMatch(/^\[.*\)$/);
            const [baris] = await kueri<{ created_by: string }>(`SELECT created_by::text FROM booking_slots WHERE id = ${slot?.id}`);
            expect(baris?.created_by).toBe(String(ctx.userId));
        });

        it("bentrok aset -> 409 ASSET_NOT_AVAILABLE; bentrok ruangan -> 409 RESERVATION_CONFLICT (CI-04 lewat ErrorMapper)", async () => {
            const id = await seedAset();
            const r = { jenis: "room" as const, id: Number(ruang) };
            await dalamTx((s) => service.reserve(s, { sumberDaya: [aset(id), r], rentang: PAGI, asal: "reservation", status: "CONFIRMED" }));

            const gAset = await dalamTx((s) => service.reserve(s, { sumberDaya: [aset(id)], rentang: TUMPANG, asal: "reservation", status: "CONFIRMED" })).catch((e: unknown) => e);
            const gRuang = await dalamTx((s) => service.reserve(s, { sumberDaya: [r], rentang: TUMPANG, asal: "reservation", status: "CONFIRMED" })).catch((e: unknown) => e);
            expect(mapError(gAset)).toMatchObject({ status: 409, kode: "ASSET_NOT_AVAILABLE" });
            expect(mapError(gRuang)).toMatchObject({ status: 409, kode: "RESERVATION_CONFLICT" });
        });

        it("ALL-OR-NOTHING: satu sumber daya bentrok -> tak satu pun slot dari permintaan itu tersimpan", async () => {
            const a1 = await seedAset();
            const a2 = await seedAset();
            await dalamTx((s) => service.reserve(s, { sumberDaya: [aset(a2)], rentang: PAGI, asal: "reservation", status: "CONFIRMED" }));

            await expect(
                dalamTx((s) => service.reserve(s, { sumberDaya: [aset(a1), aset(a2)], rentang: TUMPANG, asal: "reservation", status: "CONFIRMED" })),
            ).rejects.toBeDefined();
            expect(await kueri(`SELECT id FROM booking_slots WHERE resource_id = ${a1}`)).toHaveLength(0);
        });

        it("rentang terbalik/kosong, TTL sudah lewat, dan sumber daya tak ada -> VALIDATION_ERROR (bukan 500)", async () => {
            const id = await seedAset();
            const kosong: RentangWaktu = { mulai: PAGI.mulai, selesai: PAGI.mulai };
            await expect(dalamTx((s) => service.reserve(s, { sumberDaya: [aset(id)], rentang: kosong, asal: "reservation", status: "CONFIRMED" }))).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
            await expect(
                dalamTx((s) => service.reserve(s, { sumberDaya: [aset(id)], rentang: PAGI, asal: "reservation", status: "TENTATIVE", kedaluwarsa: SEKARANG })),
            ).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
            await expect(dalamTx((s) => service.reserve(s, { sumberDaya: [aset(999_999_999)], rentang: PAGI, asal: "reservation", status: "CONFIRMED" }))).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
            await expect(
                dalamTx((s) => service.reserve(s, { sumberDaya: [{ jenis: "room", id: 999_999_999 }], rentang: PAGI, asal: "reservation", status: "CONFIRMED" })),
            ).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
        });

        it("SDD-AVL-05 NOWAIT: aset yang sedang dikunci transaksi lain ditolak SEKETIKA -> ASSET_NOT_AVAILABLE (bukan antre)", async () => {
            const id = await seedAset();
            let lepas!: () => void;
            const tahan = new Promise<void>((r) => (lepas = r));
            let terkunci!: () => void;
            const sudahTerkunci = new Promise<void>((r) => (terkunci = r));

            const pemegang = dalamTx(async (s) => {
                await service.reserve(s, { sumberDaya: [aset(id)], rentang: PAGI, asal: "reservation", status: "CONFIRMED" });
                terkunci();
                await tahan;
            });
            await sudahTerkunci;

            const mulai = performance.now();
            const galat = await dalamTx((s) => service.reserve(s, { sumberDaya: [aset(id)], rentang: { mulai: new Date("2026-11-01T00:00:00Z"), selesai: new Date("2026-11-01T01:00:00Z") }, asal: "reservation", status: "CONFIRMED" })).catch((e: unknown) => e);
            const lama = performance.now() - mulai;
            lepas();
            await pemegang;

            expect(galat).toMatchObject({ kode: "ASSET_NOT_AVAILABLE" });
            expect(lama).toBeLessThan(2000);
        });

        it("ACCEPTANCE: 100 permintaan serentak atas aset & rentang yang sama -> tepat SATU berhasil, 99 menjadi 409", async () => {
            const id = await seedAset();
            const hasil = await Promise.allSettled(
                Array.from({ length: 100 }, () =>
                    dalamTx((s) => service.reserve(s, { sumberDaya: [aset(id)], rentang: PAGI, asal: "reservation", status: "TENTATIVE", kedaluwarsa: BESOK })),
                ),
            );

            expect(hasil.filter((h) => h.status === "fulfilled")).toHaveLength(1);
            const ditolak = hasil.filter((h): h is PromiseRejectedResult => h.status === "rejected");
            expect(ditolak).toHaveLength(99);
            expect(ditolak.every((h) => mapError(h.reason).status === 409)).toBe(true);
            expect(await kueri(`SELECT id FROM booking_slots WHERE resource_id = ${id}`)).toHaveLength(1);
        }, 60_000);
    });

    // Regresi keputusan 68 (log phase-02 §7): ruangan semula tidak dikunci, sehingga sisipan
    // serentak yang beririsan saling menunggu di exclusion constraint dan sebagian pihak kalah
    // berakhir 40P01 (deadlock → 500). Balapan dipaksa DETERMINISTIK dengan palang: koneksi
    // terpisah memegang `LOCK TABLE booking_slots IN SHARE MODE` (bentrok dengan RowExclusiveLock
    // milik INSERT) sampai SELURUH transaksi menunggu, lalu melepasnya sekaligus. Tanpa kunci
    // ruangan, 20 INSERT berangkat pada saat yang sama; dengan kunci, satu menunggu di tabel dan
    // sisanya antre di baris ruangan. Pool KHUSUS 25: pool bawaan (10) tak sanggup 20 transaksi.
    describe("reserve() ruangan — konkurensi deterministik (SDD-AVL-06)", () => {
        const PARALEL = 20;
        const PUTARAN = 10;

        const ruangBaru = async (): Promise<number> =>
            Number(
                (
                    await kueri<{ id: string }>(`
                INSERT INTO rooms (area_id, nama, kode, jenis)
                SELECT area_id, 'R', '${unik("RK")}', 'KELAS' FROM rooms WHERE id = ${ruang} RETURNING id::text`)
                )[0]?.id,
            );

        /** Menjalankan `jalan` di balik palang; palang dilepas saat `PARALEL` backend lain sedang menunggu kunci. */
        async function diBalikPalang<T>(palang: pg.Client, jalan: () => Promise<T>): Promise<T> {
            await palang.query("BEGIN");
            await palang.query("LOCK TABLE booking_slots IN SHARE MODE");
            const janji = jalan();
            try {
                for (let coba = 0; ; coba += 1) {
                    const { rows } = await palang.query<{ n: string }>(
                        "SELECT count(DISTINCT pid)::text AS n FROM pg_locks WHERE NOT granted AND pid <> pg_backend_pid()",
                    );
                    if (Number(rows[0]?.n) >= PARALEL) break;
                    if (coba > 400) throw new Error(`Hanya ${rows[0]?.n ?? "0"} transaksi yang tertahan palang.`);
                    await new Promise((r) => setTimeout(r, 25));
                }
            } finally {
                await palang.query("COMMIT");
            }
            return janji;
        }

        it(`${String(PARALEL)} reservasi paralel beririsan × ${String(PUTARAN)} putaran -> tiap putaran tepat SATU berhasil, SELURUH yang kalah 23P01 → 409 RESERVATION_CONFLICT (tanpa 40P01)`, async () => {
            const db = createDb({ connectionString: process.env["DATABASE_URL"] ?? "", poolSize: 25 });
            const palang = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
            await palang.connect();
            try {
                for (let p = 0; p < PUTARAN; p += 1) {
                    const id = await ruangBaru();
                    const hasil = await diBalikPalang(palang, () =>
                        Promise.allSettled(
                            Array.from({ length: PARALEL }, (_, i) =>
                                withTransaction(
                                    ctx,
                                    (s) =>
                                        service.reserve(s, {
                                            sumberDaya: [{ jenis: "room", id }],
                                            // Digeser per menit: seluruhnya tetap beririsan satu sama lain.
                                            rentang: { mulai: new Date(PAGI.mulai.getTime() + i * 60_000), selesai: PAGI.selesai },
                                            asal: "reservation",
                                            status: "CONFIRMED",
                                        }),
                                    db,
                                ),
                            ),
                        ),
                    );
                    const ditolak = hasil.filter((h): h is PromiseRejectedResult => h.status === "rejected");
                    expect(hasil.filter((h) => h.status === "fulfilled"), `putaran ${String(p)}`).toHaveLength(1);
                    // Kode tiap penolakan ditampilkan bila gagal: 40P01 harus terbedakan dari galat koneksi.
                    expect(ditolak.map((h) => (h.reason as { code?: string }).code ?? String(h.reason)), `putaran ${String(p)}`).toEqual(Array(PARALEL - 1).fill("23P01"));
                    expect(ditolak.every((h) => mapError(h.reason).kode === "RESERVATION_CONFLICT" && mapError(h.reason).status === 409)).toBe(true);
                }
            } finally {
                await palang.end();
                await db.destroy();
            }
        }, 120_000);

        it("rentang TIDAK beririsan pada ruangan sama tetap berhasil serentak — kunci menunggu, bukan NOWAIT", async () => {
            const db = createDb({ connectionString: process.env["DATABASE_URL"] ?? "", poolSize: 25 });
            const palang = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
            await palang.connect();
            try {
                const id = await ruangBaru();
                const hasil = await diBalikPalang(palang, () =>
                    Promise.allSettled(
                        Array.from({ length: PARALEL }, (_, i) =>
                            withTransaction(
                                ctx,
                                (s) =>
                                    service.reserve(s, {
                                        sumberDaya: [{ jenis: "room", id }],
                                        rentang: { mulai: new Date(Date.UTC(2026, 9, 5 + i, 1)), selesai: new Date(Date.UTC(2026, 9, 5 + i, 2)) },
                                        asal: "reservation",
                                        status: "CONFIRMED",
                                    }),
                                db,
                            ),
                        ),
                    ),
                );
                expect(hasil.map((h) => h.status)).toEqual(Array(PARALEL).fill("fulfilled"));
            } finally {
                await palang.end();
                await db.destroy();
            }
        }, 60_000);
    });

    describe("allocate() — alokasi otomatis per kategori", () => {
        it("memilih unit layak ber-id terkecil; menyaring dihapuskan/rusak berat/tak tersedia/tak dapat dipinjam/sudah terpesan", async () => {
            const ok1 = await seedAset();
            await seedAset({ dihapuskan: true });
            await seedAset({ kondisi: "RUSAK_BERAT" });
            await seedAset({ status: "TIDAK_TERSEDIA" });
            await seedAset({ dapat: false });
            const terpesan = await seedAset();
            const ok2 = await seedAset();
            await dalamTx((s) => service.reserve(s, { sumberDaya: [aset(terpesan)], rentang: TUMPANG, asal: "reservation", status: "CONFIRMED" }));

            const slot = await dalamTx((s) => service.allocate(s, { categoryId: Number(kategori), jumlah: 2, rentang: PAGI, kedaluwarsa: BESOK, asal: "reservation", untukSiswa: false }));

            expect(slot.map((x) => Number(x.resource_id))).toEqual([ok1, ok2]);
            expect(slot.every((x) => x.status === "TENTATIVE" && x.expires_at !== null)).toBe(true);
        });

        it("pemohon Siswa hanya mendapat unit boleh_dipinjam_siswa (BR-073)", async () => {
            await seedAset({ siswa: false });
            const bolehSiswa = await seedAset({ siswa: true });
            const slot = await dalamTx((s) => service.allocate(s, { categoryId: Number(kategori), jumlah: 1, rentang: PAGI, kedaluwarsa: BESOK, asal: "reservation", untukSiswa: true }));
            expect(Number(slot[0]?.resource_id)).toBe(bolehSiswa);
        });

        it("unit kurang -> 409 ASSET_NOT_AVAILABLE dan tak satu slot pun tersimpan", async () => {
            await seedAset();
            await expect(
                dalamTx((s) => service.allocate(s, { categoryId: Number(kategori), jumlah: 2, rentang: PAGI, kedaluwarsa: BESOK, asal: "reservation", untukSiswa: false })),
            ).rejects.toMatchObject({ kode: "ASSET_NOT_AVAILABLE" });
            expect(await kueri("SELECT id FROM booking_slots")).toHaveLength(0);
        });

        it("SKIP LOCKED (CC-02): 20 alokasi serentak atas 10 unit -> tepat 10 berhasil, masing-masing unit berbeda", async () => {
            for (let i = 0; i < 10; i += 1) await seedAset();
            const hasil = await Promise.allSettled(
                Array.from({ length: 20 }, () =>
                    dalamTx((s) => service.allocate(s, { categoryId: Number(kategori), jumlah: 1, rentang: PAGI, kedaluwarsa: BESOK, asal: "reservation", untukSiswa: false })),
                ),
            );
            const sukses = hasil.filter((h) => h.status === "fulfilled");
            expect(sukses).toHaveLength(10);
            expect(new Set(sukses.map((h) => (h as PromiseFulfilledResult<readonly { resource_id: string }[]>).value[0]?.resource_id)).size).toBe(10);
        }, 60_000);
    });

    describe("confirm() / activate() / release() — transisi SDD-01 §4.3", () => {
        async function tentatif(): Promise<string> {
            const id = await seedAset();
            const [s] = await dalamTx((sc) => service.reserve(sc, { sumberDaya: [aset(id)], rentang: PAGI, asal: "reservation", status: "TENTATIVE", kedaluwarsa: BESOK }));
            return s?.id ?? "";
        }

        it("TENTATIVE -> CONFIRMED (TTL dihapus) -> ACTIVE -> RELEASED", async () => {
            const id = await tentatif();
            const [c] = await dalamTx((s) => service.confirm(s, [Number(id)]));
            expect(c).toMatchObject({ status: "CONFIRMED", expires_at: null });
            await dalamTx((s) => service.activate(s, [Number(id)]));
            expect(await statusSlot(id)).toBe("ACTIVE");
            await dalamTx((s) => service.release(s, [Number(id)]));
            expect(await statusSlot(id)).toBe("RELEASED");
        });

        it("transisi dari status yang salah -> 409 RESERVATION_CONFLICT, tanpa perubahan", async () => {
            const id = await tentatif();
            await expect(dalamTx((s) => service.activate(s, [Number(id)]))).rejects.toMatchObject({ kode: "RESERVATION_CONFLICT" });
            expect(await statusSlot(id)).toBe("TENTATIVE");
        });

        it("konfirmasi sebagian gagal membatalkan SELURUHNYA (slot lain tetap TENTATIVE)", async () => {
            const a = await tentatif();
            const b = await tentatif();
            await dalamTx((s) => service.release(s, [Number(b)]));

            await expect(dalamTx((s) => service.confirm(s, [Number(a), Number(b)]))).rejects.toMatchObject({ kode: "RESERVATION_CONFLICT" });
            expect(await statusSlot(a)).toBe("TENTATIVE");
        });

        it("release idempoten dan membebaskan rentang untuk dipesan ulang", async () => {
            const id = await seedAset();
            const [s1] = await dalamTx((s) => service.reserve(s, { sumberDaya: [aset(id)], rentang: PAGI, asal: "reservation", status: "CONFIRMED" }));
            await dalamTx((s) => service.release(s, [Number(s1?.id)]));
            await expect(dalamTx((s) => service.release(s, [Number(s1?.id)]))).resolves.toHaveLength(0);

            await expect(dalamTx((s) => service.reserve(s, { sumberDaya: [aset(id)], rentang: TUMPANG, asal: "reservation", status: "CONFIRMED" }))).resolves.toHaveLength(1);
        });
    });
});
