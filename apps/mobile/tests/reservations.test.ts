import { describe, expect, it } from "vitest";
import { AssetReservationBodySchema, RoomReservationBodySchema } from "@sigm4/schemas";
import type { ReservationDetail, RoomAvailability } from "@sigm4/schemas";
import { EMPTY_ASSET, EMPTY_ROOM, assetBody, dayAgenda, dayClosure, draftsFromDetail, draftsFromParams, nearestSlot, previewSummary, roomBody, roomsWithCapacity, timeOptions, timeProblem } from "../src/features/reservations/model.js";

// Senin 3 Nov 2026; jam operasional 07.00–09.00, granularitas 30 menit.
const data: RoomAvailability = {
    dari: "2026-11-02T17:00:00.000Z", sampai: "2026-11-03T17:00:00.000Z", zona_waktu: "Asia/Jakarta", granularitas_menit: 30,
    jam_operasional: { hari: [1, 2, 3, 4, 5], mulai: "07:00", selesai: "09:00" }, hari_libur: [{ tanggal: "2026-11-04", nama: "Libur Sekolah" }],
    ruangan: [{ id: "1", kode: "R1", nama: "Lab RPL", jenis: "LABORATORIUM", kapasitas: 30, gedung: { id: "1", nama: "Gedung B" } }, { id: "2", kode: "R2", nama: "Aula", jenis: "AULA", kapasitas: 200, gedung: { id: "1", nama: "Gedung B" } }, { id: "3", kode: "R3", nama: "Kelas", jenis: "KELAS", kapasitas: 40, gedung: { id: "1", nama: "Gedung B" } }],
    slot: [{ ruangan_id: "1", mulai: "2026-11-03T07:30:00+07:00", selesai: "2026-11-03T08:30:00+07:00", keadaan: "DISETUJUI", label: "Rapat", reservasi: null }],
};

describe("Kalender Ruangan per hari (MS-44, CAL-UI-07)", () => {
    it("closes holidays and non-working days", () => {
        expect(dayClosure("2026-11-04", data)).toBe("Hari libur: Libur Sekolah.");
        expect(dayClosure("2026-11-08", data)).toBe("Bukan hari kerja sekolah.");
        expect(dayClosure("2026-11-03", data)).toBeNull();
    });
    it("lists each room with its booked slots and remaining free minutes", () => {
        const agenda = dayAgenda(data, "2026-11-03");
        expect(agenda.map((r) => [r.room.id, r.slots.length, r.freeMinutes])).toEqual([["1", 1, 60], ["2", 0, 120], ["3", 0, 120]]);
    });
    it("offers time boundaries on the granularity inside operating hours (CAL-UI-02)", () => {
        expect(timeOptions(data)).toEqual({ start: ["07:00", "07:30", "08:00", "08:30"], end: ["07:30", "08:00", "08:30", "09:00"] });
    });
});

describe("Wizard langkah 1 (FR-07.2)", () => {
    const draft = { room: "1", date: "2026-11-03", start: "07:00", end: "08:00" };
    it("rejects overlap, inverted times, and closed days before asking the server", () => {
        expect(timeProblem(data, draft)).toBe("Ruangan sudah terpakai pada rentang ini.");
        expect(timeProblem(data, { ...draft, start: "08:30", end: "08:00" })).toBe("Jam selesai harus sesudah jam mulai.");
        expect(timeProblem(data, { ...draft, date: "2026-11-04" })).toBe("Hari libur: Libur Sekolah.");
        expect(timeProblem(data, { ...draft, start: "08:30", end: "09:00" })).toBeNull();
        expect(timeProblem(data, { ...draft, room: "" })).toBe("Pilih ruangan.");
    });
    it("suggests the nearest free slot of the same length (A1) and roomier rooms (A2)", () => {
        expect(nearestSlot(data, "1", "2026-11-03", "07:30", "08:00")).toEqual({ start: "07:00", end: "07:30" });
        expect(nearestSlot(data, "1", "2026-11-03", "07:00", "09:00")).toBeNull();
        expect(roomsWithCapacity(data, draft, 35).map((r) => r.id)).toEqual(["3", "2"]);
    });
});

describe("body pengajuan sesuai skema bersama", () => {
    it("builds a recurring room body with sorted days and skipped dates", () => {
        const body = roomBody({ ...EMPTY_ROOM, room: "1", date: "2026-11-03", start: "08:30", end: "09:00", name: "Rapat", activity: "Rapat", participants: "10", recurring: true, days: [3, 1], until: "2026-11-30", skip: ["2026-11-17", "2026-11-10"] });
        expect(body).toMatchObject({ room_id: 1, waktu_mulai: "2026-11-03T08:30:00+07:00", pengulangan: { hari: [1, 3], sampai: "2026-11-30" }, lewati: ["2026-11-10", "2026-11-17"], keperluan: null });
        expect(RoomReservationBodySchema.safeParse(body).success).toBe(true);
        expect(RoomReservationBodySchema.safeParse(roomBody({ ...EMPTY_ROOM, room: "1", date: "2026-11-03", start: "08:30", end: "09:00", name: "x", activity: "x" })).success).toBe(false);
    });
    it("turns an asset draft with a room into a combined reservation that requires the activity (BR-024b)", () => {
        const draft = { ...EMPTY_ASSET, selections: [{ category: "5", quantity: "2" }, { category: "6", quantity: "1" }], units: ["11", "12"], startDate: "2026-11-03", endDate: "2026-11-03", purpose: "Lomba", location: "Aula", room: "2" };
        const body = assetBody(draft);
        expect(body.aset).toEqual([{ category_id: 5, jumlah: 2, asset_ids: [11, 12] }, { category_id: 6, jumlah: 1 }]);
        expect(AssetReservationBodySchema.safeParse(body).success).toBe(false);
        expect(AssetReservationBodySchema.safeParse(assetBody({ ...draft, name: "Lomba", activity: "Lomba", participants: "50" })).success).toBe(true);
        expect(assetBody({ ...draft, room: "" })).not.toHaveProperty("room_id");
    });
});

describe("isian awal wizard", () => {
    it("fills from the calendar or the catalogue and ignores unsafe ids", () => {
        expect(draftsFromParams({ ruangan: "1", tanggal: "2026-11-05" }, "2026-11-03")).toMatchObject({ mode: "RUANGAN", room: { room: "1", date: "2026-11-05" } });
        const asset = draftsFromParams({ mode: "ASET", kategori: "5", mulai: "2026-11-04T01:00:00.000Z", selesai: "2026-11-04T09:00:00.000Z", ruangan: "x" }, "2026-11-03");
        expect(asset.asset).toMatchObject({ selections: [{ category: "5", quantity: "1" }], startDate: "2026-11-04", startTime: "08:00", endTime: "16:00", room: "" });
        expect(draftsFromParams({ tanggal: "salah" }, "2026-11-03").room.date).toBe("2026-11-04");
    });
    it("copies an old asset reservation per category for Ajukan Ulang (BR-024)", () => {
        const detail = { jenis: "ASET", id: "9", waktu_mulai: "2026-11-04T01:00:00.000Z", waktu_selesai: "2026-11-04T09:00:00.000Z", tanggal: [], ruangan: null, keperluan: "Praktik", lokasi_penggunaan: "Lab", nama_kegiatan: null, jenis_kegiatan: null, jumlah_peserta: null, aset: [{ reservation_id: "9", asset_id: "1", kode_barang: "A", nama: "Laptop", category_id: "5", kondisi: "BAIK" }, { reservation_id: "9", asset_id: "2", kode_barang: "B", nama: "Laptop", category_id: "5", kondisi: "BAIK" }] } as unknown as ReservationDetail;
        expect(draftsFromDetail(detail)).toMatchObject({ mode: "ASET", asset: { selections: [{ category: "5", quantity: "2" }], purpose: "Praktik", location: "Lab", startTime: "08:00" } });
    });
});

describe("langkah Tinjau semua-atau-tidak (BR-024a/b, UXD-04)", () => {
    it("blocks submission while any date conflicts or is invalid", () => {
        expect(previewSummary([{ keadaan: "TERSEDIA" }, { keadaan: "DILEWATI" }])).toEqual({ booked: 1, blocked: 0, skipped: 1, canSubmit: true });
        expect(previewSummary([{ keadaan: "TERSEDIA" }, { keadaan: "BENTROK" }]).canSubmit).toBe(false);
        expect(previewSummary([{ keadaan: "TIDAK_SAH" }]).canSubmit).toBe(false);
        expect(previewSummary([{ keadaan: "DILEWATI" }]).canSubmit).toBe(false);
    });
});
