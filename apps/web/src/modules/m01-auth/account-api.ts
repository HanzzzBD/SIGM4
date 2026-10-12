import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../../shared/api";
import { ApiError } from "../../shared/api";
import { pesanUmum } from "./galat";
export class AccountInputError extends Error {}
export const accountError = (error: unknown) => error instanceof AccountInputError ? error.message : error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429 ? error.details.map((d) => d.message).join(" ") || error.message : pesanUmum(error);
export const photoQuery = queryOptions({ queryKey: ["account", "profile-photo"], queryFn: async () => z.object({ data: z.object({ user: z.object({ foto_status: z.enum(["PENDING", "CLEAN", "INFECTED", "FAILED"]).nullable(), foto_url: z.url().nullable() }) }) }).parse((await api.get("/me")).data).data.user, refetchInterval: (q) => q.state.data?.foto_status === "PENDING" ? 5000 : false });

const Status = z.object({ data: z.object({ aktif: z.boolean(), diaktifkan_pada: z.string().nullable(), sisa_kode_cadangan: z.number().int().nonnegative(), kode_cadangan_menipis: z.boolean() }) });
export const status2faQuery = queryOptions({ queryKey: ["account", "2fa"], staleTime: 0, refetchOnWindowFocus: "always", queryFn: async () => Status.parse((await api.get("/auth/2fa/status")).data).data });
const Sessions = z.object({ data: z.array(z.object({ id: z.string(), platform: z.string(), ip: z.string().nullable(), user_agent: z.string().nullable(), dibuat_pada: z.string(), terakhir_diperbarui: z.string(), berlaku_sampai: z.string(), saat_ini: z.boolean() })) });
export const sessionsQuery = queryOptions({ queryKey: ["account", "sessions"], queryFn: async () => Sessions.parse((await api.get("/auth/sessions")).data).data });
export const cabutSesi = async (id: string) => { await api.delete(`/auth/sessions/${encodeURIComponent(id)}`); };
export const buatUlangKode = async () => z.object({ data: z.object({ kode_cadangan: z.array(z.string()) }) }).parse((await api.post("/auth/2fa/backup-codes/regenerate")).data).data.kode_cadangan;
export const ajukanReset = async (email: string) => { await api.post("/auth/password/forgot", { email }); };
export const perbaruiProfil = async (nama: string, telepon: string | null, foto?: number | null) => { await api.put("/me", { nama, telepon, ...(foto === undefined ? {} : { foto_file_id: foto }) }); };
export async function unggahFotoProfil(file: File) {
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size === 0 || file.size > 2 * 1024 * 1024) throw new AccountInputError("Pilih foto JPG/PNG yang berisi gambar, maksimal 2 MB.");
    const checksum = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const order = z.object({ data: z.object({ file_id: z.string(), upload_url: z.url() }) }).parse((await api.post("/files/presign", { jenis: "USER_PHOTO", mime: file.type, ukuran: file.size })).data).data;
    const response = await fetch(order.upload_url, { method: "PUT", credentials: "omit", headers: { "content-type": file.type }, body: file });
    if (!response.ok) throw new AccountInputError("Foto belum terunggah. Coba lagi.");
    await api.post("/files/confirm", { file_id: Number(order.file_id), checksum });
    return Number(order.file_id);
}
export const STATUS_RESET = ["MENUNGGU", "DITERBITKAN", "DITOLAK", "SELESAI", "KEDALUWARSA"] as const;
export type StatusReset = (typeof STATUS_RESET)[number];
export const METODE = [{ nilai: "KARTU_IDENTITAS_TATAP_MUKA", label: "Kartu identitas, tatap muka" }, { nilai: "KONFIRMASI_ATASAN_ATAU_WALI_KELAS", label: "Konfirmasi atasan atau wali kelas" }];
const Request = z.object({ id: z.string(), pemohon: z.object({ id: z.string(), nama: z.string(), email: z.string(), nip_nis: z.string(), role_kode: z.string() }), status: z.enum(STATUS_RESET), metode_verifikasi: z.string().nullable(), diminta_pada: z.string(), diproses_pada: z.string().nullable(), kedaluwarsa_pada: z.string().nullable(), alasan_penolakan: z.string().nullable() });
export type ResetRequest = z.infer<typeof Request>;
export const resetQuery = (status: StatusReset, page: number) => queryOptions({ queryKey: ["account", "reset", status, page], queryFn: async () => z.object({ data: z.array(Request), meta: z.object({ total: z.number(), total_pages: z.number() }) }).parse((await api.get("/auth/password/requests", { params: { "filter[status]": status, page, per_page: 25 } })).data) });
export const terbitkanReset = async (id: string, metode: string) => z.object({ data: z.object({ password_sementara: z.string(), permintaan: Request }) }).parse((await api.post(`/auth/password/requests/${id}/issue`, { metode_verifikasi: metode })).data).data;
export const tolakReset = async (id: string, alasan: string) => { await api.post(`/auth/password/requests/${id}/reject`, { alasan }); };
