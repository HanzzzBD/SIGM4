// PR-07-52 — permintaan bahan oleh Siswa/OSIS (BR-086a, BR-091a) terhadap PostgreSQL NYATA:
// katalog siswa hanya bahan bertanda dengan status stok tanpa angka, permintaan siswa tidak
// pernah membentuk instance approval, dan penanda dikelola lewat master bahan.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { AMR_OTP, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { MaterialLedgerService } from "../../src/modules/m22-materials/index.js";
import { fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

interface Actor { id: number; role: string; permissions: string[] }
type Json = { data?: Record<string, unknown> & { items?: Record<string, unknown>[] }; error?: unknown };

const marker = randomUUID().slice(0, 7), clock = new FixedClock(new Date("2026-10-26T03:00:00Z")), audit = new AuditLogger({ clock });

describe.skipIf(!process.env["DATABASE_URL"])("PR-07-52 — permintaan bahan Siswa/OSIS", () => {
    let server: Server, base = "", room = "", otherRoom = "", unit = "", category = "", serial = 0;
    let student: Actor, manager: Actor;
    /** Aktor permintaan berikutnya, diatur uji itu sendiri — bukan dari header permintaan. */
    let current: Actor | undefined;
    const users: string[] = [];
    const id = async (q: string) => (await kueri<{ id: string }>(q))[0]!.id;
    const actor = async (role: string, permissions: string[]): Promise<Actor> => {
        const u = await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password,consent_guardian_at) VALUES ('${role}-${marker}','${randomUUID()}@bahan-siswa.test','x','${randomUUID()}',(SELECT id FROM roles WHERE kode='${role}'),'AKTIF',false,now()) RETURNING id::text`);
        users.push(u);
        return { id: Number(u), role, permissions };
    };
    const ctx = (a: Actor) => createAuthContext({ userId: a.id, roleCode: a.role, scopes: new Map<string, Scope>(a.permissions.map((p) => { const [name, scope] = p.split(":"); return [name!, (scope ?? "all") as Scope]; })) });
    const send = async (who: Actor, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => {
        current = who;
        const r = await fetch(base + path, { method, headers: { "content-type": "application/json", "Idempotency-Key": randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: r.status, json: (await r.json()) as Json };
    };
    const material = async (qty: number, minimum: number, forStudents: boolean) => {
        const m = await id(`INSERT INTO materials(nama,material_category_id,satuan_id,room_id_default,stok_minimum,boleh_diminta_siswa) VALUES ('Spidol ${marker}-${++serial}',${category},${unit},${room},${minimum},${forStudents}) RETURNING id::text`);
        if (qty) await withTransaction(ctx(manager), (s) => new MaterialLedgerService(clock, audit).record(s, { materialId: Number(m), roomId: Number(room), delta: qty, jenis: "PENERIMAAN", referenceKind: "fixture", referenceId: ++serial }), getDb());
        return m;
    };
    const ask = (m: string, qty: number, r = room) => ({ keperluan: "Kegiatan OSIS", items: [{ material_id: Number(m), room_id: Number(r), jumlah: qty }] });

    beforeAll(async () => {
        dbmate("up");
        student = await actor("R-07", ["material.view:restricted", "material.request:restricted"]);
        manager = await actor("R-02", ["material.view", "material.manage", "material.issue", "material.receive", "material.request"]);
        const building = await id(`INSERT INTO buildings(nama,kode) VALUES ('Bahan Siswa','G${marker}') RETURNING id::text`);
        const area = await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Lantai 1','A${marker}') RETURNING id::text`);
        room = await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Gudang OSIS','R${marker}','GUDANG') RETURNING id::text`);
        otherRoom = await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Gudang lain','S${marker}','GUDANG') RETURNING id::text`);
        unit = await id(`INSERT INTO material_units(nama,simbol) VALUES ('Buah ${marker}','bh${marker}') RETURNING id::text`);
        category = await id(`INSERT INTO material_categories(nama,kode) VALUES ('ATK ${marker}','C${marker}') RETURNING id::text`);
        await kueri("UPDATE system_settings SET value='1' WHERE key='bahan.ambang_permintaan_default'");
        // Pengajuan baru menolak bila ambang blokir kosong; DB CI berangkat dari bawaan migration.
        await kueri("UPDATE system_settings SET value='1000000' WHERE key='denda.ambang_blokir'");
        const app = express();
        app.use((_req, res, next) => { if (current) { setAuthContext(res, ctx(current)); setAmr(res, ["pwd", AMR_OTP]); } next(); });
        app.use(createApp({ appBaseUrl: "https://bahan.test", db: getDb(), clock, logger: new Logger({ clock, tulis: () => undefined }), auth: authPalsu(), health: new HealthRegistry(30).register(fcmCheck(null)), security: { objectStorageOrigin: "https://storage.test" }, limiter: { hit: async () => ({ lolos: true, batas: 10000, sisa: 9999, resetDetik: 60 }) } }));
        server = createServer(app);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
    });
    afterAll(async () => { if (server) await new Promise<void>((r) => server.close(() => r())); });

    it("BR-091a: katalog siswa hanya bahan bertanda, dengan status stok tanpa angka saldo", async () => {
        const plenty = await material(20, 5, true), few = await material(3, 5, true), empty = await material(0, 5, true), hidden = await material(20, 5, false);
        const list = await send(student, `/materials?q=${marker}&per_page=100`);
        expect(list.status).toBe(200);
        const rows = list.json.data as unknown as Record<string, unknown>[];
        expect(rows.map((r) => r["id"]).sort()).toEqual([plenty, few, empty].sort());
        const byId = new Map(rows.map((r) => [r["id"], r]));
        expect([byId.get(plenty)?.["status_stok"], byId.get(few)?.["status_stok"], byId.get(empty)?.["status_stok"]]).toEqual(["TERSEDIA", "TERBATAS", "HABIS"]);
        for (const r of rows) { expect(r["saldo_total"]).toBeNull(); expect(r["stok_minimum"]).toBeNull(); expect(r["stok_menipis"]).toBe(false); }

        const detail = await send(student, `/materials/${plenty}`);
        expect(detail.status).toBe(200);
        expect(detail.json.data?.["saldo_lokasi"]).toEqual([]);
        expect((await send(student, `/materials/${hidden}`)).status).toBe(404);
        expect((await send(student, `/materials/${plenty}/transactions`)).status).toBe(403);

        const staff = await send(manager, `/materials/${plenty}`);
        expect([staff.json.data?.["saldo_total"], staff.json.data?.["stok_minimum"]]).toEqual([20, 5]);
        expect((await send(manager, `/materials/${hidden}`)).status).toBe(200);
    });

    it("BR-086a: permintaan siswa langsung Disetujui tanpa instance approval meski melampaui ambang; saldo detail disembunyikan", async () => {
        const m = await material(20, 2, true);
        const r = await send(student, "/material-requests", ask(m, 5));
        expect(r.status, JSON.stringify(r.json)).toBe(201);
        expect([r.json.data?.["status"], r.json.data?.["approval_instance_id"]]).toEqual(["DISETUJUI", null]);
        expect(r.json.data?.items?.[0]?.["saldo_terkini"]).toBeNull();
        expect((await send(manager, `/material-requests/${String(r.json.data?.["id"])}`)).json.data?.items?.[0]?.["saldo_terkini"]).toBe(20);

        // Pembanding: pemohon staf dengan jumlah yang sama melewati approval (BR-086 tidak berubah).
        const staff = await send(manager, "/material-requests", ask(m, 5));
        expect(staff.json.data?.["status"]).toBe("MENUNGGU_PERSETUJUAN");

        // Scope baris permintaan tetap milik sendiri: siswa tidak melihat permintaan staf.
        const mine = (await send(student, "/material-requests?tab=SEMUA&per_page=100")).json.data as unknown as { id: string }[];
        expect(mine.map((d) => d.id)).toContain(String(r.json.data?.["id"]));
        expect(mine.map((d) => d.id)).not.toContain(String(staff.json.data?.["id"]));
        expect((await send(student, `/material-requests/${String(staff.json.data?.["id"])}`)).status).toBe(404);
    });

    it("BR-091a: siswa ditolak untuk bahan tanpa penanda, lokasi selain bawaan, dan stok kurang — tanpa membocorkan angka", async () => {
        const hidden = await material(20, 2, false), open = await material(4, 2, true);
        expect((await send(student, "/material-requests", ask(hidden, 1))).status).toBe(422);
        expect((await send(student, "/material-requests", ask(open, 1, otherRoom))).status).toBe(422);
        const short = await send(student, "/material-requests", ask(open, 9));
        expect(short.status).toBe(422);
        const pesan = JSON.stringify((short.json.error as { message?: string; details?: unknown }));
        expect(pesan).toContain("stok tidak mencukupi");
        expect(pesan).not.toContain("saldo tersedia");
        // Nama bahan memuat penanda heksa acak (mis. `5bf4f8c`) — dibuang dulu agar hanya angka stok yang diperiksa.
        expect(pesan.replaceAll(/Spidol [0-9a-f]+-[0-9]+/g, "")).not.toMatch(/[^0-9]4[^0-9]/);
    });

    it("penanda dikelola lewat master bahan; PATCH tanpa penanda mempertahankannya", async () => {
        const m = await material(0, 1, false);
        expect((await send(manager, `/materials/${m}`, { boleh_diminta_siswa: true }, "PATCH")).json.data?.["boleh_diminta_siswa"]).toBe(true);
        expect((await send(manager, `/materials/${m}`, { keterangan: "Untuk OSIS" }, "PATCH")).json.data?.["boleh_diminta_siswa"]).toBe(true);
        expect((await send(student, `/materials/${m}`)).status).toBe(200);
        expect((await send(student, `/materials/${m}`, { boleh_diminta_siswa: false }, "PATCH")).status).toBe(403);
    });
});
