// Skema Zod kalender akademik dan kalender kerja M-20 (SDD-API-01, SDD-API-11;
// Lampiran E.2). Tanggal berupa `YYYY-MM-DD` — string ISO yang urutan
// leksikografisnya sama dengan urutan kalendernya, sehingga perbandingan rentang
// di service tidak memerlukan `Date` (dan zona waktu).

import { z } from "zod";

const Tanggal = z.iso.date();
const PaginationQuery = {
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
};

const PaginationMetaSchema = z.object({
    page: z.number(),
    per_page: z.number(),
    total: z.number(),
    total_pages: z.number(),
});

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

const SemesterInputSchema = z.object({
    nama: z.enum(["GANJIL", "GENAP"]),
    tanggal_mulai: Tanggal,
    tanggal_selesai: Tanggal,
});

/**
 * `POST`/`PUT /academic-years`. Kedua semester WAJIB ada (Lampiran E.2: satu
 * Ganjil dan satu Genap per tahun ajaran) — `PUT` mengganti keduanya.
 * `is_active` tidak diterima: hanya `PATCH …/activate` yang mengubahnya (AC-YR-02).
 */
export const AcademicYearBodySchema = z
    .object({
        nama: z.string().trim().min(1).max(50),
        tanggal_mulai: Tanggal,
        tanggal_selesai: Tanggal,
        semester: z.array(SemesterInputSchema).length(2),
    })
    .refine((v) => new Set(v.semester.map((s) => s.nama)).size === 2, {
        message: "Semester harus tepat satu GANJIL dan satu GENAP.",
        path: ["semester"],
    });

export const ListAcademicYearsQuerySchema = z.object(PaginationQuery);

const SemesterSchema = z.object({
    id: z.string(),
    nama: z.enum(["GANJIL", "GENAP"]),
    tanggal_mulai: z.string(),
    tanggal_selesai: z.string(),
});

const AcademicYearSchema = z.object({
    id: z.string(),
    nama: z.string(),
    tanggal_mulai: z.string(),
    tanggal_selesai: z.string(),
    is_active: z.boolean(),
    semester: z.array(SemesterSchema),
});

export const ListAcademicYearsResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(AcademicYearSchema),
    meta: PaginationMetaSchema,
});

export const SingleAcademicYearResponseSchema = z.object({
    success: z.literal(true),
    data: AcademicYearSchema,
    meta: z.null(),
});

const JenisLiburSchema = z.enum(["NASIONAL", "SEKOLAH", "CUTI_BERSAMA"]);

export const HolidayBodySchema = z.object({
    tanggal: Tanggal,
    nama: z.string().trim().min(1).max(150),
    jenis: JenisLiburSchema,
    /** Opsional: hari libur nasional tidak intrinsik milik satu tahun ajaran (SDD-05 §4.7b). */
    academic_year_id: z.number().int().positive().nullable().optional(),
});

/** `filter[academic_year_id]` dibaca controller dari `req.query` (parser `simple` Express 5). */
export const ListHolidaysQuerySchema = z.object({
    ...PaginationQuery,
    academic_year_id: z.coerce.number().int().positive().optional(),
});

const HolidaySchema = z.object({
    id: z.string(),
    tanggal: z.string(),
    nama: z.string(),
    jenis: JenisLiburSchema,
    academic_year_id: z.string().nullable(),
});

export const ListHolidaysResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(HolidaySchema),
    meta: PaginationMetaSchema,
});

export const SingleHolidayResponseSchema = z.object({
    success: z.literal(true),
    data: HolidaySchema,
    meta: z.null(),
});

export const DeleteHolidayResponseSchema = z.object({
    success: z.literal(true),
    data: z.null(),
    meta: z.null(),
});

const WorkDaySchema = z.object({
    /** ISO-8601: 1 = Senin … 7 = Minggu (`work_days.hari`, 0004). */
    hari: z.number().int().min(1).max(7),
    aktif: z.boolean(),
});

/**
 * `PUT /work-days`: pengganti PENUH — ketujuh hari, masing-masing sekali. Aturan
 * "minimal satu hari aktif" ada di service (aturan bisnis, 422), bukan di skema.
 */
export const UpdateWorkDaysBodySchema = z.object({
    hari_kerja: z
        .array(WorkDaySchema)
        .length(7)
        .refine((h) => new Set(h.map((x) => x.hari)).size === 7, {
            message: "Sertakan ketujuh hari (1–7) tepat sekali.",
        }),
});

export const WorkDaysResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(WorkDaySchema),
    meta: z.null(),
});
