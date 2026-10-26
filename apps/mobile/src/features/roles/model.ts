// Role & Permission mobile (FR-02.2, BR-069a; MS-80, MS-81) — kontrak sama dengan web P-65/P-66.
// Penguncian permission inti Administrator tetap ditegakkan server (FR-02.2 A1); klien hanya mencerminkannya.
import type { AxiosInstance } from "axios";
import { z } from "zod";

export const SCOPES = { ALL: "Semua data", OWN: "Data sendiri", ASSIGNED: "Data yang ditugaskan", RESTRICTED: "Data terbatas" } as const;
export type Scope = keyof typeof SCOPES;
/** Role bawaan berperilaku khusus kode — tidak dapat dijadikan templat (BR-069a). */
export const NOT_TEMPLATE: ReadonlySet<string> = new Set(["R-01", "R-03", "R-07"]);
export const ADMIN_ROLE = "R-01";
const ACTION_ORDER = ["view", "create", "update", "delete", "approve", "export"];
export const ACTION_LABEL: Readonly<Record<string, string>> = { view: "Lihat", create: "Tambah", update: "Ubah", delete: "Hapus", approve: "Setujui", export: "Ekspor", manage: "Kelola", execute: "Jalankan" };

const Role = z.object({ id: z.string(), kode: z.string(), nama: z.string(), deskripsi: z.string().nullable(), is_system: z.boolean(), role_version: z.string(), jumlah_pengguna: z.number(), permissions: z.array(z.object({ kode: z.string(), scope: z.enum(["ALL", "OWN", "ASSIGNED", "RESTRICTED"]) })) });
export type RoleDetail = z.infer<typeof Role>;
const Permission = z.object({ kode: z.string(), modul: z.string(), aksi: z.string(), deskripsi: z.string(), inti: z.boolean() });
export type Permission = z.infer<typeof Permission>;
export const loadRoles = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(Role) }).parse((await api.get("/roles", { signal })).data).data;
export const loadCatalog = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(Permission) }).parse((await api.get("/permissions", { signal })).data).data;
export const copyRole = async (api: AxiosInstance, body: { sumber_role_id: number; nama: string; deskripsi: string | null }) => z.object({ data: Role }).parse((await api.post("/roles", body)).data).data;
/** PUT pengganti penuh (FR-02.2 langkah 4). */
export const saveMatrix = async (api: AxiosInstance, id: string, permissions: readonly { kode: string; scope: Scope }[]) => z.object({ data: Role }).parse((await api.put(`/roles/${id}/permissions`, { permissions })).data).data;

export type Held = Readonly<Record<string, Scope | null>>;
export const heldFrom = (r: Pick<RoleDetail, "permissions">): Held => Object.fromEntries(r.permissions.map((p) => [p.kode, p.scope]));
/** FR-02.2 A1: permission inti yang kini dipegang Administrator tidak dapat dicabut. */
export const coreLocked = (r: Pick<RoleDetail, "kode" | "permissions">, p: Pick<Permission, "kode" | "inti">) => r.kode === ADMIN_ROLE && p.inti && r.permissions.some((x) => x.kode === p.kode);
/** Mencentang ulang memakai cakupan semula; permission baru default Semua data. */
export function toggle(held: Held, r: Pick<RoleDetail, "permissions">, kode: string, on: boolean): Held { return { ...held, [kode]: on ? r.permissions.find((p) => p.kode === kode)?.scope ?? "ALL" : null }; }
export const matrixPayload = (held: Held) => Object.entries(held).flatMap(([kode, scope]) => scope === null ? [] : [{ kode, scope }]);
export const changed = (held: Held, r: Pick<RoleDetail, "permissions">, catalog: readonly Pick<Permission, "kode">[]) => catalog.some((p) => (held[p.kode] ?? null) !== (r.permissions.find((x) => x.kode === p.kode)?.scope ?? null));
/** Modul × aksi: aksi baku lebih dulu, lainnya menurut kode. */
export function modules(catalog: readonly Permission[]): { modul: string; items: Permission[] }[] {
    const rank = (a: string) => { const i = ACTION_ORDER.indexOf(a); return i === -1 ? ACTION_ORDER.length : i; };
    return [...new Set(catalog.map((p) => p.modul))].map((modul) => ({ modul, items: catalog.filter((p) => p.modul === modul).sort((a, b) => rank(a.aksi) - rank(b.aksi) || a.kode.localeCompare(b.kode)) }));
}
