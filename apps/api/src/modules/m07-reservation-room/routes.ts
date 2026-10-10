// Route M-07 (SDD-AUTH-01, PM-01) + perakit router modul. Katalog: m07-reservation-room.md §7.

import {
    CancelReservationBodySchema,
    RecordUsageBodySchema,
    ReservationDetailResponseSchema,
    ReservationCancelledResponseSchema,
    ReservationIdParamSchema,
    ReservationListQuerySchema,
    ReservationListResponseSchema,
    ReservationUsageResponseSchema,
    RoomAvailabilityQuerySchema,
    RoomAvailabilityResponseSchema,
    RoomReservationBodySchema,
    RoomReservationCreatedResponseSchema,
    RoomReservationPreviewResponseSchema,
} from "@sigm4/schemas";
import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { ApprovalService, RuleConfigService } from "../m10-approval/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import { SlotService } from "../../shared/booking/index.js";
import { BusinessCalendarService } from "../../shared/calendar/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { DocumentNumberService } from "../../shared/numbering/index.js";
import { roomAvailabilityHandler } from "./controllers/availability.controller.js";
import { cancelReservationHandler, createReservationHandler, getReservationHandler, listReservationsHandler, previewReservationHandler, recordUsageHandler } from "./controllers/reservation.controller.js";
import { daftarkanReservasiRuangan } from "./registration.js";
import { AvailabilityService } from "./services/availability.service.js";
import { CancellationService } from "./services/cancellation.service.js";
import { ReservationQueryService } from "./services/reservation-query.service.js";
import { ReservationService } from "./services/reservation.service.js";
import { SubmissionService } from "./services/submission.service.js";
import { UsageService } from "./services/usage.service.js";

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

/** FR-07.2 / P-29 langkah 3 (keputusan 14f): pemeriksaan yang sama dengan pengajuan, tanpa efek. */
export const previewReservationRoute = defineRoute({
    method: "POST",
    path: "/reservations/preview",
    permission: "reservation.create",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Pratinjau pengajuan reservasi ruangan: tanggal, bentrok, kuota, jalur persetujuan (FR-07.2)",
    successStatus: 200,
    body: RoomReservationBodySchema,
    response: RoomReservationPreviewResponseSchema,
});

/** FR-07.2, sekuens 15.2; ID-01 (UX P-29 "Idempotensi"). */
export const createReservationRoute = defineRoute({
    method: "POST",
    path: "/reservations",
    permission: "reservation.create",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Ajukan reservasi ruangan (FR-07.2)",
    successStatus: 201,
    idempotent: true,
    body: RoomReservationBodySchema,
    response: RoomReservationCreatedResponseSchema,
});

/**
 * FR-07.3 (keputusan 15b): gerbang route = `cancel_own` (PM-01, tepat satu permission); membatalkan
 * reservasi pihak lain menuntut tambahan `cancel_any`, diperiksa layanan atas pemohon di basis data.
 * Bukan ID-01 — pembatalan berulang ditolak penjaga status, bukan diduplikasi.
 */
export const cancelReservationRoute = defineRoute({
    method: "POST",
    path: "/reservations/:id/cancel",
    permission: "reservation.cancel_own",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Batalkan reservasi beserta alasannya; slot dilepas seketika (FR-07.3)",
    successStatus: 200,
    params: ReservationIdParamSchema,
    body: CancelReservationBodySchema,
    response: ReservationCancelledResponseSchema,
});

/** FR-07.4 langkah 3 + A1 (keputusan 16): kondisi pasca-kegiatan atau Tidak Digunakan, sekali per tanggal. */
export const recordUsageRoute = defineRoute({
    method: "POST",
    path: "/reservations/:id/usage",
    permission: "reservation.record_usage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Catat penggunaan ruangan pasca-kegiatan: Baik, Perlu Perhatian, atau Tidak Digunakan (FR-07.4)",
    successStatus: 200,
    params: ReservationIdParamSchema,
    body: RecordUsageBodySchema,
    response: ReservationUsageResponseSchema,
});

/** P-30 (m07 §7, keputusan 17b): satu baris per pengajuan; `restricted` hanya miliknya sendiri. */
export const listReservationsRoute = defineRoute({
    method: "GET",
    path: "/reservations",
    permission: "reservation.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar pengajuan reservasi, tersaring scope (FR-07.3 langkah 1, UX P-30)",
    params: ReservationListQuerySchema,
    response: ReservationListResponseSchema,
});

/** P-31 (m07 §7): detail + aksi yang tersedia + riwayat (keputusan 17); di luar scope → 404. */
export const getReservationRoute = defineRoute({
    method: "GET",
    path: "/reservations/:id",
    permission: "reservation.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Detail reservasi: objek, jadwal, tanggal turunan, penggunaan, riwayat (UX P-31)",
    params: ReservationIdParamSchema,
    response: ReservationDetailResponseSchema,
});

export interface ReservationsModuleDeps {
    readonly db: Kysely<Database>;
    readonly clock: Clock;
    readonly auditLogger: AuditLogger;
}

/** Router M-07. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function reservationsRouter(
    deps: ReservationsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    // SDD-APR-17 / keputusan 75: penangan hasil + penyedia rincian proses ini (sekali per proses).
    daftarkanReservasiRuangan(deps.clock, deps.auditLogger);
    // Jam operasional dari system_settings (BR-018, keputusan 14b) — satu sumber dengan SLA approval.
    const kalender = new BusinessCalendarService();
    const approval = new ApprovalService(deps.db, deps.auditLogger, deps.clock, kalender);
    const pengajuan = new SubmissionService(
        deps.db,
        deps.clock,
        kalender,
        new ReservationService(new SlotService(deps.clock), new DocumentNumberService(deps.clock), deps.auditLogger),
        approval,
        new RuleConfigService(deps.db, deps.auditLogger, approval),
    );
    const router = express.Router();
    router.get(roomAvailabilityRoute.path, batasi(roomAvailabilityRoute), otorisasi(roomAvailabilityRoute.permission), roomAvailabilityHandler(new AvailabilityService(deps.db, kalender)));
    // `/preview` SEBELUM pola `/:id` kelak (PR-03-27) agar tak tertangkap sebagai id.
    router.post(previewReservationRoute.path, batasi(previewReservationRoute), otorisasi(previewReservationRoute.permission), previewReservationHandler(pengajuan));
    router.post(createReservationRoute.path, batasi(createReservationRoute), otorisasi(createReservationRoute.permission), createReservationHandler(deps.db, pengajuan));
    const baca = new ReservationQueryService(deps.db, deps.clock, deps.auditLogger, approval);
    router.get(listReservationsRoute.path, batasi(listReservationsRoute), otorisasi(listReservationsRoute.permission), listReservationsHandler(baca));
    router.get(getReservationRoute.path, batasi(getReservationRoute), otorisasi(getReservationRoute.permission), getReservationHandler(baca));
    router.post(cancelReservationRoute.path, batasi(cancelReservationRoute), otorisasi(cancelReservationRoute.permission), cancelReservationHandler(new CancellationService(deps.db, deps.clock, deps.auditLogger, approval)));
    router.post(recordUsageRoute.path, batasi(recordUsageRoute), otorisasi(recordUsageRoute.permission), recordUsageHandler(new UsageService(deps.db, deps.clock, deps.auditLogger)));
    return router;
}
