// Penghentian proses yang rapi (SDD-INF-04/05, keputusan 57–60).
//
// Diuji pada mekanismenya sendiri: urutan langkah, tepat-sekali, kegagalan
// langkah, tenggat yang memaksa, pemasangan sinyal, dan server HTTP yang ditutup
// tanpa memotong permintaan berjalan.

import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { FixedClock } from "../../src/shared/clock/index.js";
import {
    BATAS_PAKSA_MS,
    Penghenti,
    tutupServer,
} from "../../src/shared/lifecycle/index.js";
import type {
    LangkahHenti,
    ProsesTarget,
} from "../../src/shared/lifecycle/index.js";
import {
    HealthRegistry,
    Logger,
} from "../../src/shared/observability/index.js";

function logger(baris: string[]): Logger {
    return new Logger({
        clock: new FixedClock(new Date("2026-09-15T00:00:00Z")),
        level: "debug",
        tulis: (b) => baris.push(b),
    });
}

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

function langkah(
    nama: string,
    jejak: string[],
    opsi: { lamaMs?: number; gagal?: boolean; paksa?: () => void } = {},
): LangkahHenti {
    return {
        nama,
        jalankan: async () => {
            jejak.push(`mulai:${nama}`);
            if (opsi.lamaMs !== undefined) await tidur(opsi.lamaMs);
            if (opsi.gagal === true) throw new Error(`${nama} rusak`);
            jejak.push(`selesai:${nama}`);
        },
        ...(opsi.paksa === undefined
            ? {}
            : {
                  paksa: () => {
                      opsi.paksa?.();
                      return Promise.resolve();
                  },
              }),
    };
}

describe("Penghenti", () => {
    it("menjalankan langkah berurutan lalu keluar 0", async () => {
        const jejak: string[] = [];
        const log: string[] = [];
        const p = new Penghenti(
            [langkah("a", jejak, { lamaMs: 20 }), langkah("b", jejak)],
            { batasMs: 1_000, logger: logger(log) },
        );
        await expect(p.hentikan("SIGTERM")).resolves.toBe(0);
        expect(jejak).toEqual(["mulai:a", "selesai:a", "mulai:b", "selesai:b"]);
        expect(log.join("\n")).toContain("berhenti dengan rapi");
    });

    it("tepat sekali — sinyal kedua menunggu penghentian yang sama", async () => {
        const jejak: string[] = [];
        const p = new Penghenti([langkah("a", jejak, { lamaMs: 20 })], {
            batasMs: 1_000,
            logger: logger([]),
        });
        const [k1, k2] = await Promise.all([
            p.hentikan("SIGTERM"),
            p.hentikan("SIGINT"),
        ]);
        expect([k1, k2]).toEqual([0, 0]);
        expect(jejak.filter((j) => j === "mulai:a")).toHaveLength(1);
    });

    it("langkah yang gagal tidak menghentikan langkah berikutnya, tetapi keluar 1", async () => {
        const jejak: string[] = [];
        const log: string[] = [];
        const p = new Penghenti(
            [langkah("a", jejak, { gagal: true }), langkah("koneksi", jejak)],
            { batasMs: 1_000, logger: logger(log) },
        );
        await expect(p.hentikan("SIGTERM")).resolves.toBe(1);
        expect(jejak).toContain("selesai:koneksi");
        expect(log.join("\n")).toContain('Langkah henti \\"a\\" gagal');
    });

    it("tenggat habis → langkah aktif dipaksa, sisanya tidak dijalankan, keluar 1 (keputusan 59)", async () => {
        const jejak: string[] = [];
        const log: string[] = [];
        let dipaksa = false;
        const p = new Penghenti(
            [
                langkah("drain", jejak, {
                    lamaMs: 500,
                    paksa: () => (dipaksa = true),
                }),
                langkah("koneksi", jejak),
            ],
            { batasMs: 50, logger: logger(log) },
        );
        await expect(p.hentikan("SIGTERM")).resolves.toBe(1);
        expect(dipaksa).toBe(true);
        expect(log.join("\n")).toContain("Tenggat drain habis");
        expect(log.join("\n")).toContain('"langkah":"drain"');
        // Langkah berikutnya tidak sempat mulai sebelum proses keluar.
        await tidur(600);
        expect(jejak).not.toContain("mulai:koneksi");
    });

    it("langkah paksa yang ikut menggantung tetap tidak menahan proses (BATAS_PAKSA_MS)", async () => {
        // Bentuk yang benar-benar terjadi: Worker.close(true) BullMQ mengembalikan
        // promise penutupan yang sudah menunggu job aktif.
        const menggantung: LangkahHenti = {
            nama: "drain",
            jalankan: () => new Promise<void>(() => undefined),
            paksa: () => new Promise<void>(() => undefined),
        };
        const p = new Penghenti([menggantung], {
            batasMs: 50,
            logger: logger([]),
        });
        const mulai = performance.now();
        await expect(p.hentikan("SIGTERM")).resolves.toBe(1);
        const lama = performance.now() - mulai;
        expect(lama).toBeGreaterThanOrEqual(BATAS_PAKSA_MS);
        expect(lama).toBeLessThan(BATAS_PAKSA_MS + 1_000);
    });

    it("pasang() menangkap SIGTERM dan SIGINT lalu keluar dengan kodenya", async () => {
        const emitter = new EventEmitter();
        const keluar: number[] = [];
        const proses: ProsesTarget = {
            once: (sinyal, penangkap) => emitter.once(sinyal, penangkap),
            exit: (kode) => keluar.push(kode),
        };
        const p = new Penghenti([langkah("a", [])], {
            batasMs: 1_000,
            logger: logger([]),
        });
        p.pasang(proses);
        expect(emitter.listenerCount("SIGTERM")).toBe(1);
        expect(emitter.listenerCount("SIGINT")).toBe(1);
        emitter.emit("SIGTERM");
        await tidur(20);
        expect(keluar).toEqual([0]);
    });
});

describe("HealthRegistry saat berhenti", () => {
    it("readiness langsung tidak siap, tanpa memanggil probe (SDD-INF-04)", async () => {
        let dipanggil = 0;
        const h = new HealthRegistry().register({
            name: "database",
            probe: () => {
                dipanggil += 1;
                return Promise.resolve({ status: "up" });
            },
        });
        await expect(h.readiness()).resolves.toBe(true);
        h.tandaiBerhenti();
        expect(h.sedangBerhenti).toBe(true);
        await expect(h.readiness()).resolves.toBe(false);
        expect(dipanggil).toBe(1);
    });
});

describe("tutupServer", () => {
    it("menuntaskan permintaan berjalan, lalu menolak koneksi baru", async () => {
        const server = createServer((req, res) => {
            const lama = req.url === "/lama" ? 150 : 0;
            setTimeout(() => res.end("ok"), lama);
        });
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        const { port } = server.address() as AddressInfo;
        const base = `http://127.0.0.1:${String(port)}`;

        const berjalan = fetch(`${base}/lama`);
        await tidur(30);
        const tutup = tutupServer(server);

        const respons = await berjalan;
        expect(respons.status).toBe(200);
        expect(await respons.text()).toBe("ok");
        await tutup;
        expect(server.listening).toBe(false);

        await expect(fetch(`${base}/baru`)).rejects.toThrow();
    });

    it("tidak tertahan koneksi keep-alive yang baru menganggur setelah responsnya selesai", async () => {
        // Klien fetch menyimpan koneksinya di pool (keep-alive). Tanpa penyapuan
        // berulang, server.close() baru selesai saat keepAliveTimeout habis.
        const server = createServer((_req, res) => {
            setTimeout(() => res.end("ok"), 150);
        });
        server.keepAliveTimeout = 5_000;
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        const { port } = server.address() as AddressInfo;

        const berjalan = fetch(`http://127.0.0.1:${String(port)}/`);
        await tidur(30);
        const mulai = performance.now();
        const tutup = tutupServer(server);
        await (await berjalan).text();
        await tutup;
        expect(performance.now() - mulai).toBeLessThan(1_500);
    });

    it("server yang belum pernah menyala tidak dianggap galat", async () => {
        await expect(tutupServer(createServer())).resolves.toBeUndefined();
    });
});
