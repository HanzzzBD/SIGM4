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
import { z } from "zod";
import {
    AuthError,
    DomainError,
    ErrorEnvelopeSchema,
    ForbiddenError,
    NotFoundError,
} from "../../src/shared/errors/index.js";
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
    // Galat domain untuk uji kontrak Bab 17.2 (pesan/details ke klien).
    app.get("/domain-field", () => {
        throw new DomainError(
            "VALIDATION_ERROR",
            "Rentang tanggal beririsan dengan tahun ajaran 2026/2027.",
            {
                field: "tanggal_mulai",
                rule: "AC-YR-99",
                kewajiban: [{ nomor: "PJM-RAHASIA-1" }],
            },
        );
    });
    app.get("/domain-errors", () => {
        throw new DomainError("VALIDATION_ERROR", "Satu atau lebih parameter tidak sah.", {
            errors: [
                { field: "reservasi.ttl_tentative_jam", message: "Nilai harus antara 1 dan 168." },
                { field: "tidak.ada", message: "Parameter tidak dikenal." },
            ],
        });
    });
    app.get("/domain-tanpa-pesan", () => {
        throw new DomainError("BORROWER_BLOCKED", undefined, { field: "peminjam_id" });
    });
    app.get("/domain-500", () => {
        throw new DomainError("INTERNAL_ERROR", "rahasia postgres jangan bocor", { field: "x" });
    });
    app.get("/domain-503", () => {
        throw new DomainError("STORAGE_UNAVAILABLE", "bucket s3://rahasia tidak terjangkau", { field: "x" });
    });
    app.get("/domain-forbidden", () => {
        throw new DomainError("FORBIDDEN", "objek 42 ada tetapi bukan milik Anda", { field: "id" });
    });
    app.get("/forbidden", () => {
        throw new ForbiddenError("INSUFFICIENT_PERMISSION");
    });
    app.get("/unauth", () => {
        throw new AuthError();
    });
    app.get("/hilang-berpesan", () => {
        throw new NotFoundError("Unit kerja tidak ditemukan.");
    });
    app.get("/zod", () => {
        z.object({ email: z.email() }).parse({ email: "rahasia" });
    });
    app.get("/pg", () => {
        throw Object.assign(new Error("Key (email)=(rahasia@sekolah.sch.id) already exists."), {
            code: "23505",
            constraint: "users_email_uq",
        });
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

// Kontrak galat Bab 17.2: `error.message` dan `error.details` (larik
// { field, message }) sampai ke klien HANYA dari DomainError galat klien yang
// pesannya sengaja ditulis. Bentuk amplopnya tidak berubah: code, message, details
// (bila ada), request_id — tidak ada format baru.
describe("amplop galat — message dan details ke klien (Bab 17.2)", () => {
    async function galat(path: string): Promise<{ status: number; teks: string; body: { success: boolean; error: { code: string; message: string; details?: unknown }; request_id: string }; id: string | null }> {
        const res = await fetch(`${await buka()}${path}`);
        const teks = await res.text();
        const body = JSON.parse(teks);
        // Skema `strict` yang sama dengan dokumen OpenAPI: format baru pada kondisi mana pun gagal di sini.
        expect(ErrorEnvelopeSchema.safeParse(body).success, path).toBe(true);
        return { status: res.status, teks, body, id: res.headers.get("x-request-id") };
    }

    it("DomainError berpesan + {field}: code, message tertulis, details[{field, message}], request_id — dan kunci non-kontrak tidak bocor", async () => {
        const hasil = await galat("/domain-field");
        expect(hasil.status).toBe(422);
        expect(hasil.body).toEqual({
            success: false,
            error: {
                code: "VALIDATION_ERROR",
                message: "Rentang tanggal beririsan dengan tahun ajaran 2026/2027.",
                details: [
                    { field: "tanggal_mulai", message: "Rentang tanggal beririsan dengan tahun ajaran 2026/2027." },
                ],
            },
            request_id: hasil.id,
        });
        expect(hasil.teks).not.toMatch(/AC-YR-99|PJM-RAHASIA-1|kewajiban/);
    });

    it("{ errors: [{ field, message }] } menjadi details butir per butir", async () => {
        const hasil = await galat("/domain-errors");
        expect(hasil.status).toBe(422);
        expect(hasil.body.error).toEqual({
            code: "VALIDATION_ERROR",
            message: "Satu atau lebih parameter tidak sah.",
            details: [
                { field: "reservasi.ttl_tentative_jam", message: "Nilai harus antara 1 dan 168." },
                { field: "tidak.ada", message: "Parameter tidak dikenal." },
            ],
        });
    });

    it("NotFoundError berpesan: pesannya sampai, tanpa details; tanpa pesan tetap generik", async () => {
        const berpesan = await galat("/hilang-berpesan");
        expect(berpesan.status).toBe(404);
        expect(berpesan.body.error).toEqual({ code: "NOT_FOUND", message: "Unit kerja tidak ditemukan." });
        const generik = await galat("/hilang");
        expect(generik.body.error).toEqual({ code: "NOT_FOUND", message: "Sumber daya tidak ditemukan." });
    });

    it("DomainError tanpa pesan tertulis: pesan generik per kode, tanpa details", async () => {
        const hasil = await galat("/domain-tanpa-pesan");
        expect(hasil.status).toBe(422);
        expect(hasil.body.error).toEqual({ code: "BORROWER_BLOCKED", message: "Permintaan tidak dapat diproses." });
    });

    it.each(["/domain-500", "/domain-503"])("%s: galat server tidak membawa pesan maupun details tertulis (NFR-R-10)", async (path) => {
        const hasil = await galat(path);
        expect(hasil.teks).not.toMatch(/rahasia|postgres|s3:/);
        expect(hasil.body.error).not.toHaveProperty("details");
    });

    it.each(["/forbidden", "/unauth", "/domain-forbidden"])("%s: jawaban autentikasi/otorisasi seragam, tanpa pesan tertulis maupun details (SDD-AUTH-08)", async (path) => {
        const hasil = await galat(path);
        expect(hasil.teks).not.toMatch(/objek 42|bukan milik/);
        expect(hasil.body.error).not.toHaveProperty("details");
    });

    it("galat skema (Zod) tetap 400 generik tanpa details dan tanpa teks Inggris/nilai masukan", async () => {
        const hasil = await galat("/zod");
        expect(hasil.status).toBe(400);
        expect(hasil.body).toEqual({
            success: false,
            error: { code: "INVALID_REQUEST", message: "Permintaan tidak valid." },
            request_id: hasil.id,
        });
        expect(hasil.teks).not.toMatch(/rahasia|Invalid/);
    });

    it("galat basis data (23505) tetap DUPLICATE_CODE generik — nilai unik yang dilanggar tidak bocor", async () => {
        const hasil = await galat("/pg");
        expect(hasil.status).toBe(409);
        expect(hasil.body.error).toEqual({ code: "DUPLICATE_CODE", message: "Data yang dimasukkan sudah digunakan." });
        expect(hasil.teks).not.toMatch(/rahasia|sekolah\.sch\.id|users_email_uq/);
    });
});
