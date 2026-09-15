// Ujung rantai SDD-06 §4.2 (SDD-API-04, SDD-OBS-03, NFR-R-10, Bab 17.2).
//
// Uji ini berjalan dengan NODE_ENV bukan `production` — persis mode yang
// sebelumnya membocorkan pesan galat asli dan stack trace ke klien.

import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { awalRantai, ujungRantai } from "../../src/api/chain.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { NotFoundError } from "../../src/shared/errors/index.js";
import {
    Logger,
    konteksSaatIni,
} from "../../src/shared/observability/index.js";

const terbuka: Server[] = [];
afterEach(async () => {
    await Promise.all(
        terbuka.splice(0).map((s) => new Promise((r) => s.close(r))),
    );
});

async function buka(entri: string[] = []): Promise<string> {
    const deps = {
        security: { objectStorageOrigin: "http://minio:9000" },
        limiter: {
            hit: () =>
                Promise.resolve({
                    lolos: true,
                    batas: 100,
                    sisa: 99,
                    resetDetik: 60,
                }),
        },
        logger: new Logger({
            clock: new FixedClock(new Date("2026-09-15T00:00:00Z")),
            tulis: (baris) => entri.push(baris),
        }),
    };
    const app = express();
    app.set("trust proxy", 1);
    app.use(awalRantai(deps));
    app.get("/ok", (_req, res) => {
        res.json({ dari_konteks: konteksSaatIni()?.requestId });
    });
    app.get("/meledak", () => {
        throw new Error("koneksi postgres://sigm4:rahasia@db:5432 gagal");
    });
    app.get("/meledak-async", async () => {
        await Promise.resolve();
        throw new Error("rahasia dari jalur async");
    });
    app.get("/hilang", () => {
        throw new NotFoundError();
    });
    // Parameter path didekode router; URL rusak di sini melempar galat 400.
    app.get("/barang/:id", (req, res) => {
        res.json({ id: req.params.id });
    });
    app.use(ujungRantai(deps));
    const server = createServer(app);
    terbuka.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

describe("requestId (SDD-OBS-03)", () => {
    it("setiap respons membawa X-Request-Id baru yang sama dengan konteks permintaan", async () => {
        const url = await buka();
        const [a, b] = await Promise.all([
            fetch(`${url}/ok`),
            fetch(`${url}/ok`),
        ]);
        const idA = a.headers.get("x-request-id");
        expect(idA).toMatch(/^req_/);
        expect(idA).not.toBe(b.headers.get("x-request-id"));
        expect(await a.json()).toEqual({ dari_konteks: idA });
    });

    it("header masuk tidak dipercaya — klien tidak dapat memilih request_id-nya", async () => {
        const res = await fetch(`${await buka()}/ok`, {
            headers: { "X-Request-Id": "req_palsu" },
        });
        expect(res.headers.get("x-request-id")).not.toBe("req_palsu");
    });
});

describe("404 (Bab 17.2, NFR-S-07)", () => {
    it("route tak dikenal → JSON NOT_FOUND ber-X-RateLimit-* dan request_id yang sama dengan header", async () => {
        const res = await fetch(`${await buka()}/api/v1/tidak-ada`);
        expect(res.status).toBe(404);
        expect(res.headers.get("content-type")).toMatch(/application\/json/);
        expect(res.headers.get("x-ratelimit-limit")).toBe("100");
        expect(await res.json()).toEqual({
            success: false,
            error: {
                code: "NOT_FOUND",
                message: "Sumber daya tidak ditemukan.",
            },
            request_id: res.headers.get("x-request-id"),
        });
    });

    it("NotFoundError dari handler dipetakan ke 404 tanpa alarm", async () => {
        const entri: string[] = [];
        const res = await fetch(`${await buka(entri)}/hilang`);
        expect(res.status).toBe(404);
        expect(await res.json()).toMatchObject({
            error: { code: "NOT_FOUND" },
        });
        expect(entri).toEqual([]);
    });
});

describe("errorMapper (SDD-API-04, NFR-R-10)", () => {
    it("berjalan di luar production — mode yang dulu membocorkan stack trace", () => {
        expect(process.env["NODE_ENV"]).not.toBe("production");
    });

    it.each(["/meledak", "/meledak-async"])(
        "%s → 500 INTERNAL_ERROR JSON tanpa pesan asli maupun stack trace",
        async (path) => {
            const entri: string[] = [];
            const res = await fetch(`${await buka(entri)}${path}`);
            const teks = await res.text();

            expect(res.status).toBe(500);
            expect(res.headers.get("content-type")).toMatch(
                /application\/json/,
            );
            expect(teks).not.toMatch(/rahasia|postgres|at |Error:/);
            expect(JSON.parse(teks)).toEqual({
                success: false,
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Terjadi kesalahan pada server.",
                },
                request_id: res.headers.get("x-request-id"),
            });

            // Pesan asli tetap ada — di log terstruktur, berkorelasi lewat request_id.
            expect(entri).toHaveLength(1);
            expect(JSON.parse(entri[0]!)).toMatchObject({
                level: "error",
                kode: "INTERNAL_ERROR",
                request_id: res.headers.get("x-request-id"),
            });
        },
    );

    it("parameter URL yang rusak → 400 INVALID_REQUEST, bukan 500", async () => {
        const entri: string[] = [];
        const res = await fetch(`${await buka(entri)}/barang/%E0%A4%A`);
        // Galat klien tidak memicu alarm.
        expect(entri).toEqual([]);
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({
            error: { code: "INVALID_REQUEST" },
        });
    });
});
