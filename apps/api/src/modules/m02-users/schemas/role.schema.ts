// Skema Zod role/permission (SDD-API-01, SDD-API-11, `FR-02.2`).

import { z } from "zod";

/** Sama seperti enum `permission_scope` di basis data (0009) — tanpa terjemahan. */
export const PermissionScopeSchema = z.enum(["ALL", "OWN", "ASSIGNED", "RESTRICTED"]);

export const RoleIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

const RolePermissionEntrySchema = z.object({
    kode: z.string().trim().min(1).max(100),
    scope: PermissionScopeSchema,
});

/**
 * PUT — pengganti PENUH matriks role (FR-02.2 langkah 4): daftar permission
 * yang harus dipegang role setelah disimpan, bukan delta terhadap yang lama.
 */
export const UpdateRolePermissionsBodySchema = z
    .object({
        permissions: z.array(RolePermissionEntrySchema).max(200),
    })
    .superRefine((val, ctx) => {
        const terlihat = new Set<string>();
        val.permissions.forEach((p, i) => {
            if (terlihat.has(p.kode)) {
                ctx.addIssue({
                    code: "custom",
                    message: `Kode permission duplikat: ${p.kode}.`,
                    path: ["permissions", i, "kode"],
                });
            }
            terlihat.add(p.kode);
        });
    });

const RolePermissionSchema = z.object({
    kode: z.string(),
    scope: PermissionScopeSchema,
});

const RoleSchema = z.object({
    id: z.string(),
    kode: z.string(),
    nama: z.string(),
    deskripsi: z.string().nullable(),
    is_system: z.boolean(),
    role_version: z.string(),
    jumlah_pengguna: z.number(),
    permissions: z.array(RolePermissionSchema),
});

export const ListRolesResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(RoleSchema),
    meta: z.null(),
});

export const SingleRoleResponseSchema = z.object({
    success: z.literal(true),
    data: RoleSchema,
    meta: z.null(),
});
