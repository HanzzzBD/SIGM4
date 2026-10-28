import { describe, expect, it } from "vitest";
import type { Building } from "../src/features/locations/api.js";
import { blockBody, blockDecision, locationBody, visibleTree } from "../src/features/locations/model.js";

const room = (id: string, nama: string, kode: string) => ({ id, area_id: "1", nama, kode, jenis: "KELAS", kapasitas: 30, penanggung_jawab_id: null, dapat_direservasi: true, boleh_direservasi_siswa: false, status: "AKTIF" as const, jumlah_aset: 2 });
const tree: Building[] = [{ id: "1", nama: "Gedung A", kode: "A", status: "AKTIF", jumlah_aset: 4, areas: [{ id: "1", nama: "Lantai 1", kode: "L1", jumlah_aset: 4, rooms: [room("1", "Lab RPL", "A101"), room("2", "Kelas X", "A102")] }] }, { id: "2", nama: "Gedung B", kode: "B", status: "AKTIF", jumlah_aset: 0, areas: [] }];

describe("MS-37 pohon lokasi (FR-03.x)", () => {
    it("narrows the tree to matching rooms and keeps whole branches whose building or area matches", () => {
        expect(visibleTree(tree, "")).toHaveLength(2);
        expect(visibleTree(tree, "rpl").map((b) => b.areas.map((a) => a.rooms.map((r) => r.kode)))).toEqual([[["A101"]]]);
        expect(visibleTree(tree, "lantai")[0]?.areas[0]?.rooms).toHaveLength(2);
        expect(visibleTree(tree, "gedung b").map((b) => b.building.id)).toEqual(["2"]);
        expect(visibleTree(tree, "zzz")).toEqual([]);
    });
    it("builds per-level bodies and forbids student booking of non-reservable rooms", () => {
        const f = { nama: " Lab ", kode: "L1", extra: "2", jenis: "LABORATORIUM", kapasitas: "", pj: "", reservable: false, students: true };
        expect(locationBody("areas", f, "7")).toEqual({ body: { nama: "Lab", kode: "L1", building_id: 7, lantai: 2 } });
        expect(locationBody("rooms", f, "3")).toEqual({ body: { nama: "Lab", kode: "L1", area_id: 3, jenis: "LABORATORIUM", kapasitas: null, penanggung_jawab_id: null, dapat_direservasi: false, boleh_direservasi_siswa: false } });
        expect(locationBody("rooms", { ...f, kapasitas: "0" }, "3")).toEqual({ error: "Kapasitas minimal 1 orang." });
        expect(locationBody("buildings", { ...f, kode: " " }, "")).toEqual({ error: "Nama dan kode wajib diisi." });
    });
});

describe("MS-38 jadwal tetap & blokade (FR-07.5)", () => {
    const base = { jenis: "JADWAL_TETAP" as const, label: "KBM", days: [3, 1], start: "07:00", end: "09:00", from: "2026-11-02", until: "2026-12-18", startDate: "", endDate: "" };
    it("builds a weekly schedule with sorted days and a cancel decision only when given", () => {
        expect(blockBody(base)).toEqual({ body: { jenis: "JADWAL_TETAP", hari: [1, 3], jam_mulai: "07:00", jam_selesai: "09:00", berlaku_mulai: "2026-11-02", berlaku_sampai: "2026-12-18", label_kegiatan: "KBM" } });
        expect(blockBody(base, "Ujian")).toMatchObject({ body: { batalkan_bentrok: { alasan: "Ujian" } } });
        expect(blockBody({ ...base, days: [] })).toHaveProperty("error");
        expect(blockBody({ ...base, until: "2026-10-01" })).toEqual({ error: "Pilih rentang tanggal yang sah." });
    });
    it("builds a single manual block in WIB and rejects inverted ranges", () => {
        const manual = { ...base, jenis: "BLOKADE_MANUAL" as const, startDate: "2026-11-05", endDate: "2026-11-05" };
        expect(blockBody(manual)).toEqual({ body: { jenis: "BLOKADE_MANUAL", mulai: "2026-11-05T07:00:00+07:00", selesai: "2026-11-05T09:00:00+07:00", label_kegiatan: "KBM" } });
        expect(blockBody({ ...manual, end: "06:00" })).toEqual({ error: "Waktu selesai harus sesudah waktu mulai." });
    });
    it("requires adjusting other blocks and an explicit decision to cancel reservations (A1)", () => {
        expect(blockDecision({ bentrok_reservasi: [], bentrok_lain: [] })).toBe("OK");
        expect(blockDecision({ bentrok_reservasi: [{}], bentrok_lain: [] })).toBe("CANCEL_RESERVATIONS");
        expect(blockDecision({ bentrok_reservasi: [{}], bentrok_lain: [{}] })).toBe("ADJUST");
    });
});
