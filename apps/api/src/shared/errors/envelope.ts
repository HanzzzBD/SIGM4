// Skema amplop galat Bab 17.2 — satu definisi untuk dokumen OpenAPI (SDD-API-02) dan
// untuk uji kontrak, agar keduanya tidak dapat menyimpang dari yang dikirim
// `kirimGalat`. Bentuknya sengaja `strict`: field di luar Bab 17.2 adalah format baru.

import { z } from "zod";
import type { KodeGalat } from "./codes.js";
import { KODE_GALAT } from "./codes.js";

const KODE = Object.keys(KODE_GALAT) as [KodeGalat, ...KodeGalat[]];

/** Satu butir `error.details`: isian yang bermasalah beserta alasannya (SDD-API-14). */
export const ErrorDetailSchema = z
    .object({
        field: z.string().min(1).meta({ description: "Nama isian pada body atau parameter." }),
        message: z.string().min(1).meta({ description: "Alasan dalam Bahasa Indonesia." }),
    })
    .strict();

export const ErrorEnvelopeSchema = z
    .object({
        success: z.literal(false),
        error: z
            .object({
                code: z.enum(KODE).meta({ description: "Kode galat Bab 17.3." }),
                message: z.string().min(1).meta({
                    description: "Kalimat untuk pengguna: spesifik pada galat aturan bisnis 4xx, generik pada galat lain.",
                }),
                details: z.array(ErrorDetailSchema).min(1).optional().meta({
                    description: "Hanya pada galat aturan bisnis 4xx yang menunjuk isian tertentu; tidak pernah pada 400 skema, 401/403, maupun 5xx.",
                }),
            })
            .strict(),
        request_id: z.string().min(1).meta({ description: "Sama dengan header X-Request-Id." }),
    })
    .strict();
