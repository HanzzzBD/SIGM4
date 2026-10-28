// Turunan gambar (SDD-FS-07, SDD-09 §4.5; PR-03-07): ukuran, tanpa pembesaran, orientasi EXIF,
// metadata dibuang; FileScanned → antrean turunan hanya bila CLEAN; varian URL jatuh ke asli.

import type { Queue } from "bullmq";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { EVENT_BERKAS_TERPINDAI, NAMA_PEKERJAAN_TURUNAN, PEKERJAAN_BERSIH_YATIM, urlUnduhBerkas } from "../../../src/modules/m06-documents/index.js";
import { buatVarian, kunciTurunan } from "../../../src/modules/m06-documents/services/derivative.service.js";
import { FixedClock } from "../../../src/shared/clock/index.js";
import { EventHandlerRegistry } from "../../../src/shared/events/index.js";
import type { PenyimpananObjek } from "../../../src/shared/storage/index.js";
import { pasangHandlerAntrean, registry as registriPekerjaan } from "../../../src/worker/index.js";
import { RETRY_OPTIONS } from "../../../src/worker/scheduler.js";

const gambar = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 40, b: 40 } } });

describe("buatVarian — SDD-09 §4.5", () => {
    it("1600×1200 → thumb 200×150 dan medium 800×600, WebP", async () => {
        const asli = await gambar(1600, 1200).jpeg().toBuffer();
        for (const [sisi, w, h] of [[200, 200, 150], [800, 800, 600]] as const) {
            const m = await sharp(await buatVarian(asli, sisi)).metadata();
            expect([m.format, m.width, m.height]).toEqual(["webp", w, h]);
        }
    });

    it("gambar kecil tidak diperbesar", async () => {
        const m = await sharp(await buatVarian(await gambar(120, 90).png().toBuffer(), 800)).metadata();
        expect([m.width, m.height]).toEqual([120, 90]);
    });

    it("orientasi EXIF diterapkan lalu metadata (termasuk EXIF/GPS) dibuang", async () => {
        const berExif = await gambar(400, 100).jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "rahasia-lokasi" } } }).toBuffer();
        expect((await sharp(berExif).metadata()).exif).toBeDefined();
        const m = await sharp(await buatVarian(berExif, 200)).metadata();
        // Orientasi 6 = diputar 90°: lanskap 400×100 menjadi potret.
        expect([m.width, m.height]).toEqual([50, 200]);
        expect(m.exif).toBeUndefined();
        expect(m.orientation).toBeUndefined();
    });

    it("isi rusak → galat, bukan gambar kosong diam-diam", async () => {
        await expect(buatVarian(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), 200)).rejects.toThrow();
    });
});

describe("kunciTurunan — tetap buram, satu folder dengan asli (SDD-FS-06)", () => {
    it("ekstensi asli diganti -{varian}.webp", () => {
        expect(kunciTurunan("damage-photo/2026/10/abc.jpg", "thumb")).toBe("damage-photo/2026/10/abc-thumb.webp");
        expect(kunciTurunan("user-photo/2026/10/abc.png", "medium")).toBe("user-photo/2026/10/abc-medium.webp");
    });
});

describe("urlUnduhBerkas — varian (SDD-11: gambar memakai turunan)", () => {
    const diminta: string[] = [];
    const penyimpanan = { urlUnduh: (k: string) => (diminta.push(k), Promise.resolve(`u/${k}`)) } as unknown as PenyimpananObjek;
    const clock = new FixedClock(new Date("2026-10-03T00:00:00Z"));

    it("varian ada → kunci turunan; belum ada → jatuh ke asli; tanpa varian → asli", async () => {
        const berkas = { object_key: "a.png", scan_status: "CLEAN" as const, thumb_key: "a-thumb.webp", medium_key: null };
        await urlUnduhBerkas(penyimpanan, clock, berkas, "thumb");
        await urlUnduhBerkas(penyimpanan, clock, berkas, "medium");
        await urlUnduhBerkas(penyimpanan, clock, berkas);
        expect(diminta).toEqual(["a-thumb.webp", "a.png", "a.png"]);
    });

    it("penjaga CLEAN tetap berlaku bagi turunan", async () => {
        await expect(urlUnduhBerkas(penyimpanan, clock, { object_key: "a.png", scan_status: "PENDING", thumb_key: "a-thumb.webp" }, "thumb")).rejects.toMatchObject({ kode: "FILE_NOT_SCANNED" });
    });
});

describe("worker — FileScanned → antrean file-derivatives; pembersih yatim terjadwal", () => {
    const ev = (hasil: string) => ({ id: "1", name: EVENT_BERKAS_TERPINDAI, aggregateType: "stored_file", aggregateId: "9", payload: { file_id: "9", hasil }, actorId: null, requestId: null, occurredAt: new Date(0), attempts: 0 });

    it("hanya CLEAN yang dijadwalkan (keputusan 10b); jobId tetap per berkas", async () => {
        const add = vi.fn().mockResolvedValue(undefined);
        const handlers = new EventHandlerRegistry();
        pasangHandlerAntrean(handlers, { add } as unknown as Queue);
        const [handler] = handlers.handlersFor(EVENT_BERKAS_TERPINDAI);
        for (const h of ["INFECTED", "FAILED", "CLEAN", "CLEAN"]) await handler?.(ev(h));
        expect(add.mock.calls).toEqual([
            [NAMA_PEKERJAAN_TURUNAN, { file_id: "9" }, { ...RETRY_OPTIONS, jobId: "file-derivatives-9" }],
            [NAMA_PEKERJAAN_TURUNAN, { file_id: "9" }, { ...RETRY_OPTIONS, jobId: "file-derivatives-9" }],
        ]);
    });

    it("orphan-file-cleanup terjadwal harian 02:00 WIB (19:00 UTC); file-derivatives tanpa cron", () => {
        const semua = registriPekerjaan.all();
        expect(semua.find((j) => j.name === PEKERJAAN_BERSIH_YATIM)?.cron).toBe("0 19 * * *");
        expect(semua.find((j) => j.name === NAMA_PEKERJAAN_TURUNAN)?.cron).toBeUndefined();
    });
});
