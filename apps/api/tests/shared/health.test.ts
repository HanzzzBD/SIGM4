// Acceptance PR-00-14: "`llm`/`fcm` mati tidak membuat `ready` gagal"
// (SDD-OBS-06, SDD-15 §4.5, NFR-A-05, NFR-A-06, AI-CTL-10).
//
// Tanpa jaringan: yang diuji adalah aturan registri — siapa yang menentukan
// kesiapan, dan bahwa probe yang gagal, melempar, atau menggantung tidak pernah
// merambat menjadi galat. Probe terhadap PostgreSQL dan Redis nyata ada di
// tests/integration/health.test.ts.

import { describe, expect, it } from "vitest";
import {
    HealthRegistry,
    liveResponse,
    pingCheck,
    readyResponse,
} from "../../src/shared/observability/index.js";
import { ErrorEnvelopeSchema } from "../../src/shared/errors/index.js";
import type {
    CheckResult,
    DependencyName,
    HealthCheck,
} from "../../src/shared/observability/index.js";

type Perilaku = CheckResult["status"] | "lempar" | "gantung";

/** Pemeriksaan tiruan yang menghitung berapa kali ia dipanggil. */
function cek(
    name: DependencyName,
    perilaku: Perilaku,
): HealthCheck & { panggilan: number } {
    const c = {
        name,
        panggilan: 0,
        probe(): Promise<CheckResult> {
            c.panggilan += 1;
            if (perilaku === "lempar") {
                return Promise.reject(
                    new Error(
                        "connect ECONNREFUSED postgres://sigm4:rahasia@db:5432",
                    ),
                );
            }
            if (perilaku === "gantung") return new Promise(() => undefined);
            return Promise.resolve({ status: perilaku });
        },
    };
    return c;
}

const BATAS_UJI_MS = 30;

describe("HealthRegistry — kesiapan (SDD-15 §4.5)", () => {
    it.each<Perilaku>(["down", "lempar", "gantung"])(
        "llm DAN fcm %s → ready tetap siap (acceptance PR-00-14)",
        async (perilaku) => {
            const llm = cek("llm", perilaku);
            const fcm = cek("fcm", perilaku);
            const health = new HealthRegistry(BATAS_UJI_MS).register(
                cek("database", "up"),
                cek("redis", "up"),
                llm,
                fcm,
            );

            expect(await health.readiness()).toBe(true);
            expect(await readyResponse(health)).toMatchObject({
                statusCode: 200,
            });
            // Tidak dipanggil sama sekali: probe readiness tidak membebani penyedia luar.
            expect(llm.panggilan).toBe(0);
            expect(fcm.panggilan).toBe(0);
        },
    );

    it("av_scanner down tidak menggagalkan ready — SDD-15 §4.5 hanya menyebut DB, Redis, storage", async () => {
        const health = new HealthRegistry(BATAS_UJI_MS).register(
            cek("database", "up"),
            cek("av_scanner", "down"),
        );
        expect(await health.readiness()).toBe(true);
    });

    it.each<[DependencyName, Perilaku]>([
        ["database", "down"],
        ["redis", "lempar"],
        ["object_storage", "gantung"],
    ])("%s %s → TIDAK siap, 503", async (nama, perilaku) => {
        const lain = (["database", "redis", "object_storage"] as const).filter(
            (n) => n !== nama,
        );
        const health = new HealthRegistry(BATAS_UJI_MS).register(
            cek(nama, perilaku),
            ...lain.map((n) => cek(n, "up")),
        );

        expect(await health.readiness()).toBe(false);
        const r = await readyResponse(health);
        expect(r.statusCode).toBe(503);
        // Amplop galat Bab 17.2 dengan kode Bab 17.3 `SERVICE_NOT_READY`.
        expect(ErrorEnvelopeSchema.safeParse(r.body).success).toBe(true);
        expect(r.body).toEqual({
            success: false,
            error: {
                code: "SERVICE_NOT_READY",
                message: "Layanan belum siap menerima permintaan.",
            },
            request_id: expect.stringMatching(/^req_/),
        });
    });

    it("dependensi penentu yang degraded tetap siap — lambat bukan alasan keluar rotasi", async () => {
        const health = new HealthRegistry(BATAS_UJI_MS).register(
            cek("database", "degraded"),
        );
        expect(await health.readiness()).toBe(true);
    });

    it("jawaban probe publik tidak membeberkan nama dependensi (SDD-AUTH-01 §4.1)", async () => {
        const health = new HealthRegistry(BATAS_UJI_MS).register(
            cek("database", "down"),
            cek("llm", "down"),
        );
        const teks = JSON.stringify((await readyResponse(health)).body);
        expect(teks).not.toMatch(/database|redis|llm|fcm/);
    });
});

describe("HealthRegistry — ringkasan Kesehatan Integrasi (OBS-06)", () => {
    it("seluruh up → status up, setiap pemeriksaan dilaporkan", async () => {
        const health = new HealthRegistry(BATAS_UJI_MS).register(
            cek("database", "up"),
            cek("llm", "up"),
        );
        expect(await health.summary()).toEqual({
            status: "up",
            checks: { database: { status: "up" }, llm: { status: "up" } },
        });
    });

    it("llm down → ringkasan degraded, BUKAN down", async () => {
        const health = new HealthRegistry(BATAS_UJI_MS).register(
            cek("database", "up"),
            cek("llm", "down"),
        );
        const r = await health.summary();
        expect(r.status).toBe("degraded");
        expect(r.checks.llm).toEqual({ status: "down" });
    });

    it("database down → ringkasan down, meski llm degraded dilaporkan sesudahnya", async () => {
        const health = new HealthRegistry(BATAS_UJI_MS).register(
            cek("database", "down"),
            cek("llm", "degraded"),
        );
        expect((await health.summary()).status).toBe("down");
    });

    it("probe yang melempar menjadi down tanpa membocorkan pesan galatnya", async () => {
        const health = new HealthRegistry(BATAS_UJI_MS).register(
            cek("fcm", "lempar"),
        );
        const r = await health.summary();
        expect(r.checks.fcm).toEqual({
            status: "down",
            note: "pemeriksaan gagal",
        });
        expect(JSON.stringify(r)).not.toContain("rahasia");
    });

    it("probe yang menggantung dijawab down setelah batas waktu, tidak ditunggu", async () => {
        const health = new HealthRegistry(BATAS_UJI_MS).register(
            cek("llm", "gantung"),
        );
        const r = await health.summary();
        expect(r.checks.llm).toEqual({
            status: "down",
            note: "tidak merespons dalam batas waktu",
        });
    });

    it("pendaftaran ganda ditolak", () => {
        expect(() =>
            new HealthRegistry().register(
                cek("redis", "up"),
                cek("redis", "up"),
            ),
        ).toThrow(/redis didaftarkan dua kali/);
    });
});

describe("liveResponse & pingCheck", () => {
    it("live selalu 200 tanpa memanggil dependensi", () => {
        expect(liveResponse()).toEqual({
            statusCode: 200,
            body: { success: true, data: { status: "up" }, meta: null },
        });
    });

    it("pingCheck melaporkan up beserta latensi", async () => {
        const r = await pingCheck("redis", () =>
            Promise.resolve("PONG"),
        ).probe();
        expect(r.status).toBe("up");
        expect(r.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it("ping yang gagal menjadi down lewat registri", async () => {
        const health = new HealthRegistry(BATAS_UJI_MS).register(
            pingCheck("redis", () =>
                Promise.reject(new Error("Connection is closed.")),
            ),
        );
        expect(await health.readiness()).toBe(false);
    });
});
