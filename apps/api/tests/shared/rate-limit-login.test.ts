// Kelas `login` hanya menghitung percobaan gagal (NFR-S-07, SDD-SESS-07,
// SDD-13 §4.3) — tanpa Redis: urutan periksa/catat pada middleware.
// Terhadap Redis nyata: tests/integration/rate-limit-login.test.ts.

import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { rateLimit } from "../../src/api/security.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { KELAS_LIMIT } from "../../src/shared/http/index.js";
import type {
    HasilLimit,
    ModeHit,
    RateLimitClass,
} from "../../src/shared/http/index.js";
import { Logger } from "../../src/shared/observability/index.js";

const terbuka: Server[] = [];
afterEach(async () => {
    await Promise.all(
        terbuka.splice(0).map((s) => new Promise((r) => s.close(r))),
    );
});

const hasil = (lolos: boolean): HasilLimit => ({
    lolos,
    batas: 5,
    sisa: lolos ? 3 : 0,
    resetDetik: 90,
});

/** Aplikasi satu route yang menjawab dengan status pilihan uji. */
async function buka(
    kelas: RateLimitClass,
    status: number,
    limiter: {
        hit: (
            k: RateLimitClass,
            p: unknown,
            m?: ModeHit,
        ) => Promise<HasilLimit>;
    },
    entri: string[] = [],
): Promise<{ url: string; handlerDipanggil: () => boolean }> {
    let dipanggil = false;
    const app = express();
    app.post(
        "/masuk",
        rateLimit(
            { rateLimitClass: kelas },
            limiter,
            new Logger({
                clock: new FixedClock(new Date("2026-09-15T00:00:00Z")),
                tulis: (b) => entri.push(b),
            }),
        ),
        (_req, res) => {
            dipanggil = true;
            res.status(status).json({ ok: status < 400 });
        },
    );
    const server = createServer(app);
    terbuka.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return {
        url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/masuk`,
        handlerDipanggil: () => dipanggil,
    };
}

/** Memberi kesempatan listener `finish` menjalankan pencatatan. */
const giliran = () => new Promise((r) => setTimeout(r, 20));

function perekam(lolos = true) {
    const mode: ModeHit[] = [];
    return {
        mode,
        hit: (_k: RateLimitClass, _p: unknown, m: ModeHit = "hit") => {
            mode.push(m);
            return Promise.resolve(hasil(lolos));
        },
    };
}

describe("KELAS_LIMIT.hitung", () => {
    it("hanya `login` yang menghitung kegagalan saja", () => {
        const gagal = Object.entries(KELAS_LIMIT)
            .filter(([, k]) => k.hitung === "gagal")
            .map(([n]) => n);
        expect(gagal).toEqual(["login"]);
    });
});

describe("middleware rateLimit — kelas `login`", () => {
    it("login GAGAL → diperiksa lalu dicatat", async () => {
        const rekam = perekam();
        const { url } = await buka("login", 401, rekam);
        expect((await fetch(url, { method: "POST" })).status).toBe(401);
        await giliran();
        expect(rekam.mode).toEqual(["periksa", "catat"]);
    });

    it("login BERHASIL → hanya diperiksa, tidak mengurangi jatah IP", async () => {
        const rekam = perekam();
        const { url } = await buka("login", 200, rekam);
        expect((await fetch(url, { method: "POST" })).status).toBe(200);
        await giliran();
        expect(rekam.mode).toEqual(["periksa"]);
    });

    it("jatah habis → 429 sebelum handler, dan penolakannya tidak dicatat", async () => {
        const rekam = perekam(false);
        const app = await buka("login", 401, rekam);
        const res = await fetch(app.url, { method: "POST" });
        await giliran();
        expect(res.status).toBe(429);
        expect(app.handlerDipanggil()).toBe(false);
        expect(rekam.mode).toEqual(["periksa"]);
    });

    it("pencatatan yang gagal memicu alarm tanpa mengubah respons", async () => {
        const entri: string[] = [];
        const { url } = await buka(
            "login",
            401,
            {
                hit: (_k, _p, m) =>
                    m === "catat"
                        ? Promise.reject(new Error("Connection is closed."))
                        : Promise.resolve(hasil(true)),
            },
            entri,
        );
        expect((await fetch(url, { method: "POST" })).status).toBe(401);
        await giliran();
        expect(entri).toHaveLength(1);
        expect(JSON.parse(entri[0]!)).toMatchObject({
            level: "error",
            kelas: "login",
        });
    });

    it("kelas lain tetap satu langkah `hit`, apa pun status respons", async () => {
        const rekam = perekam();
        const { url } = await buka("chat", 500, rekam);
        await fetch(url, { method: "POST" });
        await giliran();
        expect(rekam.mode).toEqual(["hit"]);
    });
});
