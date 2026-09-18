// Skema Zod M-03 (SDD-API-01, SDD-API-11): validasi masukan/keluaran hierarki
// lokasi (FR-03.1).

import { z } from "zod";

export const RoomTypeSchema = z.enum([
    "KELAS",
    "LABORATORIUM",
    "AULA",
    "PERPUSTAKAAN",
    "KANTOR",
    "GUDANG",
    "LAPANGAN",
    "LAINNYA",
]);

const LocationStatusSchema = z.enum(["AKTIF", "NONAKTIF"]);

const NamaSchema = z.string().trim().min(1).max(150);
const KodeSchema = z.string().trim().min(1).max(50);
const KeteranganSchema = z.string().trim().min(1).max(500).nullable();
const KapasitasSchema = z.coerce.number().int().positive().nullable();
const PenanggungJawabIdSchema = z.coerce.number().int().positive().nullable();

export const IdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

/** FR-03.1 langkah 2. */
export const CreateBuildingBodySchema = z.object({
    nama: NamaSchema,
    kode: KodeSchema,
    keterangan: KeteranganSchema.optional(),
});

/** FR-03.1 langkah 3. */
export const CreateAreaBodySchema = z.object({
    building_id: z.coerce.number().int().positive(),
    nama: NamaSchema,
    kode: KodeSchema,
    lantai: z.coerce.number().int().nullable().optional(),
});

/** FR-03.1 langkah 4. */
export const CreateRoomBodySchema = z.object({
    area_id: z.coerce.number().int().positive(),
    nama: NamaSchema,
    kode: KodeSchema,
    jenis: RoomTypeSchema,
    kapasitas: KapasitasSchema.optional(),
    penanggung_jawab_id: PenanggungJawabIdSchema.optional(),
    dapat_direservasi: z.boolean().default(false),
    boleh_direservasi_siswa: z.boolean().default(false),
});

/**
 * PUT — pengganti penuh field yang boleh disunting. TANPA `status`: penonaktifan
 * berjenjang (BR-015, FR-03.1 A2/A3) lewat `PATCH .../status` (`PR-01-06`).
 */
export const UpdateRoomBodySchema = z.object({
    area_id: z.coerce.number().int().positive(),
    nama: NamaSchema,
    kode: KodeSchema,
    jenis: RoomTypeSchema,
    kapasitas: KapasitasSchema.optional(),
    penanggung_jawab_id: PenanggungJawabIdSchema.optional(),
    dapat_direservasi: z.boolean(),
    boleh_direservasi_siswa: z.boolean(),
});

const BuildingSchema = z.object({
    id: z.string(),
    nama: z.string(),
    kode: z.string(),
    keterangan: z.string().nullable(),
    status: LocationStatusSchema,
    created_at: z.string(),
    updated_at: z.string(),
});

const AreaSchema = z.object({
    id: z.string(),
    building_id: z.string(),
    nama: z.string(),
    kode: z.string(),
    lantai: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});

const RoomSchema = z.object({
    id: z.string(),
    area_id: z.string(),
    nama: z.string(),
    kode: z.string(),
    jenis: RoomTypeSchema,
    kapasitas: z.number().nullable(),
    penanggung_jawab_id: z.string().nullable(),
    dapat_direservasi: z.boolean(),
    boleh_direservasi_siswa: z.boolean(),
    status: LocationStatusSchema,
    created_at: z.string(),
    updated_at: z.string(),
});

export const SingleBuildingResponseSchema = z.object({
    success: z.literal(true),
    data: BuildingSchema,
    meta: z.null(),
});

export const SingleAreaResponseSchema = z.object({
    success: z.literal(true),
    data: AreaSchema,
    meta: z.null(),
});

export const SingleRoomResponseSchema = z.object({
    success: z.literal(true),
    data: RoomSchema,
    meta: z.null(),
});

/** `PATCH /buildings/{id}/status` · `PATCH /rooms/{id}/status` (BR-015). */
export const UpdateLocationStatusBodySchema = z.object({
    status: LocationStatusSchema,
});

const AreaWithRoomsSchema = AreaSchema.extend({ rooms: z.array(RoomSchema) });
const BuildingWithTreeSchema = BuildingSchema.extend({ areas: z.array(AreaWithRoomsSchema) });

/** `GET /locations/tree` (FR-03.1 langkah 1) — tanpa penyaringan status. */
export const LocationTreeResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(BuildingWithTreeSchema),
    meta: z.null(),
});
