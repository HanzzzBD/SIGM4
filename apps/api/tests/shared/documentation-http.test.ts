import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createApp, registry } from "../../src/api/index.js";
import { buildOpenApiDocument } from "../../src/api/openapi.js";
import { parseDocumentationEnv } from "../../src/shared/config/index.js";
import type { DocumentationConfig } from "../../src/shared/config/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import type { Database } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";

const servers: Server[] = [];
async function app(config?: DocumentationConfig, allowed = true) {
    const clock = new FixedClock(new Date("2026-10-12T00:00:00Z"));
    const server = createServer(createApp({ ...(config === undefined ? {} : { documentation: config }), db: {} as Kysely<Database>, appBaseUrl: "https://sekolah.test", clock,
        health: new HealthRegistry(), logger: new Logger({ clock, tulis: () => undefined }), security: { objectStorageOrigin: "https://storage.test" },
        limiter: { hit: async () => ({ lolos: allowed, batas: 100, sisa: allowed ? 99 : 0, resetDetik: 60 }) }, auth: authPalsu() }));
    servers.push(server); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });
describe("PR-00-19: OpenAPI commit runtime", () => {
    it.each(["development", "staging"] as const)("%s menyajikan JSON identik dengan generator dan seluruh registri, tanpa sesi", async (environment) => {
        const version = "4dbea0700e5416bc79831be103cba321ec3ed517";
        const base = await app({ environment, version });
        const response = await fetch(base + "/api/docs");
        expect(response.status).toBe(200); expect(response.headers.get("content-type")).toContain("application/json");
        expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.get("x-robots-tag")).toContain("noindex");
        expect(response.headers.get("x-request-id")).toBeTruthy(); expect(response.headers.get("content-security-policy")).toBeTruthy();
        const document = await response.json() as ReturnType<typeof buildOpenApiDocument>;
        expect(document).toEqual(buildOpenApiDocument(registry, { version }));
        expect(document.info.version).toBe(version);
        const operations = Object.values(document.paths ?? {}).flatMap((path) => Object.keys(path ?? {}).filter((key) => ["get", "post", "put", "patch", "delete"].includes(key)));
        expect(operations).toHaveLength(registry.all().length);
        for (const route of registry.all()) {
            const path = "/api/v1" + route.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
            const operation = document.paths?.[path]?.[route.method.toLowerCase() as "get"];
            expect(operation).toMatchObject({ "x-permission": route.permission ?? null, "x-rate-limit-class": route.rateLimitClass });
        }
    });
    it.each([undefined, { environment: "production", version: "deployed-commit" }] as const)("konfigurasi absent/produksi menolak seluruh path dokumentasi: %j", async (config) => {
        const base = await app(config);
        for (const path of ["/api/docs", "/api/docs/", "/api/docs/openapi.json", "/openapi.json"]) {
            const response = await fetch(base + path); expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
        }
    });
    it("rate limit juga berlaku pada unduhan kontrak", async () => {
        const response = await fetch((await app({ environment: "staging", version: "revision" }, false)) + "/api/docs");
        expect(response.status).toBe(429); expect(await response.json()).toMatchObject({ error: { code: "RATE_LIMIT_EXCEEDED" } });
    });
    it("konfigurasi lingkungan selalu tertutup secara bawaan dan menolak typo", () => {
        expect(parseDocumentationEnv({ NODE_ENV: "development" }).environment).toBe("production");
        expect(parseDocumentationEnv({ APP_ENV: "staging", APP_REVISION: "abc123" })).toEqual({ environment: "staging", version: "abc123" });
        expect(() => parseDocumentationEnv({ APP_ENV: "prod" })).toThrow("APP_ENV");
        expect(() => parseDocumentationEnv({ APP_REVISION: "" })).toThrow();
    });
});
