// Route M-17 (SDD-AUTH-01, PM-01; keputusan 79a: `notification.manage_own`) + perakit router.

import express from "express";
import { z } from "zod";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { createRedis, getRedis, readRedisConfig } from "../../shared/cache/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import type { Logger } from "../../shared/observability/index.js";
import {
    deleteDeviceTokenHandler,
    getPreferencesHandler,
    listNotificationsHandler,
    markAllReadHandler,
    markReadHandler,
    registerDeviceTokenHandler,
    streamHandler,
    updatePreferencesHandler,
} from "./controllers/notification.controller.js";
import {
    DeviceTokenParamSchema,
    RegisterDeviceTokenBodySchema,
    RegisterDeviceTokenResponseSchema,
    ListNotificationsQuerySchema,
    ListNotificationsResponseSchema,
    MarkAllReadResponseSchema,
    MarkReadResponseSchema,
    NotificationIdParamSchema,
    PreferencesResponseSchema,
    StreamEventSchema,
    UpdatePreferencesBodySchema,
} from "./schemas/notification.schema.js";
import { HubSse, PenyiarNotifikasi } from "./services/fanout.js";
import { DeviceTokenService } from "./services/device-token.service.js";
import { InboxService } from "./services/inbox.service.js";
import { PreferenceService } from "./services/preference.service.js";

const MODUL = "m17-notifications";
const PERMISSION = "notification.manage_own";

/** FR-17.1 langkah 3, A2, A3. */
export const listNotificationsRoute = defineRoute({
    method: "GET",
    path: "/notifications",
    permission: PERMISSION,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar notifikasi saya (filter jenis, status baca, arsip)",
    params: ListNotificationsQuerySchema,
    response: ListNotificationsResponseSchema,
});

/** NTF-01…NTF-05 (SDD-08 §4.3). Didaftarkan SEBELUM `/:id/...`. */
export const streamNotificationsRoute = defineRoute({
    method: "GET",
    path: "/notifications/stream",
    permission: PERMISSION,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Aliran notifikasi real-time (SSE)",
    contentType: "text/event-stream",
    response: StreamEventSchema,
});

/** FR-17.3 langkah 2 (keputusan 81d). Didaftarkan SEBELUM `/:id/...`. */
export const getPreferencesRoute = defineRoute({
    method: "GET",
    path: "/notifications/preferences",
    permission: PERMISSION,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Preferensi notifikasi saya (enam kelompok × dua kanal)",
    response: PreferencesResponseSchema,
});

/** FR-17.3 langkah 3, A1 (keputusan 81). */
export const updatePreferencesRoute = defineRoute({
    method: "PUT",
    path: "/notifications/preferences",
    permission: PERMISSION,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Atur preferensi notifikasi saya",
    body: UpdatePreferencesBodySchema,
    response: PreferencesResponseSchema,
});

/** FR-17.1 langkah 5. `read-all` SEBELUM `/:id/read` agar tidak tertangkap sebagai id. */
export const markAllReadRoute = defineRoute({
    method: "PATCH",
    path: "/notifications/read-all",
    permission: PERMISSION,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Tandai seluruh notifikasi saya terbaca",
    response: MarkAllReadResponseSchema,
});

/** FR-17.1 langkah 4. */
export const markReadRoute = defineRoute({
    method: "PATCH",
    path: "/notifications/:id/read",
    permission: PERMISSION,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Tandai satu notifikasi terbaca",
    params: NotificationIdParamSchema,
    response: MarkReadResponseSchema,
});

/** FR-17.2 langkah 1 (keputusan 80d: `notification.manage_own`). */
export const registerDeviceTokenRoute = defineRoute({
    method: "POST",
    path: "/device-tokens",
    permission: PERMISSION,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftarkan token perangkat (FID) untuk push",
    body: RegisterDeviceTokenBodySchema,
    response: RegisterDeviceTokenResponseSchema,
});

/** FR-17.2 A1 / MOB-SEC-05. */
export const deleteDeviceTokenRoute = defineRoute({
    method: "DELETE",
    path: "/device-tokens/:token",
    permission: PERMISSION,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Cabut token perangkat milik sendiri",
    successStatus: 204,
    params: DeviceTokenParamSchema,
    response: z.null(),
});

export interface NotificationsModuleDeps {
    readonly db: Kysely<Database>;
    readonly clock: Clock;
    readonly logger: Logger;
    /** Proses API memberi hub miliknya (ditutup saat berhenti); tanpa itu dibuat saat aliran pertama. */
    readonly hub?: HubSse | undefined;
}

/** Hub bawaan: satu koneksi Redis pelanggan per proses, dibuat malas. */
export function buatHubSse(clock: Clock, logger: Logger): HubSse {
    return new HubSse({ pelanggan: createRedis(readRedisConfig()), redis: getRedis(), logger, sekarangMs: () => clock.now().getTime() });
}

export function notificationsRouter(
    deps: NotificationsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    let hub = deps.hub;
    let penyiar: PenyiarNotifikasi | undefined;
    const ambilPenyiar = (): PenyiarNotifikasi => (penyiar ??= new PenyiarNotifikasi(getRedis(), deps.logger));
    const ambilHub = (): HubSse => (hub ??= buatHubSse(deps.clock, deps.logger));
    const service = new InboxService(deps.db, deps.clock, ambilPenyiar);
    const router = express.Router();
    router.get(listNotificationsRoute.path, batasi(listNotificationsRoute), otorisasi(PERMISSION), listNotificationsHandler(service));
    router.get(streamNotificationsRoute.path, batasi(streamNotificationsRoute), otorisasi(PERMISSION), streamHandler(service, ambilHub));
    const preferensi = new PreferenceService(deps.db);
    router.get(getPreferencesRoute.path, batasi(getPreferencesRoute), otorisasi(PERMISSION), getPreferencesHandler(preferensi));
    router.put(updatePreferencesRoute.path, batasi(updatePreferencesRoute), otorisasi(PERMISSION), updatePreferencesHandler(preferensi));
    router.patch(markAllReadRoute.path, batasi(markAllReadRoute), otorisasi(PERMISSION), markAllReadHandler(service));
    router.patch(markReadRoute.path, batasi(markReadRoute), otorisasi(PERMISSION), markReadHandler(service));
    const token = new DeviceTokenService(deps.db, deps.clock);
    router.post(registerDeviceTokenRoute.path, batasi(registerDeviceTokenRoute), otorisasi(PERMISSION), registerDeviceTokenHandler(token));
    router.delete(deleteDeviceTokenRoute.path, batasi(deleteDeviceTokenRoute), otorisasi(PERMISSION), deleteDeviceTokenHandler(token));
    return router;
}
