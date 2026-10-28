// Pemindaian AV (SDD-FS-04, SDD-09 §4.3; PR-03-05): jawaban clamd, magic bytes, dan pemasangan
// FileUploaded → antrean `file-scan` di worker. Tanpa ClamAV/Redis — yang nyata ada di uji integrasi.

import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { EVENT_BERKAS_TERUNGGAH, NAMA_PEKERJAAN_PINDAI } from "../../../src/modules/m06-documents/index.js";
import { uraiJawaban } from "../../../src/modules/m06-documents/services/clamd.js";
import { magicCocok } from "../../../src/modules/m06-documents/services/scan.service.js";
import { EventHandlerRegistry } from "../../../src/shared/events/index.js";
import { pasangHandlerAntrean, registry as registriPekerjaan } from "../../../src/worker/index.js";
import { RETRY_OPTIONS } from "../../../src/worker/scheduler.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]);
const PDF = Buffer.from("%PDF-1.7\n");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("uraiJawaban — protokol clamd INSTREAM", () => {
    it("OK → bersih; FOUND → terinfeksi beserta nama tanda tangan", () => {
        expect(uraiJawaban("stream: OK")).toEqual({ bersih: true });
        expect(uraiJawaban("stream: Eicar-Test-Signature FOUND")).toEqual({ bersih: false, tanda: "Eicar-Test-Signature" });
    });

    it.each(["INSTREAM size limit exceeded. ERROR", "stream: Can't allocate memory ERROR", ""])("jawaban lain (%j) → galat yang dicoba ulang, BUKAN dianggap bersih", (j) => {
        expect(() => uraiJawaban(j)).toThrow(/tak dikenali/);
    });
});

describe("magicCocok — validasi MIME kedua (SDD-09 §4.3)", () => {
    it.each([
        ["image/png", PNG],
        ["image/jpeg", JPG],
        ["application/pdf", PDF],
        [DOCX, ZIP],
        [XLSX, ZIP],
    ] as const)("%s dengan isi yang sesuai → cocok", (mime, isi) => {
        expect(magicCocok(mime, isi)).toBe(true);
    });

    it.each([
        ["image/png", PDF],
        ["image/jpeg", PNG],
        ["application/pdf", ZIP],
        [DOCX, PDF],
        ["image/png", Buffer.from([0x89, 0x50])],
        ["application/zip", ZIP],
    ] as const)("%s dengan isi lain / terpotong / MIME tak dikenal → tidak cocok", (mime, isi) => {
        expect(magicCocok(mime, isi)).toBe(false);
    });
});

describe("worker — FileUploaded → antrean file-scan (SDD-FS-04, SDD-EVT-07)", () => {
    it("jobId tetap per berkas + opsi percobaan ulang (maks. 3×, SDD-09 §4.2)", async () => {
        const add = vi.fn().mockResolvedValue(undefined);
        const handlers = new EventHandlerRegistry();
        pasangHandlerAntrean(handlers, { add } as unknown as Queue);
        const [handler] = handlers.handlersFor(EVENT_BERKAS_TERUNGGAH);
        const ev = { id: "1", name: EVENT_BERKAS_TERUNGGAH, aggregateType: "stored_file", aggregateId: "42", payload: { file_id: "42" }, actorId: "3", requestId: null, occurredAt: new Date(0), attempts: 0 };
        await handler?.(ev);
        await handler?.(ev);
        expect(add.mock.calls).toEqual([
            [NAMA_PEKERJAAN_PINDAI, { file_id: "42" }, { ...RETRY_OPTIONS, jobId: "file-scan-42" }],
            [NAMA_PEKERJAAN_PINDAI, { file_id: "42" }, { ...RETRY_OPTIONS, jobId: "file-scan-42" }],
        ]);
        expect(RETRY_OPTIONS.attempts).toBe(3);
    });

    it("pekerjaan file-scan terdaftar tanpa cron (dipicu event, bukan jadwal)", () => {
        const p = registriPekerjaan.all().find((j) => j.name === NAMA_PEKERJAAN_PINDAI);
        expect(p).toBeDefined();
        expect(p?.cron).toBeUndefined();
    });
});
