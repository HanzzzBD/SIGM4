// Rencana pembatalan (FR-07.3 A1, BR-024a; keputusan 15c log phase-03) — logika murni.
import { describe, expect, it } from "vitest";
import type { StatusReservasi } from "../../../src/shared/db/index.js";
import type { BarisPengajuan } from "../../../src/modules/m07-reservation-room/repositories/reservation.repository.js";
import { rencanakanPembatalan } from "../../../src/modules/m07-reservation-room/services/cancellation-plan.js";

const SEKARANG = new Date("2027-06-07T02:00:00Z");
const baris = (id: string, status: StatusReservasi, mulai: string, parent: string | null = null): BarisPengajuan => ({
    id,
    nomor: parent === null ? "RSV-RG-2027-0001" : `RSV-RG-2027-0001.0${id}`,
    parent_id: parent,
    pemohon_id: "7",
    status,
    waktu_mulai: new Date(mulai),
});
const ids = (r: ReturnType<typeof rencanakanPembatalan>) => (r.sah ? r.dibatalkan.map((b) => b.id) : r.alasan);

describe("rencanakanPembatalan — reservasi tunggal", () => {
    it("Menunggu/Disetujui yang belum dimulai → dirinya, akar tertutup", () => {
        for (const s of ["MENUNGGU_PERSETUJUAN", "DISETUJUI"] as const) {
            expect(rencanakanPembatalan([baris("10", s, "2027-06-08T01:00:00Z")], "10", "10", SEKARANG)).toEqual({ sah: true, dibatalkan: [baris("10", s, "2027-06-08T01:00:00Z")], akarTertutup: true });
        }
    });

    it("A1: sudah dimulai (termasuk tepat pada waktu mulai) → ditolak", () => {
        const r = rencanakanPembatalan([baris("10", "DISETUJUI", SEKARANG.toISOString())], "10", "10", SEKARANG);
        expect(r).toEqual({ sah: false, alasan: "Kegiatan sudah dimulai; reservasi tidak dapat dibatalkan. Petugas dapat menandainya Selesai atau Tidak Digunakan." });
    });

    it("status lain → ditolak dengan alasan status", () => {
        for (const s of ["DIBATALKAN", "DITOLAK", "PERLU_REVISI", "KEDALUWARSA", "BERLANGSUNG", "SELESAI"] as const) {
            expect(ids(rencanakanPembatalan([baris("10", s, "2027-06-08T01:00:00Z")], "10", "10", SEKARANG))).toBe(
                "Hanya reservasi yang menunggu persetujuan atau sudah disetujui yang dapat dibatalkan.",
            );
        }
    });
});

describe("rencanakanPembatalan — berulang (BR-024a)", () => {
    const kelompok = (s2: StatusReservasi = "DISETUJUI", mulai1 = "2027-06-11T01:00:00Z") => [
        baris("1", "DISETUJUI", "2027-06-11T01:00:00Z"),
        baris("2", "DISETUJUI", mulai1, "1"),
        baris("3", s2, "2027-06-18T01:00:00Z", "1"),
        baris("4", "DISETUJUI", "2027-06-25T01:00:00Z", "1"),
    ];

    it("tanggal turunan → tanggal itu saja; induk tetap", () => {
        const r = rencanakanPembatalan(kelompok(), "1", "3", SEKARANG);
        expect(r.sah && { ids: r.dibatalkan.map((b) => b.id), akar: r.akarTertutup }).toEqual({ ids: ["3"], akar: false });
    });

    it("induk → seluruh tanggal yang belum dimulai, induk ikut tertutup bila tak bersisa", () => {
        const r = rencanakanPembatalan(kelompok(), "1", "1", SEKARANG);
        expect(r.sah && { ids: r.dibatalkan.map((b) => b.id), akar: r.akarTertutup }).toEqual({ ids: ["1", "2", "3", "4"], akar: true });
    });

    it("tanggal yang sudah dimulai tidak ikut dan menahan induk tetap hidup", () => {
        const r = rencanakanPembatalan(kelompok("DISETUJUI", "2027-06-07T01:00:00Z"), "1", "1", SEKARANG);
        expect(r.sah && { ids: r.dibatalkan.map((b) => b.id), akar: r.akarTertutup }).toEqual({ ids: ["3", "4"], akar: false });
    });

    it("tanggal BERLANGSUNG menahan induk; tanggal SELESAI/DIBATALKAN tidak", () => {
        // Satu-satunya tanggal lain yang hidup sedang BERLANGSUNG: ia sendiri yang menahan induk.
        const sedang = [baris("1", "DISETUJUI", "2027-06-04T01:00:00Z"), baris("2", "BERLANGSUNG", "2027-06-07T01:00:00Z", "1"), baris("3", "DISETUJUI", "2027-06-18T01:00:00Z", "1")];
        const berlangsung = rencanakanPembatalan(sedang, "1", "3", SEKARANG);
        expect(berlangsung.sah && { ids: berlangsung.dibatalkan.map((b) => b.id), akar: berlangsung.akarTertutup }).toEqual({ ids: ["3"], akar: false });
        const k = [baris("1", "DISETUJUI", "2027-06-11T01:00:00Z"), baris("2", "SELESAI", "2027-06-04T01:00:00Z", "1"), baris("3", "DIBATALKAN", "2027-06-18T01:00:00Z", "1"), baris("4", "DISETUJUI", "2027-06-25T01:00:00Z", "1")];
        const r = rencanakanPembatalan(k, "1", "4", SEKARANG);
        expect(r.sah && { ids: r.dibatalkan.map((b) => b.id), akar: r.akarTertutup }).toEqual({ ids: ["1", "4"], akar: true });
    });

    it("induk tanpa tanggal yang dapat dibatalkan → ditolak", () => {
        const k = [baris("1", "DISETUJUI", "2027-06-04T01:00:00Z"), baris("2", "SELESAI", "2027-06-04T01:00:00Z", "1")];
        expect(ids(rencanakanPembatalan(k, "1", "1", SEKARANG))).toBe("Tidak ada tanggal reservasi ini yang masih dapat dibatalkan.");
    });
});
