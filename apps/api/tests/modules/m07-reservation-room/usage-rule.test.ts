// Aturan pencatatan penggunaan (FR-07.4 langkah 3 + A1; keputusan 16b log phase-03) — logika murni.
import { describe, expect, it } from "vitest";
import { alasanTolakPencatatan } from "../../../src/modules/m07-reservation-room/services/usage.service.js";

const SEMUA = ["MENUNGGU_PERSETUJUAN", "DISETUJUI", "DITOLAK", "PERLU_REVISI", "DIBATALKAN", "KEDALUWARSA", "BERLANGSUNG", "SELESAI", "TIDAK_DIGUNAKAN"] as const;

describe("alasanTolakPencatatan", () => {
    it("Tidak Digunakan hanya dari Berlangsung atau Selesai", () => {
        expect(SEMUA.filter((s) => alasanTolakPencatatan(s, false, "TIDAK_DIGUNAKAN") === null)).toEqual(["BERLANGSUNG", "SELESAI"]);
    });

    it("kondisi Baik/Perlu Perhatian hanya bagi yang Selesai", () => {
        for (const h of ["BAIK", "PERLU_PERHATIAN"] as const) expect(SEMUA.filter((s) => alasanTolakPencatatan(s, false, h) === null)).toEqual(["SELESAI"]);
        expect(alasanTolakPencatatan("BERLANGSUNG", false, "BAIK")).toBe("Kondisi ruangan dicatat setelah kegiatan selesai.");
    });

    it("sekali per tanggal — yang sudah dicatat selalu ditolak", () => {
        for (const h of ["BAIK", "PERLU_PERHATIAN", "TIDAK_DIGUNAKAN"] as const) expect(alasanTolakPencatatan("SELESAI", true, h)).toBe("Penggunaan reservasi ini sudah dicatat.");
    });
});
