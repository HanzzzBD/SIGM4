// Controller pengajuan reservasi ruangan (FR-07.2): validasi body (SDD-API-01) lalu
// SubmissionService. `POST /reservations` berjalan di dalam `runIdempotent` — kunci, pengajuan,
// slot, instance approval, dan respons tersimpan commit bersama (ID-01 … ID-05, UX P-29).
// Isian tak sah dijawab `422 VALIDATION_ERROR` per isian (Bab 17.2), bukan 400.

import { RoomReservationBodySchema } from "@sigm4/schemas";
import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import { runIdempotent } from "../../../shared/http/index.js";
import type { IsianPengajuan, SubmissionService } from "../services/submission.service.js";

function urai(body: unknown): IsianPengajuan {
    const hasil = RoomReservationBodySchema.safeParse(body);
    if (!hasil.success) {
        throw new DomainError("VALIDATION_ERROR", "Isian pengajuan reservasi tidak sah.", {
            errors: hasil.error.issues.map((i) => ({ field: i.path.map(String).join(".") || "(body)", message: i.message })),
        });
    }
    return hasil.data;
}

export function previewReservationHandler(service: SubmissionService): RequestHandler {
    return async (req, res) => {
        const data = await service.pratinjau(requireAuthContext(res), urai(req.body));
        res.status(200).json({ success: true, data, meta: null });
    };
}

export function createReservationHandler(db: Kysely<Database>, service: SubmissionService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const isian = urai(req.body);
        const hasil = await runIdempotent(db, ctx, { key: req.header("Idempotency-Key") ?? "", endpoint: "POST /reservations", body: req.body }, async (scope) => ({
            statusCode: 201,
            body: { success: true as const, data: await service.ajukan(scope, isian), meta: null },
        }));
        res.status(hasil.statusCode).json(hasil.body);
    };
}
