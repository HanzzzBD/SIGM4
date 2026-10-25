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
