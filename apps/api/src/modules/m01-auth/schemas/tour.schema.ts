// Skema Zod progres tur produk milik sendiri (SDD-API-01; keputusan pemilik produk 26 Oktober 2026).

import { z } from "zod";

/** Sama dengan CHECK `product_tour_progress.kunci_tur` (0075): huruf kecil, angka, titik, strip. */
export const KunciTurSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/, "Kunci tur tidak sah.");

export const TourParamsSchema = z.object({ kunci: KunciTurSchema });

export const UpdateTourBodySchema = z.object({
    status: z.enum(["SELESAI", "DILEWATI"]),
    versi: z.number().int().min(1).max(1000),
});

const TurSchema = z.object({
    kunci: z.string(),
    status: z.enum(["SELESAI", "DILEWATI"]),
    versi: z.number().int(),
    diperbarui_pada: z.string(),
});

export const ListToursResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ tur: z.array(TurSchema) }),
    meta: z.null(),
});

export const UpdateTourResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ tur: TurSchema }),
    meta: z.null(),
});
