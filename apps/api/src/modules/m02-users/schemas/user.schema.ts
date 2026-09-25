// Skema Zod M-02 (SDD-API-01, SDD-API-11): satu-satunya definisi validasi,
// tipe statis, dan OpenAPI untuk CRUD pengguna (FR-02.1).

import { z } from "zod";

export const UserStatusSchema = z.enum(["AKTIF", "NONAKTIF"]);

const NamaSchema = z.string().trim().min(1).max(150);
const EmailSchema = z.email().trim().toLowerCase().max(150);
const NipNisSchema = z.string().trim().min(1).max(30);
const RoleIdSchema = z.coerce.number().int().positive();
/** WU-01: `work_unit_id` menggantikan teks bebas `unit_kerja` (Lampiran E.3). */
const WorkUnitIdSchema = z.coerce.number().int().positive().nullable();
const TeleponSchema = z.string().trim().min(1).max(20).nullable();

export const UserIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

/** FR-02.1 langkah 2. Password TIDAK diterima dari klien — lahir sementara (langkah 4). */
export const CreateUserBodySchema = z.object({
    nama: NamaSchema,
    email: EmailSchema,
    nip_nis: NipNisSchema,
    role_id: RoleIdSchema,
    work_unit_id: WorkUnitIdSchema.optional(),
    /** DP-02: persetujuan wali sudah dikumpulkan sekolah — mengisi `consent_guardian_at` (cap waktu server, satu arah). */
    consent_wali: z.boolean().optional(),
    telepon: TeleponSchema.optional(),
});

/** PUT — pengganti penuh field yang boleh disunting (FR-02.1 langkah 6). */
export const UpdateUserBodySchema = z.object({
    nama: NamaSchema,
    email: EmailSchema,
    nip_nis: NipNisSchema,
    role_id: RoleIdSchema,
    work_unit_id: WorkUnitIdSchema.optional(),
    /** DP-02: persetujuan wali sudah dikumpulkan sekolah — mengisi `consent_guardian_at` (cap waktu server, satu arah). */
    consent_wali: z.boolean().optional(),
    telepon: TeleponSchema.optional(),
});

/**
 * FR-02.1 langkah 7: alasan wajib diisi saat menonaktifkan. Mengaktifkan kembali
 * tidak menuntutnya.
 */
export const UpdateUserStatusBodySchema = z
    .object({
        status: UserStatusSchema,
        alasan: z.string().trim().min(1).max(500).optional(),
    })
    .superRefine((val, ctx) => {
        if (val.status === "NONAKTIF" && val.alasan === undefined) {
            ctx.addIssue({
                code: "custom",
                message: "Alasan wajib diisi saat menonaktifkan pengguna.",
                path: ["alasan"],
            });
        }
    });

/**
 * Query daftar (Bab 17.1): `page`/`per_page` datar, filter berbentuk
 * `filter[kunci]` — controller membaca kuncinya langsung dari `req.query`
 * (parser `simple` Express 5 tidak menguraikan tanda kurung menjadi objek).
 */
export const ListUsersQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
    status: UserStatusSchema.optional(),
    role_id: z.coerce.number().int().positive().optional(),
    work_unit_id: z.coerce.number().int().positive().optional(),
});

const UserSchema = z.object({
    id: z.string(),
    nama: z.string(),
    email: z.string(),
    nip_nis: z.string(),
    role_id: z.string(),
    work_unit_id: z.string().nullable(),
    telepon: z.string().nullable(),
    status: UserStatusSchema,
    must_change_password: z.boolean(),
    login_terakhir_pada: z.string().nullable(),
    /** DP-02: kapan persetujuan wali terekam; null bila belum. */
    consent_guardian_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});

/** FR-02.1 langkah 4/5: password sementara ditampilkan satu kali saat dibuat. */
const CreatedUserSchema = UserSchema.extend({
    password_sementara: z.string(),
});

const PaginationMetaSchema = z.object({
    page: z.number(),
    per_page: z.number(),
    total: z.number(),
    total_pages: z.number(),
});

export const SingleUserResponseSchema = z.object({
    success: z.literal(true),
    data: UserSchema,
    meta: z.null(),
});

export const CreatedUserResponseSchema = z.object({
    success: z.literal(true),
    data: CreatedUserSchema,
    meta: z.null(),
});

export const ListUsersResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(UserSchema),
    meta: PaginationMetaSchema,
});

/**
 * `POST /users/{id}/reset-password`: metode verifikasi identitas WAJIB dipilih sebelum penerbitan
 * (FR-01.3 AC). Kodenya PRD Bab 11.3 "Metode Verifikasi Identitas" — dimiliki M-01, diulang di sini
 * karena modul tidak berbagi skema.
 */
export const ResetPasswordBodySchema = z.object({
    metode_verifikasi: z.enum(["KARTU_IDENTITAS_TATAP_MUKA", "KONFIRMASI_ATASAN_ATAU_WALI_KELAS"]),
});

/** `POST /users/{id}/reset-2fa` dan `/2fa-activation-code`: metode verifikasi identitas luring wajib (FR-01.5 A3/A7, seperti FR-01.3). */
export const KelolaDuaFaktorBodySchema = z.object({
    metode_verifikasi: z.enum(["KARTU_IDENTITAS_TATAP_MUKA", "KONFIRMASI_ATASAN_ATAU_WALI_KELAS"]),
});

export const KodeAktivasiResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        user_id: z.string(),
        /** Tampil SATU kali dan tak dapat dibaca ulang, termasuk oleh Administrator penerbitnya. */
        kode_aktivasi: z.string(),
        berlaku_sampai: z.string(),
    }),
    meta: z.null(),
});

export const ResetDuaFaktorResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        user_id: z.string(),
        sesi_dicabut: z.number(),
        /** Role wajib 2FA: kode aktivasi baru, tampil SATU kali; role lain: null. */
        kode_aktivasi: z.string().nullable(),
        berlaku_sampai: z.string().nullable(),
    }),
    meta: z.null(),
});

export const ResetPasswordResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        user_id: z.string(),
        permintaan_id: z.string(),
        /** Tampil SATU kali dan tak dapat dibaca ulang, termasuk oleh Administrator penerbitnya. */
        password_sementara: z.string(),
        berlaku_sampai: z.string(),
    }),
    meta: z.null(),
});
