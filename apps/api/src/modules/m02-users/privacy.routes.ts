import express from "express";
import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { PseudonymizeUserBodySchema, PseudonymizedUserResponseSchema } from "@sigm4/schemas";
import type { Database } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { UserIdParamSchema } from "./schemas/user.schema.js";
import { PseudonymizationService } from "./services/pseudonymization.service.js";

export const pseudonymizeUserRoute = defineRoute({ method: "POST", path: "/users/:id/pseudonymize", permission: "user.update", module: "m02-users", rateLimitClass: "default",
    summary: "Pseudonimisasi permanen akun nonaktif oleh Administrator", params: UserIdParamSchema, body: PseudonymizeUserBodySchema, response: PseudonymizedUserResponseSchema });
export function privacyRouter(deps: { db: Kysely<Database>; clock: Clock; audit: AuditLogger }, limit: (route: RouteDefinition) => RequestHandler, authorize: (permission: string) => RequestHandler) {
    const router = express.Router(), service = new PseudonymizationService(deps.db, deps.clock, deps.audit);
    router.post(pseudonymizeUserRoute.path, limit(pseudonymizeUserRoute), authorize(pseudonymizeUserRoute.permission), async (req, res) => {
        const { id } = UserIdParamSchema.parse(req.params), body = PseudonymizeUserBodySchema.parse(req.body);
        const data = await service.request(requireAuthContext(res), id, body);
        res.setHeader("Cache-Control", "private, no-store"); res.json({ success: true, data, meta: null });
    });
    return router;
}
