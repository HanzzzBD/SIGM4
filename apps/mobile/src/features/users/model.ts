// Pengguna mobile (FR-02.1, FR-01.3, FR-01.5, SL-02; MS-76…MS-79, MS-82) — kontrak sama dengan web P-60…P-67.
// Rahasia (password sementara, kode aktivasi) hanya hidup di state layar dan tampil sekali (BR-070c).
import type { AxiosInstance } from "axios";
import { z } from "zod";

export const STATUS = { AKTIF: "Aktif", NONAKTIF: "Nonaktif" } as const;
export const METHODS = { KARTU_IDENTITAS_TATAP_MUKA: "Kartu identitas, tatap muka", KONFIRMASI_ATASAN_ATAU_WALI_KELAS: "Konfirmasi atasan atau wali kelas" } as const;
export type Method = keyof typeof METHODS;
/** Role Siswa (R-07): consent wali wajib (DP-02) dan sasaran kenaikan kelas (SL-02). */
export const STUDENT_ROLE = "R-07";
export const PROMOTION_LIMIT = 200;

const User = z.object({ id: z.string(), nama: z.string(), email: z.string(), nip_nis: z.string().nullable(), pseudonymized_at: z.string().nullable().optional(), role_id: z.string(), work_unit_id: z.string().nullable(), telepon: z.string().nullable(), status: z.enum(["AKTIF", "NONAKTIF"]), must_change_password: z.boolean(), login_terakhir_pada: z.string().nullable(), consent_guardian_at: z.string().nullable(), created_at: z.string() });
export type UserRow = z.infer<typeof User>;
const Meta = z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() });
const Unit = z.object({ id: z.string(), nama: z.string(), jenis: z.string(), status: z.string() });
const Reset = z.object({ id: z.string(), pemohon: z.object({ id: z.string(), nama: z.string(), email: z.string(), nip_nis: z.string(), role_kode: z.string() }), status: z.enum(["MENUNGGU", "DITERBITKAN", "DITOLAK", "SELESAI", "KEDALUWARSA"]), diminta_pada: z.string(), kedaluwarsa_pada: z.string().nullable(), alasan_penolakan: z.string().nullable() });
export type ResetRequest = z.infer<typeof Reset>;
const Secret = z.object({ user_id: z.string(), berlaku_sampai: z.string().nullable() });

export const loadUsers = async (api: AxiosInstance, q: { page: number; role?: string; status?: string; unit?: string; perPage?: number }, signal: AbortSignal) => z.object({ data: z.array(User), meta: Meta }).parse((await api.get("/users", { params: { page: q.page, per_page: q.perPage ?? 25, ...(q.role ? { "filter[role_id]": q.role } : {}), ...(q.status ? { "filter[status]": q.status } : {}), ...(q.unit ? { "filter[work_unit_id]": q.unit } : {}) }, signal })).data);
export const loadUser = async (api: AxiosInstance, id: string, signal: AbortSignal) => z.object({ data: User }).parse((await api.get(`/users/${id}`, { signal })).data).data;
export const loadRoles = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(z.object({ id: z.string(), kode: z.string(), nama: z.string() })) }).parse((await api.get("/roles", { signal })).data).data;
async function allPages<T>(get: (page: number) => Promise<{ data: T[]; meta: { total_pages: number } }>): Promise<T[]> { const out: T[] = []; for (let page = 1; ; page++) { const r = await get(page); out.push(...r.data); if (page >= r.meta.total_pages) return out; } }
export const loadUnits = (api: AxiosInstance, signal: AbortSignal, jenis?: string) => allPages(async (page) => z.object({ data: z.array(Unit), meta: Meta }).parse((await api.get("/work-units", { params: { page, per_page: 100, ...(jenis ? { "filter[jenis]": jenis } : {}) }, signal })).data));
export const loadYears = (api: AxiosInstance, signal: AbortSignal) => allPages(async (page) => z.object({ data: z.array(z.object({ id: z.string(), nama: z.string(), is_active: z.boolean() })), meta: Meta }).parse((await api.get("/academic-years", { params: { page, per_page: 100 }, signal })).data));
export const createUser = async (api: AxiosInstance, body: unknown) => z.object({ data: User.extend({ password_sementara: z.string() }) }).parse((await api.post("/users", body)).data).data;
export const updateUser = async (api: AxiosInstance, id: string, body: unknown) => z.object({ data: User }).parse((await api.put(`/users/${id}`, body)).data).data;
export const setStatus = async (api: AxiosInstance, id: string, status: "AKTIF" | "NONAKTIF", alasan?: string) => z.object({ data: User }).parse((await api.patch(`/users/${id}/status`, alasan === undefined ? { status } : { status, alasan })).data).data;
/** FR-01.3 A5 / FR-01.5 A3, A7: aksi beridentitas; metode verifikasi luring wajib. */
export const SECRET_ACTIONS = {
    "reset-password": { title: "Reset password", label: "Password sementara", impact: "Seluruh sesi pengguna dicabut dan kunci login dibuka. Pengguna wajib mengganti password saat masuk.", permission: "user.reset_password" },
    "reset-2fa": { title: "Reset 2FA", label: "Kode aktivasi 2FA", impact: "2FA dinonaktifkan, kode cadangan dihapus, dan seluruh sesi pengguna dicabut. Role wajib 2FA menerima kode aktivasi baru.", permission: "user.reset_2fa" },
    "2fa-activation-code": { title: "Terbitkan kode aktivasi 2FA", label: "Kode aktivasi 2FA", impact: "Kode aktivasi sebelumnya tidak berlaku lagi.", permission: "user.reset_2fa" },
} as const;
export type SecretAction = keyof typeof SECRET_ACTIONS;
export async function secretAction(api: AxiosInstance, id: string, action: SecretAction, method: Method): Promise<{ secret: string | null; until: string | null; revoked: number | null }> {
    const r = Secret.extend({ password_sementara: z.string().optional(), kode_aktivasi: z.string().nullable().optional(), sesi_dicabut: z.number().optional() }).parse((await api.post(`/users/${id}/${action}`, { metode_verifikasi: method })).data.data);
    return { secret: r.password_sementara ?? r.kode_aktivasi ?? null, until: r.berlaku_sampai, revoked: r.sesi_dicabut ?? null };
}
export const loadResetRequests = async (api: AxiosInstance, status: string, page: number, signal: AbortSignal) => z.object({ data: z.array(Reset), meta: z.object({ total: z.number(), total_pages: z.number() }) }).parse((await api.get("/auth/password/requests", { params: { "filter[status]": status, page }, signal })).data);
export const issueReset = async (api: AxiosInstance, id: string, method: Method) => z.object({ data: z.object({ password_sementara: z.string(), permintaan: Reset }) }).parse((await api.post(`/auth/password/requests/${id}/issue`, { metode_verifikasi: method })).data).data;
export const rejectReset = async (api: AxiosInstance, id: string, alasan: string) => { await api.post(`/auth/password/requests/${id}/reject`, { alasan }); };
export const promote = async (api: AxiosInstance, year: number, items: readonly PromotionItem[]) => z.object({ data: z.object({ total: z.number(), sukses: z.number(), gagal: z.number(), baris: z.array(z.object({ user_id: z.number(), tindakan: z.enum(["NAIK", "LULUS"]), status: z.enum(["SUKSES", "GAGAL"]), pesan: z.string().nullable(), kewajiban: z.array(z.object({ jenis: z.string(), keterangan: z.string() })) })) }) }).parse((await api.post("/class-promotions", { academic_year_id: year, items })).data).data;

export interface UserForm { nama: string; email: string; nip: string; role: string; unit: string; telepon: string; consent: boolean }
export const formFromUser = (u?: UserRow): UserForm => ({ nama: u?.nama ?? "", email: u?.email ?? "", nip: u?.nip_nis ?? "", role: u?.role_id ?? "", unit: u?.work_unit_id ?? "", telepon: u?.telepon ?? "", consent: !!u?.consent_guardian_at });
/** FR-02.1: nama/email/NIP/role wajib; Siswa wajib consent wali (DP-02). Tanpa `setting.view` unit lama dipertahankan (PUT penuh). */
export function userBody(f: UserForm, o: { student: boolean; canSetting: boolean; original?: UserRow | undefined }): { body: unknown } | { error: string } {
    if (!f.nama.trim()) return { error: "Nama wajib diisi." };
    if (!f.email.trim()) return { error: "Email wajib diisi." };
    if (!f.nip.trim()) return { error: "NIP/NIS wajib diisi." };
    if (!f.role) return { error: "Role wajib dipilih." };
    if (o.student && !f.consent) return { error: "Akun siswa wajib disertai persetujuan wali (DP-02)." };
    const unit = o.canSetting ? { work_unit_id: f.unit ? Number(f.unit) : null } : o.original ? { work_unit_id: o.original.work_unit_id === null ? null : Number(o.original.work_unit_id) } : {};
    return { body: { nama: f.nama.trim(), email: f.email.trim(), nip_nis: f.nip.trim(), role_id: Number(f.role), ...unit, telepon: f.telepon.trim() || null, ...(o.student ? { consent_wali: f.consent } : {}) } };
}
/** BR-069: email dan role akun sendiri tidak dapat diubah. */
export const lockedSelf = (u: UserRow | undefined, me: string) => !!u && u.id === me;

export type PromotionChoice = { action: "NAIK"; kelas: string } | { action: "LULUS" };
export type PromotionItem = { user_id: number; tindakan: "NAIK"; kelas_id: number } | { user_id: number; tindakan: "LULUS" };
/** SL-02: hanya pilihan lengkap yang dikirim; maksimal 200 siswa per proses. */
export function promotionItems(choices: Readonly<Record<string, PromotionChoice>>): { items: PromotionItem[] } | { error: string } {
    const items = Object.entries(choices).flatMap(([id, c]): PromotionItem[] => c.action === "LULUS" ? [{ user_id: Number(id), tindakan: "LULUS" }] : c.kelas ? [{ user_id: Number(id), tindakan: "NAIK", kelas_id: Number(c.kelas) }] : []);
    if (!items.length) return { error: "Tetapkan kelas atau tandai lulus minimal satu siswa." };
    return items.length > PROMOTION_LIMIT ? { error: `Maksimal ${PROMOTION_LIMIT} siswa per proses.` } : { items };
}
/** Siswa berhasil keluar dari draf; yang gagal tetap untuk dikoreksi. */
export const remainingChoices = (choices: Readonly<Record<string, PromotionChoice>>, rows: readonly { user_id: number; status: string }[]) => { const done = new Set(rows.filter((r) => r.status === "SUKSES").map((r) => String(r.user_id))); return Object.fromEntries(Object.entries(choices).filter(([id]) => !done.has(id))); };
