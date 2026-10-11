// Kontrak role & permission M-02 di klien web (m02 §7; FR-02.2, FR-02.2 A1/A2, BR-069a; PR-01-20). Respons
// diurai skema `zod/mini` (SDD-FE-05).

import { queryOptions } from "@tanstack/react-query";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ApiError, api } from "../../shared/api";

export const SCOPE = ["ALL", "OWN", "ASSIGNED", "RESTRICTED"] as const;
export type Scope = (typeof SCOPE)[number];
/** Bab 11.3 "Cakupan Data Permission". */
export const LABEL_SCOPE: Record<Scope, string> = { ALL: "All", OWN: "Own", ASSIGNED: "Assigned", RESTRICTED: "Restricted" };

/** Role bawaan pemilik perilaku berbasis kode role — tak dapat dijadikan template (BR-069a); server tetap menolak. */
export const BUKAN_TEMPLATE: ReadonlySet<string> = new Set(["R-01", "R-03", "R-07"]);
/** Role Administrator: permission inti terkunci (FR-02.2 A1). */
export const KODE_ADMINISTRATOR = "R-01";

const Role = z.object({
    id: z.string(),
    kode: z.string(),
    nama: z.string(),
    deskripsi: z.nullable(z.string()),
    is_system: z.boolean(),
    role_version: z.string(),
    jumlah_pengguna: z.number(),
    permissions: z.array(z.object({ kode: z.string(), scope: z.enum(SCOPE) })),
});
export type Role = z.infer<typeof Role>;

export const daftarRoleQuery = queryOptions({
    queryKey: ["roles", "lengkap"],
    queryFn: async () => z.object({ data: z.array(Role) }).parse((await api.get("/roles")).data).data,
});

const Permission = z.object({ kode: z.string(), modul: z.string(), aksi: z.string(), deskripsi: z.string(), inti: z.boolean() });
export type Permission = z.infer<typeof Permission>;

/** Katalog Lampiran C (`GET /permissions`). */
export const katalogQuery = queryOptions({
    queryKey: ["permissions"],
    staleTime: 10 * 60_000,
    queryFn: async () => z.object({ data: z.array(Permission) }).parse((await api.get("/permissions")).data).data,
});

export async function salinRole(body: { readonly sumber_role_id: number; readonly nama: string; readonly deskripsi: string | null }) {
    return z.object({ data: Role }).parse((await api.post("/roles", body)).data).data;
}

/** PUT pengganti penuh (FR-02.2 langkah 4). */
export async function simpanMatriks(id: string, permissions: readonly { readonly kode: string; readonly scope: Scope }[]) {
    return z.object({ data: Role }).parse((await api.put(`/roles/${id}/permissions`, { permissions })).data).data;
}

/** Pesan galat server untuk pengguna (pesan umum atau per isian). */
export function pesanGalat(g: unknown): string {
    if (!(g instanceof ApiError)) return g instanceof Error ? g.message : "Perubahan belum tersimpan. Coba lagi.";
    return g.details.length > 0 ? g.details.map((d) => d.message).join(" ") : g.message;
}
