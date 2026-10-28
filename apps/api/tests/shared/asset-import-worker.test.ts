import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { EventHandlerRegistry } from "../../src/shared/events/index.js";
import type { OutboxEvent } from "../../src/shared/events/index.js";
import { registry, pasangHandlerAntrean } from "../../src/worker/index.js";
import { RETRY_OPTIONS } from "../../src/worker/scheduler.js";

describe("worker impor aset — IMPT-04, SDD-EVT-07", () => {
    it("outbox ulang memakai ID BullMQ tetap dan opsi retry", async () => {
        const handlers = new EventHandlerRegistry();
        const add = vi.fn().mockResolvedValue(undefined);
        pasangHandlerAntrean(handlers, { add } as unknown as Queue);
        const event: OutboxEvent = { id: "1", name: "AssetImportRequested", aggregateType: "AssetImportJob", aggregateId: "7", payload: { job_id: "7", oleh: 3 }, actorId: "3", requestId: null, occurredAt: new Date("2026-10-08T03:00:00Z"), attempts: 0 };
        for (const handler of handlers.handlersFor(event.name)) { await handler(event); await handler(event); }
        expect(add).toHaveBeenCalledTimes(2);
        expect(add).toHaveBeenNthCalledWith(1, "asset-import", event.payload, { ...RETRY_OPTIONS, jobId: "asset-import-7" });
        expect(add).toHaveBeenNthCalledWith(2, "asset-import", event.payload, { ...RETRY_OPTIONS, jobId: "asset-import-7" });
    });
    it("pekerjaan terdaftar tanpa cron dan handler selesai bukan antrean impor", () => {
        expect(registry.all().find((job) => job.name === "asset-import")?.cron).toBeUndefined();
        expect(registry.all().find((job) => job.name === "asset-import")?.handler).toBeTypeOf("function");
    });
});
