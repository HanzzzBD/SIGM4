// Kontrak akun mandiri M-01 di klien mobile — endpoint dan bentuk respons sama dengan web (SDD-MOB-13;
// FR-01.4, FR-01.5, FR-01.2 A1). Respons diurai Zod sebelum dipakai.
import type { AxiosInstance } from "axios";
import { z } from "zod";

const Profile = z.object({ nama: z.string(), email: z.string(), telepon: z.string().nullable().optional(), role_kode: z.string(), foto_status: z.enum(["PENDING", "CLEAN", "INFECTED", "FAILED"]).nullable(), foto_url: z.string().nullable() });
export type Profile = z.infer<typeof Profile>;
export const loadProfile = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.object({ user: Profile }) }).parse((await api.get("/me", { signal })).data).data.user;
/** FR-01.4 langkah 5: email dan role tidak dikirim (BR-069). `foto` undefined = tidak diubah, null = hapus. */
export const updateProfile = async (api: AxiosInstance, nama: string, telepon: string | null, foto?: number | null) => { await api.put("/me", { nama, telepon, ...(foto === undefined ? {} : { foto_file_id: foto }) }); };

/** Unggah langsung ke object storage lewat presign; konfirmasi checksum sebelum ditautkan (SDD-FS-03). */
export async function uploadProfilePhoto(api: AxiosInstance, photo: { size: number; checksum: string; put: (url: string) => Promise<boolean> }): Promise<number> {
    const order = z.object({ data: z.object({ file_id: z.string(), upload_url: z.url() }) }).parse((await api.post("/files/presign", { jenis: "USER_PHOTO", mime: "image/jpeg", ukuran: photo.size })).data).data;
    if (!(await photo.put(order.upload_url))) throw new Error("Foto belum terunggah. Coba lagi.");
    await api.post("/files/confirm", { file_id: Number(order.file_id), checksum: photo.checksum });
    return Number(order.file_id);
}

const TwoFactor = z.object({ data: z.object({ aktif: z.boolean(), diaktifkan_pada: z.string().nullable(), sisa_kode_cadangan: z.number().int().nonnegative(), kode_cadangan_menipis: z.boolean() }) });
export const loadTwoFactor = async (api: AxiosInstance, signal: AbortSignal) => TwoFactor.parse((await api.get("/auth/2fa/status", { signal })).data).data;
/** BR-070c: kode pengganti hanya ditampilkan sekali; seluruh kode lama langsung tidak berlaku. */
export const regenerateBackupCodes = async (api: AxiosInstance) => z.object({ data: z.object({ kode_cadangan: z.array(z.string()) }) }).parse((await api.post("/auth/2fa/backup-codes/regenerate")).data).data.kode_cadangan;

const DeviceSession = z.object({ id: z.string(), platform: z.string(), ip: z.string().nullable(), user_agent: z.string().nullable(), dibuat_pada: z.string(), terakhir_diperbarui: z.string(), berlaku_sampai: z.string(), saat_ini: z.boolean() });
export type DeviceSession = z.infer<typeof DeviceSession>;
/** P-79 Perangkat Terhubung (FR-01.2 A1). */
export const loadSessions = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(DeviceSession) }).parse((await api.get("/auth/sessions", { signal })).data).data;
export const revokeSession = async (api: AxiosInstance, id: string) => { await api.delete(`/auth/sessions/${encodeURIComponent(id)}`); };
export const logoutAll = async (api: AxiosInstance) => { await api.post("/auth/logout-all"); };
