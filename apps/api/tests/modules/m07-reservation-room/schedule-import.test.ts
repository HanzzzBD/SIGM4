import { describe, expect, it } from "vitest";
import { ImportRoomScheduleBodySchema, ROOM_SCHEDULE_IMPORT_COLUMNS } from "@sigm4/schemas";
import { readRoomScheduleFile } from "../../../src/modules/m07-reservation-room/services/room-schedule-import-file.js";
import { alasanTidakSah } from "../../../src/modules/m07-reservation-room/services/schedule.js";
import { EventHandlerRegistry } from "../../../src/shared/events/index.js";
import type { OutboxEvent } from "../../../src/shared/events/index.js";
import { pasangHandlerAntrean, registry } from "../../../src/worker/index.js";
import { RETRY_OPTIONS } from "../../../src/worker/scheduler.js";
import type { Queue } from "bullmq";
import { vi } from "vitest";

describe("PR-03-35/38 — parser, kontrak dan antrean", () => {
    it("UTF-8, quoted newline dan label berisi delimiter tetap satu baris data", async () => {
        const text = '\uFEFF' + ROOM_SCHEDULE_IMPORT_COLUMNS.join(";") + '\r\nR-1;Senin;07:00;08:00;"KBM; seni\nkelas";2027-07-01;2028-06-30';
        const result = await readRoomScheduleFile("jadwal.csv", Buffer.from(text)); expect(result).toHaveLength(1); expect(result[0]?.data["label_kegiatan"]).toBe("KBM; seni\nkelas");
    });
    it("encoding rusak, CSV tak tertutup, ukuran dan base64 tidak valid ditolak", async () => {
        await expect(readRoomScheduleFile("jadwal.csv", Buffer.from([0xff]))).rejects.toMatchObject({ kode: "INVALID_REQUEST" });
        await expect(readRoomScheduleFile("jadwal.csv", Buffer.from('kode_ruangan,hari\n"R-1,Senin'))).rejects.toMatchObject({ kode: "INVALID_REQUEST" });
        await expect(readRoomScheduleFile("jadwal.csv", Buffer.alloc(6_000_001))).rejects.toMatchObject({ kode: "INVALID_REQUEST" });
        expect(ImportRoomScheduleBodySchema.safeParse({ filename: "jadwal.csv", content_base64: "!!!" }).success).toBe(false);
        expect(ImportRoomScheduleBodySchema.safeParse({ filename: "jadwal.csv", content_base64: "YWJj", batalkan_bentrok: true }).success).toBe(false);
    });
    it("outbox ulang memakai job ID tetap, retry dan tanpa cron", async () => {
        const handlers = new EventHandlerRegistry(), add = vi.fn().mockResolvedValue(undefined); pasangHandlerAntrean(handlers, { add } as unknown as Queue);
        const event: OutboxEvent = { id: "1", name: "RoomScheduleImportRequested", aggregateType: "RoomScheduleImportJob", aggregateId: "7", payload: { job_id: "7", oleh: 3 }, actorId: "3", requestId: null, occurredAt: new Date("2026-10-15T03:00:00Z"), attempts: 0 };
        for (const h of handlers.handlersFor(event.name)) { await h(event); await h(event); }
        expect(add).toHaveBeenCalledTimes(2); expect(add).toHaveBeenLastCalledWith("room-schedule-import", event.payload, { ...RETRY_OPTIONS, jobId: "room-schedule-import-7" });
        expect(registry.all().find(j => j.name === "room-schedule-import")).toMatchObject({ handler: expect.any(Function) }); expect(registry.all().find(j => j.name === "room-schedule-import")?.cron).toBeUndefined();
    });
    it("batas jam dihitung dari selisih waktu tanpa pembulatan; mendesak tetap dibatasi", () => {
        const k = { tanggal: "2027-09-07", mulai: new Date("2027-09-07T08:00:00+07:00"), selesai: new Date("2027-09-07T10:00:00+07:00") };
        const a = { sekarang: new Date("2027-09-06T09:00:00+07:00"), jam: { startMinute: 360, endMinute: 1080 }, hariKerja: new Set([2]), libur: new Map<string, string>(), granularitasMenit: 15, jarakMinimumHari: 1, mendesak: true, horizonHari: 90, durasiMaksimumJam: 2 };
        expect(alasanTidakSah(k, a)).toBeNull(); expect(alasanTidakSah({ ...k, selesai: new Date("2027-09-07T10:15:00+07:00") }, a)).toContain("maksimum 2 jam");
    });
});
