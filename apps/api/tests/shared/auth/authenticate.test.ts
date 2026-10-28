// `authenticate` + gerbang ganti password (SDD-AUTH-09 langkah 1–2, SDD-SESS-02, FR-01.1 A4).
// Tanpa basis data: PermissionCache diganti pembaca dalam memori, JwtKeys dan JWT-nya sungguhan.

import { createServer } from "node:http";
import type { AddressInfo, Server } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { errorHandler } from "../../../src/api/chain.js";
import {
    PermissionCache,
    authenticate,
    authenticated,
    authorize,
    gerbangGantiPassword,
    getAuthContext,
    getSesiId,
} from "../../../src/shared/auth/index.js";
import type { EffectivePermissions, Scope, SessionChecker } from "../../../src/shared/auth/index.js";
import { FixedClock } from "../../../src/shared/clock/index.js";
import { Logger, konteksSaatIni } from "../../../src/shared/observability/index.js";
import { ACCESS_TOKEN_TTL_DETIK } from "../../../src/shared/security/index.js";
import { kunciUji } from "../../helpers/auth.js";

const T0 = new Date("2026-09-19T03:00:00Z");
const kunci = kunciUji();
const clock = new FixedClock(T0);
const logger = new Logger({ clock, tulis: () => undefined });

interface Akun {
    status?: "AKTIF" | "NONAKTIF";
    scopes?: Map<string, Scope>;
}
const akun = new Map<number, Akun>();
let panggilanCache = 0;

const cachePalsu = {
    load: (id: number): Promise<EffectivePermissions | undefined> => {
        panggilanCache += 1;
        const a = akun.get(id);
        if (a === undefined) return Promise.resolve(undefined);
        return Promise.resolve({
            roleId: "1",
            roleCode: "GURU",
            roleVersion: "1",
            userStatus: a.status ?? "AKTIF",
            scopes: a.scopes ?? new Map<string, Scope>([["setting.view", "all"]]),
        });
    },
} as unknown as PermissionCache;

/** Sesi yang sudah dicabut (`sid`); pemeriksa sesi nyata diuji terhadap PostgreSQL di `auth-session.test.ts`. */
const sesiMati = new Set<string>();
const sesiPalsu: SessionChecker = { aktif: (_userId, sid) => Promise.resolve(!sesiMati.has(sid)) };
const authDeps = { jwtKeys: kunci, permissions: cachePalsu, sessions: sesiPalsu, clock };

const terbuka: Server[] = [];
afterEach(async () => {
    await Promise.all(terbuka.splice(0).map((s) => new Promise((r) => s.close(r))));
    akun.clear();
    sesiMati.clear();
    panggilanCache = 0;
});

async function mulai(): Promise<string> {
    const app = express();
    app.use(authenticate(authDeps));
    app.use(gerbangGantiPassword("/api/v1/auth/"));
    app.get("/api/v1/terkunci", authorize("setting.view"), (_req, res) => {
        res.json({
            userId: getAuthContext(res)?.userId,
            role: getAuthContext(res)?.roleCode,
            konteks: konteksSaatIni()?.userId,
        });
    });
    app.get("/api/v1/manage", authorize("setting.manage"), (_req, res) => {
        res.json({ ok: true });
    });
    app.get("/api/v1/saya", authenticated(), (_req, res) => {
        res.json({ sid: getSesiId(res), userId: getAuthContext(res)?.userId });
    });
    app.get("/api/v1/publik", (_req, res) => {
        res.json({ ada: getAuthContext(res) !== undefined });
    });
    app.post("/api/v1/auth/password/change", (_req, res) => {
        res.json({ ok: true });
    });
    app.use(errorHandler(logger));
    const server = createServer(app);
    terbuka.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

const token = (sub = "7", pwd = false, sekarang = T0) => kunci.terbitkan({ sub, sid: "sesi-1", pwd, amr: ["pwd"] }, sekarang);
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
async function ambil(url: string, path: string, headers: Record<string, string> = {}, metode = "GET") {
    const res = await fetch(`${url}${path}`, { method: metode, headers });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> & { error?: { code: string } } };
}

describe("authenticate — sumber token", () => {
    it("tanpa token → tidak ada AuthContext: route terkunci 401 UNAUTHENTICATED", async () => {
        const url = await mulai();
        const r = await ambil(url, "/api/v1/terkunci");
        expect(r.status).toBe(401);
        expect(r.json.error?.code).toBe("UNAUTHENTICATED");
        expect(panggilanCache).toBe(0);
    });

    it("Bearer sah → AuthContext berisi pengguna dan peran; konteks permintaan membawa userId", async () => {
        akun.set(7, {});
        const url = await mulai();
        const r = await ambil(url, "/api/v1/terkunci", bearer(token()));
        expect(r.status).toBe(200);
        expect(r.json).toEqual({ userId: 7, role: "GURU", konteks: 7 });
    });

    it("cookie akses web sah diterima bila tidak ada header Authorization", async () => {
        akun.set(7, {});
        const url = await mulai();
        const r = await ambil(url, "/api/v1/terkunci", { cookie: `sigm4_at=${token()}` });
        expect(r.status).toBe(200);
        expect(r.json["userId"]).toBe(7);
    });

    it("header Authorization didahulukan: Bearer rusak + cookie sah → tetap 401 (tidak jatuh ke cookie)", async () => {
        akun.set(7, {});
        const url = await mulai();
        const r = await ambil(url, "/api/v1/terkunci", { authorization: "Bearer rusak", cookie: `sigm4_at=${token()}` });
        expect(r.status).toBe(401);
        expect(r.json.error?.code).toBe("UNAUTHENTICATED");
    });

    it.each(["Bearer", "Bearer ", "Basic dXNlcjpwYXNz", "Bearer a b", "token-tanpa-skema"])(
        "header Authorization berbentuk salah (%j) → 401",
        async (header) => {
            akun.set(7, {});
            const url = await mulai();
            const r = await ambil(url, "/api/v1/terkunci", { authorization: header });
            expect(r.status).toBe(401);
            expect(r.json.error?.code).toBe("UNAUTHENTICATED");
        },
    );
});

describe("authenticate — token ditolak", () => {
    it("kedaluwarsa → 401 TOKEN_EXPIRED (klien tahu harus refresh); tanda tangan palsu → UNAUTHENTICATED", async () => {
        akun.set(7, {});
        const url = await mulai();
        const lama = token("7", false, new Date(T0.getTime() - (ACCESS_TOKEN_TTL_DETIK + 1) * 1000));
        const kedaluwarsa = await ambil(url, "/api/v1/terkunci", bearer(lama));
        expect(kedaluwarsa.status).toBe(401);
        expect(kedaluwarsa.json.error?.code).toBe("TOKEN_EXPIRED");

        const asing = kunciUji().terbitkan({ sub: "7", sid: "s", pwd: false, amr: ["pwd"] }, T0);
        const palsu = await ambil(url, "/api/v1/terkunci", bearer(asing));
        expect(palsu.status).toBe(401);
        expect(palsu.json.error?.code).toBe("UNAUTHENTICATED");
    });

    it("akun NONAKTIF kehilangan akses seketika, meski tokennya belum kedaluwarsa (PM-05)", async () => {
        akun.set(7, { status: "NONAKTIF" });
        const url = await mulai();
        const r = await ambil(url, "/api/v1/terkunci", bearer(token()));
        expect(r.status).toBe(401);
        expect(r.json.error?.code).toBe("UNAUTHENTICATED");
    });

    it("pengguna sudah tidak ada → 401", async () => {
        const url = await mulai();
        const r = await ambil(url, "/api/v1/terkunci", bearer(token("999")));
        expect(r.status).toBe(401);
    });

    it("authenticate LENIENT: route publik tetap terjangkau dengan token kedaluwarsa (refresh/login bergantung padanya)", async () => {
        akun.set(7, {});
        const url = await mulai();
        const lama = token("7", false, new Date(T0.getTime() - (ACCESS_TOKEN_TTL_DETIK + 1) * 1000));
        expect((await ambil(url, "/api/v1/publik", bearer(lama))).json).toEqual({ ada: false });
        expect((await ambil(url, "/api/v1/publik", bearer(token()))).json).toEqual({ ada: true });
    });
});

describe("authenticate — permission efektif dibaca ulang tiap permintaan (PM-05)", () => {
    it("perubahan permission berlaku pada permintaan berikutnya dengan token yang SAMA", async () => {
        akun.set(7, { scopes: new Map<string, Scope>([["setting.view", "all"]]) });
        const url = await mulai();
        const t = token();
        expect((await ambil(url, "/api/v1/manage", bearer(t))).status).toBe(403);
        akun.set(7, { scopes: new Map<string, Scope>([["setting.manage", "all"]]) });
        expect((await ambil(url, "/api/v1/manage", bearer(t))).status).toBe(200);
        expect(panggilanCache).toBe(2);
    });

    it("AuthContext tanpa permission route → 403 INSUFFICIENT_PERMISSION, bukan 401", async () => {
        akun.set(7, { scopes: new Map() });
        const url = await mulai();
        const r = await ambil(url, "/api/v1/terkunci", bearer(token()));
        expect(r.status).toBe(403);
        expect(r.json.error?.code).toBe("INSUFFICIENT_PERMISSION");
    });
});

describe("gerbangGantiPassword (SDD-AUTH-09 langkah 2, FR-01.1 A4)", () => {
    it("klaim pwd=true → 403 PASSWORD_CHANGE_REQUIRED pada route biasa, sebelum permission diperiksa", async () => {
        akun.set(7, { scopes: new Map() });
        const url = await mulai();
        const r = await ambil(url, "/api/v1/terkunci", bearer(token("7", true)));
        expect(r.status).toBe(403);
        expect(r.json.error?.code).toBe("PASSWORD_CHANGE_REQUIRED");
    });

    it("alur autentikasi (/auth/*) tetap terjangkau agar pengguna dapat menggantinya", async () => {
        akun.set(7, {});
        const url = await mulai();
        const r = await ambil(url, "/api/v1/auth/password/change", bearer(token("7", true)), "POST");
        expect(r.status).toBe(200);
    });

    it("awalan dicocokkan utuh: /api/v1/authorize bukan bagian dari /api/v1/auth/", async () => {
        akun.set(7, {});
        const app = express();
        app.use(authenticate(authDeps));
        app.use(gerbangGantiPassword("/api/v1/auth/"));
        app.get("/api/v1/authorize", (_req, res) => {
            res.json({ ok: true });
        });
        app.use(errorHandler(logger));
        const server = createServer(app);
        terbuka.push(server);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
        expect((await ambil(url, "/api/v1/authorize", bearer(token("7", true)))).status).toBe(403);
    });

    it("pwd=false tidak digerbangi", async () => {
        akun.set(7, {});
        const url = await mulai();
        expect((await ambil(url, "/api/v1/terkunci", bearer(token("7", false)))).status).toBe(200);
    });

    it("tanpa AuthContext gerbang tidak menolak — itu urusan authorize (401)", async () => {
        const url = await mulai();
        expect((await ambil(url, "/api/v1/terkunci")).json.error?.code).toBe("UNAUTHENTICATED");
    });
});

describe("sesi yang dicabut (FR-01.2 AC, SDD-04 §4.6)", () => {
    it("access token dari sesi yang sudah dicabut ditolak 401 — meski tanda tangan dan masa berlakunya sah", async () => {
        akun.set(7, {});
        const url = await mulai();
        const t = token();
        expect((await ambil(url, "/api/v1/terkunci", bearer(t))).status).toBe(200);
        sesiMati.add("sesi-1");
        const r = await ambil(url, "/api/v1/terkunci", bearer(t));
        expect(r.status).toBe(401);
        expect(r.json.error?.code).toBe("UNAUTHENTICATED");
    });

    it("pemeriksaan dilakukan pada SETIAP permintaan (tanpa cache): pencabutan berlaku pada permintaan berikutnya", async () => {
        akun.set(7, {});
        const url = await mulai();
        const t = token();
        for (const hidup of [true, true, false, false]) {
            if (!hidup) sesiMati.add("sesi-1");
            expect((await ambil(url, "/api/v1/terkunci", bearer(t))).status).toBe(hidup ? 200 : 401);
        }
    });

    it("hanya sesi yang dicabut yang mati: sesi lain milik pengguna yang sama tetap berjalan", async () => {
        akun.set(7, {});
        const url = await mulai();
        const lain = kunci.terbitkan({ sub: "7", sid: "sesi-2", pwd: false, amr: ["pwd"] }, T0);
        sesiMati.add("sesi-1");
        expect((await ambil(url, "/api/v1/terkunci", bearer(token()))).status).toBe(401);
        expect((await ambil(url, "/api/v1/terkunci", bearer(lain))).status).toBe(200);
    });

    it("sesi dicabut + route publik: tetap terjangkau tanpa AuthContext (authenticate lenient)", async () => {
        akun.set(7, {});
        const url = await mulai();
        sesiMati.add("sesi-1");
        expect((await ambil(url, "/api/v1/publik", bearer(token()))).json).toEqual({ ada: false });
    });
});

describe("authenticated() — route \"Bearer\" tanpa permission (SDD-AUTH-12)", () => {
    it("tanpa token → 401 UNAUTHENTICATED; token kedaluwarsa → 401 TOKEN_EXPIRED; sesi dicabut → 401", async () => {
        akun.set(7, { scopes: new Map() });
        const url = await mulai();
        expect((await ambil(url, "/api/v1/saya")).json.error?.code).toBe("UNAUTHENTICATED");
        const lama = token("7", false, new Date(T0.getTime() - (ACCESS_TOKEN_TTL_DETIK + 1) * 1000));
        expect((await ambil(url, "/api/v1/saya", bearer(lama))).json.error?.code).toBe("TOKEN_EXPIRED");
        sesiMati.add("sesi-1");
        expect((await ambil(url, "/api/v1/saya", bearer(token()))).status).toBe(401);
    });

    it("pengguna tanpa satu pun permission tetap lolos (tak ada permission untuk dilanggar) dan controller melihat id sesinya", async () => {
        akun.set(7, { scopes: new Map() });
        const url = await mulai();
        const r = await ambil(url, "/api/v1/saya", bearer(token()));
        expect(r.status).toBe(200);
        expect(r.json).toEqual({ sid: "sesi-1", userId: 7 });
    });

    it("akun nonaktif tetap 401 — autentikasi mencakup status akun", async () => {
        akun.set(7, { status: "NONAKTIF" });
        const url = await mulai();
        expect((await ambil(url, "/api/v1/saya", bearer(token()))).status).toBe(401);
    });
});
