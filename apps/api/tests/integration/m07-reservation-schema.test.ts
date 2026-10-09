// Acceptance PR-03-08 — "Skema reservasi ruangan + integrasi booking_slots: slot terbentuk dalam
// transaksi yang sama" (FR-07.2 langkah 5, SDD-AVL-06/12, CI-01, CI-03) terhadap PostgreSQL NYATA.
// Constraint skema diuji dengan SQL mentah; pembentukan reservasi + slot lewat ReservationService.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ReservationService } from "../../src/modules/m07-reservation-room/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { SlotService } from "../../src/shared/booking/index.js";
import type { RentangWaktu } from "../../src/shared/booking/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { createDb, getDb, withTransaction } from "../../src/shared/db/index.js";
import type { TransactionScope } from "../../src/shared/db/index.js";
import { mapError } from "../../src/shared/errors/index.js";
import { DocumentNumberService } from "../../src/shared/numbering/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const SEKARANG = new Date("2026-10-09T00:00:00Z");
const TTL = new Date("2026-10-11T00:00:00Z");
const PAGI: RentangWaktu = { mulai: new Date("2026-10-20T01:00:00Z"), selesai: new Date("2026-10-20T03:00:00Z") };
const SIANG: RentangWaktu = { mulai: new Date("2026-10-20T03:00:00Z"), selesai: new Date("2026-10-20T05:00:00Z") };

const clock = new FixedClock(SEKARANG);
const service = new ReservationService(new SlotService(clock), new DocumentNumberService(clock), new AuditLogger({ clock }));

let urut = 0;
const unik = (a: string) => `${a}${(urut += 1)}`;

let ctx: AuthContext;
let pemohon: string;
let ruang: number;
let area: string;

const input = (rentang: RentangWaktu, roomId = ruang) => ({
    roomId,
    rentang,
    kedaluwarsa: TTL,
    namaKegiatan: "Rapat OSIS",
    jenisKegiatan: "Rapat",
    jumlahPeserta: 20,
    keterangan: "Membawa proyektor sendiri",
});

const buat = (rentang: RentangWaktu, roomId = ruang) => withTransaction(ctx, (s) => service.buatReservasiRuangan(s, input(rentang, roomId)), getDb());

async function ruangBaru(): Promise<number> {
    const [r] = await kueri<{ id: string }>(`INSERT INTO rooms (area_id, nama, kode, jenis, kapasitas, dapat_direservasi) VALUES (${area}, 'Aula', '${unik("RSVR")}', 'AULA', 100, true) RETURNING id::text`);
    return Number(r?.id);
}

async function bersihkan(): Promise<void> {
    await kueri("DELETE FROM booking_slots");
    await kueri("DELETE FROM reservations WHERE parent_id IS NOT NULL");
    await kueri("DELETE FROM reservations");
    await kueri("DELETE FROM document_counters WHERE prefix = 'RSV-RG'");
    await kueri("DELETE FROM rooms WHERE kode LIKE 'RSVR%'");
    await kueri("DELETE FROM areas WHERE kode LIKE 'RSVA%'");
    await kueri("DELETE FROM buildings WHERE kode LIKE 'RSVG%'");
    await kueri("DELETE FROM users WHERE email LIKE 'rsv-%@uji-m07.sch.id'");
}

/** INSERT mentah — membuktikan constraint skema, bukan validasi aplikasi. */
const sisipMentah = (kolom: Record<string, string>) => {
    const isi = {
        nomor: "'RSV-RG-2026-0001'",
        jenis: "'RUANGAN'",
        pemohon_id: pemohon,
        room_id: String(ruang),
        nama_kegiatan: "'Rapat'",
        jenis_kegiatan: "'Rapat'",
        waktu_mulai: "'2026-10-20 08:00+07'",
        waktu_selesai: "'2026-10-20 10:00+07'",
        jumlah_peserta: "10",
        ...kolom,
    };
    return kueri<{ id: string }>(`INSERT INTO reservations (${Object.keys(isi).join(", ")}) VALUES (${Object.values(isi).join(", ")}) RETURNING id::text`);
};
const kodeGalat = async (janji: Promise<unknown>) => ((await janji.then(() => null, (e: unknown) => e)) as { code?: string } | null)?.code;

describe.skipIf(!ADA_DB)("PR-03-08 — skema reservasi ruangan + integrasi booking_slots", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await bersihkan();
        const [u] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Guru Pemohon', 'rsv-${randomUUID()}@uji-m07.sch.id', 'x', 'NIPRSV-${randomUUID()}',
                    (SELECT id FROM roles WHERE kode = 'R-04'), 'AKTIF', false) RETURNING id::text`);
        pemohon = u?.id ?? "";
        ctx = createAuthContext({ userId: Number(pemohon), roleCode: "GURU", scopes: new Map() });
        const [g] = await kueri<{ id: string }>(`INSERT INTO buildings (nama, kode) VALUES ('G', '${unik("RSVG")}') RETURNING id::text`);
        const [a] = await kueri<{ id: string }>(`INSERT INTO areas (building_id, nama, kode) VALUES (${g?.id}, 'A', '${unik("RSVA")}') RETURNING id::text`);
        area = a?.id ?? "";
        ruang = await ruangBaru();
    });

    afterAll(bersihkan);

    describe("skema 0043", () => {
        it("nomor mengikuti SEQ-04 dan prefiks jenisnya; RSV-BR pada reservasi ruangan ditolak", async () => {
            expect(await kodeGalat(sisipMentah({ nomor: "'RSV-RG-26-1'" }))).toBe("23514");
            expect(await kodeGalat(sisipMentah({ nomor: "'RSV-BR-2026-0001'" }))).toBe("23514");
            expect(await sisipMentah({})).toHaveLength(1);
            expect(await kodeGalat(sisipMentah({}))).toBe("23505"); // nomor unik
        });

        it("BR-024a: tanggal turunan ber-parent wajib bersufiks .NN, induk tak boleh bersufiks", async () => {
            const [induk] = await sisipMentah({});
            expect(await kodeGalat(sisipMentah({ nomor: "'RSV-RG-2026-0001.01'" }))).toBe("23514");
            expect(await kodeGalat(sisipMentah({ nomor: "'RSV-RG-2026-0002'", parent_id: induk?.id ?? "" }))).toBe("23514");
            expect(await sisipMentah({ nomor: "'RSV-RG-2026-0001.01'", parent_id: induk?.id ?? "" })).toHaveLength(1);
        });

        it("RUANGAN wajib ruangan, nama & jenis kegiatan, dan jumlah peserta; rentang harus maju", async () => {
            for (const kolom of ["room_id", "nama_kegiatan", "jenis_kegiatan", "jumlah_peserta"]) {
                expect(await kodeGalat(sisipMentah({ [kolom]: "NULL" })), kolom).toBe("23514");
            }
            expect(await kodeGalat(sisipMentah({ waktu_selesai: "'2026-10-20 08:00+07'" }))).toBe("23514");
            expect(await kodeGalat(sisipMentah({ jumlah_peserta: "0" }))).toBe("23514");
        });

        it("ASET tanpa ruangan & kegiatan sah (reservasi aset Phase 04 memakai keperluan)", async () => {
            const baris = await sisipMentah({ nomor: "'RSV-BR-2026-0001'", jenis: "'ASET'", room_id: "NULL", nama_kegiatan: "NULL", jenis_kegiatan: "NULL", jumlah_peserta: "NULL", keperluan: "'Praktikum'" });
            expect(baris).toHaveLength(1);
        });

        it("booking_slots.reservation_id kini ber-FK ke reservations", async () => {
            const galat = kueri(`INSERT INTO booking_slots (resource_type, resource_id, slot_range, status, origin, reservation_id)
                VALUES ('room', ${String(ruang)}, '[2026-10-20 08:00+07, 2026-10-20 10:00+07)', 'CONFIRMED', 'reservation', 999999999)`);
            expect(await kodeGalat(galat)).toBe("23503");
        });
    });

    describe("ReservationService.buatReservasiRuangan", () => {
        it("satu transaksi: reservasi MENUNGGU_PERSETUJUAN + slot TENTATIVE bertaut + RESERVATION_CREATED", async () => {
            const sejak = Number((await kueri<{ n: string }>("SELECT coalesce(max(id), 0)::text AS n FROM activity_logs"))[0]?.n);
            const hasil = await buat(PAGI);

            expect(hasil.nomor).toBe("RSV-RG-2026-0001");
            const [r] = await kueri<Record<string, string>>(`SELECT nomor, jenis, status, pemohon_id::text, room_id::text, keterangan FROM reservations WHERE id = ${hasil.id}`);
            expect(r).toEqual({ nomor: hasil.nomor, jenis: "RUANGAN", status: "MENUNGGU_PERSETUJUAN", pemohon_id: pemohon, room_id: String(ruang), keterangan: "Membawa proyektor sendiri" });
            const [s] = await kueri<Record<string, string>>(`
                SELECT id::text, resource_type, resource_id::text, status, origin, reservation_id::text, expires_at = '${TTL.toISOString()}' AS ttl,
                       slot_range = tstzrange('${PAGI.mulai.toISOString()}', '${PAGI.selesai.toISOString()}', '[)') AS rentang
                  FROM booking_slots WHERE reservation_id = ${hasil.id}`);
            expect(s).toEqual({ id: hasil.slotId, resource_type: "room", resource_id: String(ruang), status: "TENTATIVE", origin: "reservation", reservation_id: hasil.id, ttl: true, rentang: true });
            const log = await kueri<{ entitas_id: string; nilai_sesudah: Record<string, unknown> }>(
                `SELECT entitas_id::text, nilai_sesudah FROM activity_logs WHERE aksi = 'RESERVATION_CREATED' AND id > ${String(sejak)}`,
            );
            expect(log).toHaveLength(1);
            expect(log[0]).toMatchObject({ entitas_id: hasil.id, nilai_sesudah: { nomor: hasil.nomor, slot_id: hasil.slotId, status: "MENUNGGU_PERSETUJUAN" } });
        });

        it("CI-01: rentang beririsan → 409 RESERVATION_CONFLICT; reservasi, slot, dan log pihak kalah tak tersisa", async () => {
            await buat(PAGI);
            const galat = await buat({ mulai: new Date(PAGI.mulai.getTime() + 3_600_000), selesai: SIANG.selesai }).then(() => null, (e: unknown) => e);

            expect(mapError(galat)).toMatchObject({ status: 409, kode: "RESERVATION_CONFLICT" });
            expect(await kueri("SELECT 1 FROM reservations")).toHaveLength(1);
            expect(await kueri("SELECT 1 FROM booking_slots")).toHaveLength(1);
            // Rentang berdempet [)-nya sah (SDD-AVL-02) dan nomor berikutnya melanjutkan penghitung yang ikut batal.
            expect((await buat(SIANG)).nomor).toBe("RSV-RG-2026-0002");
        });

        it("ruangan tak terdaftar ditolak FK (kelayakan ruangan prasyarat pemanggil) dan penghitung nomor ikut batal", async () => {
            expect(await kodeGalat(buat(PAGI, 999_999_999))).toBe("23503");
            expect(await kueri("SELECT 1 FROM reservations")).toEqual([]);
            expect((await buat(PAGI)).nomor).toBe("RSV-RG-2026-0001");
        });

        it("slot ikut batal bila transaksi PEMANGGIL gagal sesudahnya (pembentukan approval PR-03-10 di transaksi yang sama)", async () => {
            const galat = await withTransaction(
                ctx,
                async (s: TransactionScope) => {
                    await service.buatReservasiRuangan(s, input(PAGI));
                    throw new Error("instance approval gagal dibentuk");
                },
                getDb(),
            ).then(() => null, (e: unknown) => e);

            expect((galat as Error).message).toBe("instance approval gagal dibentuk");
            expect(await kueri("SELECT 1 FROM reservations")).toEqual([]);
            expect(await kueri("SELECT 1 FROM booking_slots")).toEqual([]);
            // Ruangan tidak tertahan slot yatim: rentang yang sama langsung dapat dipesan.
            expect((await buat(PAGI)).nomor).toMatch(/^RSV-RG-2026-\d{4}$/);
        });

        it("20 pengajuan serentak beririsan pada ruangan sama → tepat SATU berhasil, sisanya 409 (tak ada 40P01/500)", async () => {
            const db = createDb({ connectionString: process.env["DATABASE_URL"] ?? "", poolSize: 25 });
            try {
                const hasil = await Promise.allSettled(
                    Array.from({ length: 20 }, (_, i) =>
                        withTransaction(ctx, (s) => service.buatReservasiRuangan(s, input({ mulai: new Date(PAGI.mulai.getTime() + i * 60_000), selesai: PAGI.selesai })), db),
                    ),
                );
                const ditolak = hasil.filter((h): h is PromiseRejectedResult => h.status === "rejected");
                expect(hasil.filter((h) => h.status === "fulfilled")).toHaveLength(1);
                expect(ditolak.map((h) => (h.reason as { code?: string }).code ?? String(h.reason))).toEqual(Array(19).fill("23P01"));
                expect(ditolak.every((h) => mapError(h.reason).kode === "RESERVATION_CONFLICT")).toBe(true);
                expect(await kueri("SELECT 1 FROM reservations")).toHaveLength(1);
            } finally {
                await db.destroy();
            }
        }, 60_000);
    });
});
