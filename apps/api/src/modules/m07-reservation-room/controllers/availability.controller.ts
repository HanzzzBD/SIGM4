// Controller kalender ruangan (FR-07.1): validasi query (SDD-API-01), lalu AvailabilityService.
// Permission `reservation.view` diperiksa sebelum handler ini (PM-02). Query tak sah dijawab
// `422 VALIDATION_ERROR` per isian (Bab 17.2) — rentang > 42 hari adalah aturan, bukan URL rusak.

import { RoomAvailabilityQuerySchema } from "@sigm4/schemas";
import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { AvailabilityService } from "../services/availability.service.js";

export function roomAvailabilityHandler(service: AvailabilityService): RequestHandler {
    return async (req, res) => {
        const hasil = RoomAvailabilityQuerySchema.safeParse(req.query);
        if (!hasil.success) {
            throw new DomainError("VALIDATION_ERROR", "Rentang atau filter kalender tidak sah.", {
                errors: hasil.error.issues.map((i) => ({ field: i.path.map(String).join(".") || "(query)", message: i.message })),
            });
        }
        const q = hasil.data;
        const data = await service.ketersediaan(requireAuthContext(res), {
            dari: new Date(q.dari),
            sampai: new Date(q.sampai),
            gedungId: q.gedung_id,
            jenis: q.jenis,
            kapasitasMin: q.kapasitas_min,
        });
        res.status(200).json({ success: true, data, meta: null });
    };
}
