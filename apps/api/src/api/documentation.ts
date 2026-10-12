// Artefak dokumentasi di luar /api/v1; kontrak domain tetap berasal dari satu registri.
import express from "express";
import type { DocumentationConfig } from "../shared/config/index.js";
import type { RateLimiter, RouteRegistry } from "../shared/http/index.js";
import { defineRoute } from "../shared/http/index.js";
import type { Logger } from "../shared/observability/index.js";
import { z } from "zod";
import { buildOpenApiDocument } from "./openapi.js";
import { rateLimit } from "./security.js";

export function documentationRouter(registry: RouteRegistry, config: DocumentationConfig | undefined, limiter: RateLimiter, logger: Logger): express.Router {
    const router = express.Router();
    // Konfigurasi yang tidak diberikan menutup publikasi, termasuk NODE_ENV=development.
    if (config?.environment !== "development" && config?.environment !== "staging") return router;
    const route = defineRoute({ method: "GET", path: "/api/docs", module: "api", public: true, rateLimitClass: "default", response: z.record(z.string(), z.unknown()) });
    const document = buildOpenApiDocument(registry, { version: config.version });
    router.get(route.path, rateLimit(route, limiter, logger), (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
        res.json(document);
    });
    return router;
}
