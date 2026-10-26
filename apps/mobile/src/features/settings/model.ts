// Pengaturan mobile (FR-20.x; MS-85…MS-87) — kontrak sama dengan web P-70…P-72. Dibaca `setting.view`, diubah `setting.manage`.
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { MaterialUnitBodySchema, MaterialUnitsResponseSchema } from "@sigm4/schemas";

export const GROUPS = { IDENTITAS_SEKOLAH: "Identitas Sekolah", KODE_ASET: "Kode Aset", PEMINJAMAN: "Peminjaman", DENDA: "Denda", RESERVASI: "Reservasi", MAINTENANCE: "Maintenance", BAHAN: "Bahan", NOTIFIKASI: "Notifikasi", KEAMANAN: "Keamanan", CHATBOT_AI: "Chatbot AI" } as const;
export type Group = keyof typeof GROUPS;
/** Dampak perubahan yang wajib diperingatkan sebelum disimpan (FR-20.1). */
export const IMPACT: Partial<Record<Group, string>> = { KODE_ASET: "Format kode baru hanya berlaku untuk aset yang didaftarkan sesudah perubahan; kode aset yang sudah ada tidak berubah.", DENDA: "Tarif dan batas baru berlaku untuk peminjaman yang diserahterimakan sesudah perubahan; denda yang sudah terbit tetap memakai nilai tersimpan." };
export const HOLIDAY_TYPES = { NASIONAL: "Nasional", SEKOLAH: "Sekolah", CUTI_BERSAMA: "Cuti Bersama" } as const;
export const UNIT_TYPES = { MANAJEMEN: "Manajemen", MATA_PELAJARAN: "Mata Pelajaran", TATA_USAHA: "Tata Usaha", EKSTRAKURIKULER: "Ekstrakurikuler", KELAS: "Kelas" } as const;
export const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"] as const;

const Meta = z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() });
async function allPages<T>(get: (page: number) => Promise<{ data: T[]; meta: { total_pages: number } }>): Promise<T[]> { const out: T[] = []; for (let page = 1; ; page++) { const r = await get(page); out.push(...r.data); if (page >= r.meta.total_pages) return out; } }
const Parameter = z.object({ key: z.string(), kelompok: z.enum(Object.keys(GROUPS) as [Group, ...Group[]]), tipe: z.enum(["BILANGAN_BULAT", "DESIMAL", "BOOLEAN", "TEKS"]), value: z.unknown(), nilai_bawaan: z.unknown(), nilai_min: z.number().nullable(), nilai_maks: z.number().nullable(), deskripsi: z.string(), updated_at: z.string(), updated_by: z.string().nullable() });
export type Parameter = z.infer<typeof Parameter>;
const Semester = z.object({ id: z.string(), nama: z.enum(["GANJIL", "GENAP"]), tanggal_mulai: z.string(), tanggal_selesai: z.string() });
const Year = z.object({ id: z.string(), nama: z.string(), tanggal_mulai: z.string(), tanggal_selesai: z.string(), is_active: z.boolean(), semester: z.array(Semester) });
export type Year = z.infer<typeof Year>;
const Holiday = z.object({ id: z.string(), tanggal: z.string(), nama: z.string(), jenis: z.enum(["NASIONAL", "SEKOLAH", "CUTI_BERSAMA"]), academic_year_id: z.string().nullable() });
export type Holiday = z.infer<typeof Holiday>;
const Unit = z.object({ id: z.string(), nama: z.string(), kode: z.string(), jenis: z.enum(["MANAJEMEN", "MATA_PELAJARAN", "TATA_USAHA", "EKSTRAKURIKULER", "KELAS"]), kepala_unit_id: z.string().nullable(), status: z.enum(["AKTIF", "NONAKTIF"]) });
export type Unit = z.infer<typeof Unit>;

export const loadParameters = (api: AxiosInstance, group: Group, signal: AbortSignal) => allPages(async (page) => z.object({ data: z.array(Parameter), meta: Meta }).parse((await api.get("/settings", { params: { page, per_page: 100, "filter[kelompok]": group }, signal })).data));
export const saveParameters = async (api: AxiosInstance, settings: Readonly<Record<string, unknown>>) => z.object({ data: z.array(Parameter) }).parse((await api.put("/settings", { settings })).data).data;
export const loadYears = (api: AxiosInstance, signal: AbortSignal) => allPages(async (page) => z.object({ data: z.array(Year), meta: Meta }).parse((await api.get("/academic-years", { params: { page, per_page: 100 }, signal })).data));
export const saveYear = async (api: AxiosInstance, id: string | null, body: unknown) => z.object({ data: Year }).parse((await (id ? api.put(`/academic-years/${id}`, body) : api.post("/academic-years", body))).data).data;
export const activateYear = async (api: AxiosInstance, id: string) => z.object({ data: Year }).parse((await api.patch(`/academic-years/${id}/activate`)).data).data;
export const loadHolidays = (api: AxiosInstance, signal: AbortSignal) => allPages(async (page) => z.object({ data: z.array(Holiday), meta: Meta }).parse((await api.get("/holidays", { params: { page, per_page: 100 }, signal })).data));
export const saveHoliday = async (api: AxiosInstance, id: string | null, body: unknown) => z.object({ data: Holiday }).parse((await (id ? api.put(`/holidays/${id}`, body) : api.post("/holidays", body))).data).data;
export const deleteHoliday = async (api: AxiosInstance, id: string) => { await api.delete(`/holidays/${id}`); };
export const loadWorkDays = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(z.object({ hari: z.number(), aktif: z.boolean() })) }).parse((await api.get("/work-days", { signal })).data).data;
export const saveWorkDays = async (api: AxiosInstance, hari_kerja: readonly { hari: number; aktif: boolean }[]) => z.object({ data: z.array(z.object({ hari: z.number(), aktif: z.boolean() })) }).parse((await api.put("/work-days", { hari_kerja })).data).data;
export const loadUnits = async (api: AxiosInstance, q: { page: number; jenis: string; status: string }, signal: AbortSignal) => z.object({ data: z.array(Unit), meta: Meta }).parse((await api.get("/work-units", { params: { page: q.page, per_page: 25, ...(q.jenis ? { "filter[jenis]": q.jenis } : {}), ...(q.status ? { "filter[status]": q.status } : {}) }, signal })).data);
export const saveUnit = async (api: AxiosInstance, id: string | null, body: unknown) => z.object({ data: Unit }).parse((await (id ? api.put(`/work-units/${id}`, body) : api.post("/work-units", body))).data).data;
export const setUnitStatus = async (api: AxiosInstance, id: string, status: "AKTIF" | "NONAKTIF") => z.object({ data: Unit }).parse((await api.patch(`/work-units/${id}/status`, { status })).data).data;
export const loadMaterialUnits = async (api: AxiosInstance, signal: AbortSignal) => MaterialUnitsResponseSchema.parse((await api.get("/material-units", { signal })).data).data;
export const writeMaterialUnit = async (api: AxiosInstance, path: string, method: "post" | "patch", body: unknown, key: string) => { await api.request({ url: path, method, data: body, headers: { "Idempotency-Key": key } }); };
export const materialUnitBody = (nama: string, simbol: string, keterangan: string) => { const p = MaterialUnitBodySchema.safeParse({ nama, simbol, keterangan: keterangan.trim() || null }); return p.success ? { body: p.data } : { error: "Isi nama satuan dan simbol yang sah." }; };

/** Nilai isian → nilai bertipe parameter; `undefined` bila belum sah (dicegah sebelum dikirim). */
export function typedValue(p: Pick<Parameter, "tipe">, raw: string | boolean): unknown {
    if (p.tipe === "BOOLEAN") return raw === true;
    if (p.tipe === "TEKS") return raw;
    const s = String(raw).trim().replace(",", ".");
    if (s === "") return undefined;
    const n = Number(s);
    return !Number.isFinite(n) || (p.tipe === "BILANGAN_BULAT" && !Number.isInteger(n)) ? undefined : n;
}
export const shownValue = (p: Pick<Parameter, "tipe" | "value">): string | boolean => p.tipe === "BOOLEAN" ? p.value === true : p.value === null || p.value === undefined ? "" : String(p.value);
/** Hanya parameter yang berubah dikirim; isian bukan angka ditolak sebelum dikirim, rentang diputus server (FR-20.1 A1). */
export function parameterChanges(params: readonly Parameter[], draft: Readonly<Record<string, string | boolean>>): { settings: Record<string, unknown> } | { errors: Record<string, string> } {
    const settings: Record<string, unknown> = {}, errors: Record<string, string> = {};
    for (const p of params) {
        if (!(p.key in draft) || draft[p.key] === shownValue(p)) continue;
        const v = typedValue(p, draft[p.key]!);
        if (v === undefined) errors[p.key] = p.tipe === "BILANGAN_BULAT" ? "Isi dengan bilangan bulat." : "Isi dengan angka.";
        else settings[p.key] = v;
    }
    return Object.keys(errors).length ? { errors } : { settings };
}
export interface YearForm { nama: string; start: string; end: string; ganjil: [string, string]; genap: [string, string] }
export const yearForm = (y?: Year): YearForm => { const s = (n: "GANJIL" | "GENAP") => y?.semester.find((x) => x.nama === n); return { nama: y?.nama ?? "", start: y?.tanggal_mulai.slice(0, 10) ?? "", end: y?.tanggal_selesai.slice(0, 10) ?? "", ganjil: [s("GANJIL")?.tanggal_mulai.slice(0, 10) ?? "", s("GANJIL")?.tanggal_selesai.slice(0, 10) ?? ""], genap: [s("GENAP")?.tanggal_mulai.slice(0, 10) ?? "", s("GENAP")?.tanggal_selesai.slice(0, 10) ?? ""] }; };
/** Tahun ajaran beserta kedua semesternya wajib lengkap; urutan dan tumpang tindih tanggal diputus server (FR-20.2). */
export function yearBody(f: YearForm): { body: unknown } | { error: string } {
    if (!f.nama.trim() || [f.start, f.end, ...f.ganjil, ...f.genap].some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) return { error: "Lengkapi nama, rentang tahun ajaran, dan kedua semester." };
    return { body: { nama: f.nama.trim(), tanggal_mulai: f.start, tanggal_selesai: f.end, semester: [{ nama: "GANJIL", tanggal_mulai: f.ganjil[0], tanggal_selesai: f.ganjil[1] }, { nama: "GENAP", tanggal_mulai: f.genap[0], tanggal_selesai: f.genap[1] }] } };
}
export function holidayBody(f: { tanggal: string; nama: string; jenis: keyof typeof HOLIDAY_TYPES; year: string }): { body: unknown } | { error: string } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tanggal) || !f.nama.trim()) return { error: "Tanggal, nama, dan jenis hari libur wajib diisi." };
    return { body: { tanggal: f.tanggal, nama: f.nama.trim(), jenis: f.jenis, academic_year_id: f.year ? Number(f.year) : null } };
}
/** Kepala unit lama dipertahankan saat menyunting (PUT pengganti penuh), sama dengan web. */
export function unitBody(f: { nama: string; kode: string; jenis: keyof typeof UNIT_TYPES }, original?: Pick<Unit, "kepala_unit_id">): { body: unknown } | { error: string } {
    if (!f.nama.trim() || !f.kode.trim()) return { error: "Isi nama dan kode unit kerja." };
    return { body: { nama: f.nama.trim(), kode: f.kode.trim(), jenis: f.jenis, ...(original ? { kepala_unit_id: original.kepala_unit_id === null ? null : Number(original.kepala_unit_id) } : {}) } };
}
