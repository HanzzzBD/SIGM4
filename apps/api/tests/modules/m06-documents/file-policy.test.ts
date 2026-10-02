// Kebijakan unggah per jenis (SDD-09 §4.3, FR-01.4 A3) dan penjaga unduh (SDD-FS-03); PR-03-25.

import { describe, expect, it } from "vitest";
import { urlUnduhBerkas } from "../../../src/modules/m06-documents/index.js";
import { periksaKebijakan } from "../../../src/modules/m06-documents/services/kebijakan.js";
import { FixedClock } from "../../../src/shared/clock/index.js";
import type { PenyimpananObjek } from "../../../src/shared/storage/index.js";

const MB = 1024 * 1024;

describe("periksaKebijakan (SDD-09 §4.3)", () => {
    it("FR-01.4 A3: foto profil > 2 MB atau bukan JPG/PNG ditolak dengan pesan spesifik", () => {
        expect(periksaKebijakan("USER_PHOTO", "image/png", 2 * MB)).toBeNull();
        expect(periksaKebijakan("USER_PHOTO", "image/jpeg", 1)).toBeNull();
        expect(periksaKebijakan("USER_PHOTO", "image/png", 2 * MB + 1)).toEqual({ field: "ukuran", message: "Foto profil maksimal 2 MB." });
        expect(periksaKebijakan("USER_PHOTO", "application/pdf", 10)).toEqual({ field: "mime", message: "Foto profil harus berformat JPG atau PNG." });
        expect(periksaKebijakan("USER_PHOTO", "image/gif", 10)?.field).toBe("mime");
    });

    it("FR-06.1: dokumen aset PDF/JPG/PNG/DOCX/XLSX ≤ 10 MB", () => {
        for (const mime of ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]) {
            expect(periksaKebijakan("ASSET_DOCUMENT", mime, 10 * MB)).toBeNull();
        }
        expect(periksaKebijakan("ASSET_DOCUMENT", "application/pdf", 10 * MB + 1)?.message).toBe("Dokumen aset maksimal 10 MB.");
        expect(periksaKebijakan("ASSET_DOCUMENT", "application/zip", 1)?.field).toBe("mime");
    });

    it.each(["ASSET_PHOTO", "HANDOVER_PHOTO", "DAMAGE_PHOTO", "WORK_ORDER_PHOTO", "STOCKTAKE_PHOTO"] as const)("%s: JPG/PNG ≤ 2 MB (MOB-MED-01; ASSET_PHOTO keputusan 7a)", (jenis) => {
        expect(periksaKebijakan(jenis, "image/png", 2 * MB)).toBeNull();
        expect(periksaKebijakan(jenis, "image/png", 2 * MB + 1)?.field).toBe("ukuran");
        expect(periksaKebijakan(jenis, "application/pdf", 1)?.field).toBe("mime");
    });
});

describe("urlUnduhBerkas — penjaga SDD-FS-03", () => {
    const diterbitkan: string[] = [];
    const penyimpanan: PenyimpananObjek = {
        urlUnggah: () => Promise.reject(new Error("tidak dipakai")),
        urlUnduh: (kunci, detik) => {
            diterbitkan.push(`${kunci}@${String(detik)}`);
            return Promise.resolve(`https://storage.test/${kunci}`);
        },
        info: () => Promise.resolve(null),
        ambil: () => Promise.resolve(null),
        hapus: () => Promise.resolve(),
        periksa: () => Promise.resolve(),
    };
    const clock = new FixedClock(new Date("2026-10-02T03:00:00Z"));

    it.each(["PENDING", "INFECTED", "FAILED"] as const)("%s → 409 FILE_NOT_SCANNED, tak ada URL diterbitkan (NFR-S-18)", async (status) => {
        diterbitkan.length = 0;
        await expect(urlUnduhBerkas(penyimpanan, clock, { object_key: "k", scan_status: status })).rejects.toMatchObject({ kode: "FILE_NOT_SCANNED" });
        expect(diterbitkan).toEqual([]);
    });

    it("CLEAN → presigned GET 15 menit (SDD-FS-05), kedaluwarsa dihitung dari Clock", async () => {
        diterbitkan.length = 0;
        const hasil = await urlUnduhBerkas(penyimpanan, clock, { object_key: "user-photo/2026/10/x.png", scan_status: "CLEAN" });
        expect(hasil).toEqual({ url: "https://storage.test/user-photo/2026/10/x.png", expiresAt: new Date("2026-10-02T03:15:00Z") });
        expect(diterbitkan).toEqual(["user-photo/2026/10/x.png@900"]);
    });
});
