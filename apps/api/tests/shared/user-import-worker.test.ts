// PR-01-17 — pemasangan impor asinkron pada worker (IMPT-04, JOB-01, JOB-06,
// SDD-EVT-07). Tanpa Redis maupun basis data: antrean diganti tiruan karena yang
// diuji adalah keputusan KITA (nama pekerjaan, jobId tetap, cron opsional),
// bukan jaminan BullMQ.

import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import {
    EVENT_IMPOR_DIMINTA,
    NAMA_PEKERJAAN_IMPOR,
    idJobAntreanImpor,
} from "../../src/modules/m02-users/index.js";
import { EventHandlerRegistry } from "../../src/shared/events/index.js";
import type { OutboxEvent } from "../../src/shared/events/index.js";
import { registry as registriPekerjaan, pasangHandlerAntrean } from "../../src/worker/index.js";
import { JobRegistry, RETRY_OPTIONS, scheduleAll } from "../../src/worker/scheduler.js";

function event(payload: unknown): OutboxEvent {
    return {
        id: "1",
        name: EVENT_IMPOR_DIMINTA,
        aggregateType: "UserImportJob",
        aggregateId: "7",
        payload,
        actorId: "3",
        requestId: null,
        occurredAt: new Date("2026-09-19T03:00:00Z"),
        attempts: 0,
    };
}

describe("pasangHandlerAntrean — UserImportRequested → antrean (IMPT-04)", () => {
    it("memasukkan pekerjaan dengan jobId tetap dan opsi percobaan ulang JOB-06", async () => {
        const add = vi.fn().mockResolvedValue(undefined);
        const handlers = new EventHandlerRegistry();
        pasangHandlerAntrean(handlers, { add } as unknown as Queue);

        const [handler] = handlers.handlersFor(EVENT_IMPOR_DIMINTA);
        await handler?.(event({ job_id: "7", oleh: 3 }));

        expect(add).toHaveBeenCalledWith(
            NAMA_PEKERJAAN_IMPOR,
            { job_id: "7", oleh: 3 },
            { ...RETRY_OPTIONS, jobId: "user-import-7" },
        );
    });

    it("event yang sama dikirim dua kali (at-least-once) memakai jobId yang sama — BullMQ menolak duplikatnya", async () => {
        const add = vi.fn().mockResolvedValue(undefined);
        const handlers = new EventHandlerRegistry();
        pasangHandlerAntrean(handlers, { add } as unknown as Queue);
        const [handler] = handlers.handlersFor(EVENT_IMPOR_DIMINTA);

        await handler?.(event({ job_id: "7", oleh: 3 }));
        await handler?.(event({ job_id: "7", oleh: 3 }));

        const jobId = (call: unknown[]) => (call[2] as { jobId: string }).jobId;
        expect(add.mock.calls.map(jobId)).toEqual([idJobAntreanImpor(7), idJobAntreanImpor(7)]);
    });

    it("hanya UserImportRequested yang dipasang", () => {
        const handlers = new EventHandlerRegistry();
        pasangHandlerAntrean(handlers, { add: vi.fn() } as unknown as Queue);
        expect(handlers.handlersFor("UserImportCompleted")).toHaveLength(0);
    });
});

describe("registri pekerjaan worker", () => {
    it("user-import terdaftar TANPA cron: tidak pernah dijadwalkan, hanya dijalankan bila dimasukkan ke antrean", async () => {
        const definisi = registriPekerjaan.get(NAMA_PEKERJAAN_IMPOR);
        expect(definisi).toBeDefined();
        expect(definisi?.cron).toBeUndefined();

        const upsert = vi.fn().mockResolvedValue(undefined);
        await scheduleAll({ upsertJobScheduler: upsert } as unknown as Queue, registriPekerjaan);
        const dijadwalkan = upsert.mock.calls.map((c) => c[0] as string);
        expect(dijadwalkan).not.toContain(NAMA_PEKERJAAN_IMPOR);
        expect(dijadwalkan).toContain("activity-log-partition");
    });

    it("pekerjaan bercron tetap dijadwalkan, pekerjaan tanpa cron dilewati", async () => {
        const daftar = new JobRegistry().register(
            { name: "berjadwal", cron: "0 0 * * *", handler: () => Promise.resolve() },
            { name: "sesuai-permintaan", handler: () => Promise.resolve() },
        );
        const upsert = vi.fn().mockResolvedValue(undefined);

        await scheduleAll({ upsertJobScheduler: upsert } as unknown as Queue, daftar);

        expect(upsert.mock.calls.map((c) => c[0])).toEqual(["berjadwal"]);
    });
});
