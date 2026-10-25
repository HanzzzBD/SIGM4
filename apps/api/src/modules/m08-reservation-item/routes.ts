import express from "express";
import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { AssetAvailabilityQuerySchema, AssetAvailabilityResponseSchema } from "@sigm4/schemas";
import { requireAuthContext } from "../../shared/auth/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { AvailabilityService } from "./services/availability.service.js";

export const assetAvailabilityRoute = defineRoute({ method: "GET", path: "/assets/availability", module: "m08-reservation-item", permission: "reservation.view", rateLimitClass: "default", summary: "Katalog ketersediaan unit aset (FR-08.1)", query: AssetAvailabilityQuerySchema, response: AssetAvailabilityResponseSchema });
export function assetAvailabilityRouter(deps: { db: Kysely<Database>; clock: Clock; storage: PenyimpananObjek }, limit: (route: RouteDefinition) => RequestHandler, authorize: (permission: string) => RequestHandler) {
    const router = express.Router();
    const service = new AvailabilityService(deps.db, deps.clock, deps.storage);
    router.get(assetAvailabilityRoute.path, limit(assetAvailabilityRoute), authorize(assetAvailabilityRoute.permission), async (req, res) => {
        const parsed = AssetAvailabilityQuerySchema.safeParse(req.query);
        if (!parsed.success) throw new DomainError("VALIDATION_ERROR", "Rentang atau saringan katalog tidak sah.", { errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
        res.setHeader("Cache-Control", "no-store");
        res.json(await service.get(requireAuthContext(res), parsed.data));
    });
    return router;
}
