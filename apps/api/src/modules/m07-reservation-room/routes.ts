// Route M-07 (SDD-AUTH-01, PM-01) + perakit router modul. Katalog: m07-reservation-room.md §7.

import { RoomAvailabilityQuerySchema, RoomAvailabilityResponseSchema } from "@sigm4/schemas";
import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { BusinessCalendarService } from "../../shared/calendar/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { roomAvailabilityHandler } from "./controllers/availability.controller.js";
import { AvailabilityService } from "./services/availability.service.js";

/** Pemilik katalog endpoint M-07 (m07-reservation-room.md §7). */
const MODUL = "m07-reservation-room";

/** FR-07.1 — kalender ketersediaan; rentang ≤ 42 hari (keputusan 12d), tanpa cache (AV-04). */
export const roomAvailabilityRoute = defineRoute({
    method: "GET",
    path: "/rooms/availability",
    permission: "reservation.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Ketersediaan ruangan pada rentang waktu (FR-07.1)",
    params: RoomAvailabilityQuerySchema,
    response: RoomAvailabilityResponseSchema,
});

export interface ReservationsModuleDeps {
    readonly db: Kysely<Database>;
}

/** Router M-07. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function reservationsRouter(
    deps: ReservationsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    // Jam operasional = DEFAULT_OPERATING_HOURS sampai PR-03-10 memindahkannya ke system_settings (keputusan 12b).
    const ketersediaan = new AvailabilityService(deps.db, new BusinessCalendarService());
    const router = express.Router();
    router.get(roomAvailabilityRoute.path, batasi(roomAvailabilityRoute), otorisasi(roomAvailabilityRoute.permission), roomAvailabilityHandler(ketersediaan));
    return router;
}
