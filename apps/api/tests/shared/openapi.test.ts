// Generator OpenAPI (SDD-API-02, SDD-API-13).
//
// Yang diuji bukan bentuk dokumennya melainkan sifat yang `NFR-M-05` tuntut:
// dokumen ini diturunkan dari registri yang sama dengan yang melayani permintaan,
// sehingga ia tidak dapat menggambarkan endpoint yang tidak ada — maupun
// menyembunyikan yang ada.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildOpenApiDocument } from "../../src/api/openapi.js";
import { RouteRegistry, defineRoute } from "../../src/shared/http/index.js";
import type { RouteDefinition } from "../../src/shared/http/index.js";

const AssetSchema = z.object({ id: z.number(), nama: z.string() });

const showAsset = defineRoute({
    method: "GET",
    path: "/assets/:id",
    permission: "asset.view",
    rateLimitClass: "default",
    module: "m04-assets",
    summary: "Detail aset",
    params: z.object({ id: z.coerce.number().int().positive() }),
    response: AssetSchema,
});

const createReservation = defineRoute({
    method: "POST",
    path: "/reservations",
    permission: "reservation.create",
    rateLimitClass: "default",
    module: "m07-reservation-room",
    idempotent: true,
    body: z.object({ room_id: z.number() }),
    response: z.object({ nomor: z.string() }),
});

const login = defineRoute({
    method: "POST",
    path: "/auth/login",
    public: true,
    rateLimitClass: "login",
    module: "m01-auth",
    body: z.object({ email: z.string(), password: z.string() }),
    response: z.object({ ok: z.boolean() }),
});

function dokumen(...routes: readonly RouteDefinition[]) {
    // `as unknown as` disengaja: tipe OpenAPIObject milik zod-openapi memakai
    // antarmuka bernama, sedangkan uji ini memeriksa isinya sebagai data biasa.
    return buildOpenApiDocument(new RouteRegistry().register(...routes), {
        version: "0.0.0",
    }) as unknown as {
        paths: Record<string, Record<string, Record<string, unknown>>>;
        openapi: string;
    };
}

describe("buildOpenApiDocument", () => {
    it("memberi awalan /api/v1 dan mengubah :id menjadi {id}", () => {
        expect(Object.keys(dokumen(showAsset).paths)).toEqual([
            "/api/v1/assets/{id}",
        ]);
    });

    it("menurunkan skema respons dari Zod, bukan dari deklarasi kedua (SDD-API-01)", () => {
        const op = dokumen(showAsset).paths["/api/v1/assets/{id}"]!["get"]!;
        const skema = (
            op["responses"] as Record<string, Record<string, unknown>>
        )["200"];
        expect(JSON.stringify(skema)).toContain("nama");
    });

    it("POST memakai 201, selainnya 200 (Bab 17.3)", () => {
        const post =
            dokumen(createReservation).paths["/api/v1/reservations"]!["post"]!;
        expect(Object.keys(post["responses"] as object)).toContain("201");
        const get = dokumen(showAsset).paths["/api/v1/assets/{id}"]!["get"]!;
        expect(Object.keys(get["responses"] as object)).toContain("200");
    });

    it("membawa permission sebagai ekstensi — sumber matriks SEC-T-01 tetap terbaca", () => {
        const op = dokumen(showAsset).paths["/api/v1/assets/{id}"]!["get"]!;
        expect(op["x-permission"]).toBe("asset.view");
        expect(op["x-rate-limit-class"]).toBe("default");
    });

    it("route ber-permission mengiklankan 401 dan 403", () => {
        const op = dokumen(showAsset).paths["/api/v1/assets/{id}"]!["get"]!;
        const kode = Object.keys(op["responses"] as object);
        expect(kode).toEqual(expect.arrayContaining(["401", "403"]));
    });

    it("route PUBLIK tidak mengiklankan 401/403 — ia memang tidak menuntut sesi", () => {
        const op = dokumen(login).paths["/api/v1/auth/login"]!["post"]!;
        const kode = Object.keys(op["responses"] as object);
        expect(kode).not.toContain("401");
        expect(kode).not.toContain("403");
        expect(op["x-permission"]).toBeNull();
    });

    it("route `authenticated` mengiklankan 401 tetapi tanpa x-permission, dan menandai x-authenticated (SDD-AUTH-12)", () => {
        const me = defineRoute({
            method: "GET",
            path: "/me",
            authenticated: true,
            rateLimitClass: "default",
            module: "m01-auth",
            response: AssetSchema,
        });
        const op = dokumen(me).paths["/api/v1/me"]!["get"]!;
        expect(op["x-permission"]).toBeNull();
        expect(op["x-authenticated"]).toBe(true);
        expect(Object.keys(op["responses"] as object)).toContain("401");
        expect(dokumen(showAsset).paths["/api/v1/assets/{id}"]!["get"]!["x-authenticated"]).toBe(false);
    });

    it("successStatus menggantikan status bawaan; 204 tidak punya badan (RFC 9110 §15.3.5)", () => {
        const keluar = defineRoute({
            method: "POST",
            path: "/auth/logout",
            authenticated: true,
            rateLimitClass: "default",
            module: "m01-auth",
            successStatus: 204,
            response: z.null(),
        });
        const respons = dokumen(keluar).paths["/api/v1/auth/logout"]!["post"]!["responses"] as Record<string, Record<string, unknown>>;
        expect(Object.keys(respons)).toContain("204");
        expect(Object.keys(respons)).not.toContain("201");
        expect(respons["204"]).not.toHaveProperty("content");
    });

    it("route idempoten mengiklankan 409 (ID-01)", () => {
        const op =
            dokumen(createReservation).paths["/api/v1/reservations"]!["post"]!;
        expect(Object.keys(op["responses"] as object)).toContain("409");
    });

    it("route non-idempoten tidak mengiklankan 409", () => {
        const op = dokumen(showAsset).paths["/api/v1/assets/{id}"]!["get"]!;
        expect(Object.keys(op["responses"] as object)).not.toContain("409");
    });

    it("memberi tag per modul sehingga dokumen terbaca per domain", () => {
        const op = dokumen(showAsset).paths["/api/v1/assets/{id}"]!["get"]!;
        expect(op["tags"]).toEqual(["m04-assets"]);
    });

    it("dua method pada satu path menjadi satu entri path", () => {
        const doc = dokumen(
            showAsset,
            defineRoute({
                ...showAsset,
                method: "DELETE",
                permission: "asset.deactivate",
            }),
        );
        expect(Object.keys(doc.paths)).toHaveLength(1);
        expect(Object.keys(doc.paths["/api/v1/assets/{id}"]!).sort()).toEqual([
            "delete",
            "get",
        ]);
    });

    it("MENOLAK membangun dokumen dari registri yang tidak lolos bootstrap", () => {
        // Dokumen yang menggambarkan route tanpa permission akan mengiklankan
        // endpoint yang seharusnya tidak pernah berjalan.
        const cacat = {
            method: "GET",
            path: "/assets",
            rateLimitClass: "default",
            module: "m04-assets",
            response: AssetSchema,
        } as unknown as RouteDefinition;
        expect(() => dokumen(cacat)).toThrow(/tanpa deklarasi permission/);
    });

    it("menghasilkan OpenAPI 3.1", () => {
        expect(dokumen(showAsset).openapi).toBe("3.1.0");
    });

    it("route.contentType menggantikan application/json bawaan (PR-01-09, ekspor biner)", () => {
        const exportXlsx = defineRoute({
            method: "GET",
            path: "/activity-logs/export",
            permission: "activity_log.export",
            rateLimitClass: "export",
            module: "m18-activity-log",
            response: z.string(),
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const op = dokumen(exportXlsx).paths["/api/v1/activity-logs/export"]!["get"]!;
        const skema = op["responses"] as Record<string, Record<string, unknown>>;
        const konten = skema["200"]!["content"] as Record<string, unknown>;
        expect(Object.keys(konten)).toEqual([
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ]);
    });

    it("setiap respons galat menerbitkan skema amplop Bab 17.2 (code, message, details opsional, request_id) — bukan sekadar deskripsi", () => {
        const op = dokumen(showAsset).paths["/api/v1/assets/{id}"]!["get"]!;
        const respons = op["responses"] as Record<string, Record<string, unknown>>;
        for (const status of ["400", "401", "403", "429", "500"]) {
            const konten = respons[status]!["content"] as Record<string, { schema: { properties: Record<string, unknown>; required: string[]; additionalProperties?: unknown } }>;
            const skema = konten["application/json"]!.schema;
            expect(Object.keys(skema.properties).sort(), status).toEqual(["error", "request_id", "success"]);
            expect(skema.additionalProperties, status).toBe(false);
            const galat = skema.properties["error"] as { properties: Record<string, unknown>; required: string[]; additionalProperties?: unknown };
            expect(Object.keys(galat.properties).sort(), status).toEqual(["code", "details", "message"]);
            expect(galat.required.sort(), status).toEqual(["code", "message"]);
            expect(galat.additionalProperties, status).toBe(false);
        }
    });
});
