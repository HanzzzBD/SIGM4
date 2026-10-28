import { z } from "zod";
import type { AxiosInstance } from "axios";
import { MobileApiError } from "../../shared/api/client";
import { StocktakeScanResponseSchema } from "@sigm4/schemas";
import type { StocktakeQueue, PendingInspection } from "./queue";
const Presign = z.object({ data: z.object({ file_id: z.string(), upload_url: z.url().refine(url => ["https:", "http:"].includes(new URL(url).protocol)) }) });
export function createStocktakeSender(api: AxiosInstance, queue: StocktakeQueue, currentAccount: () => string | null, put: (url: string, path: string, signal: AbortSignal) => Promise<boolean>) {
    return async (entry: PendingInspection, signal: AbortSignal) => {
        const guard = () => { if (signal.aborted || currentAccount() !== entry.accountId) throw new Error("Sesi akun berubah."); }; guard();
        for (const photo of entry.photos) {
            if (!photo.fileId) { const p = Presign.parse((await api.post("/files/presign", { jenis: "STOCKTAKE_PHOTO", mime: "image/jpeg", ukuran: photo.size }, { signal })).data); guard(); photo.fileId = p.data.file_id; await queue.save(entry); }
        }
        entry.body["foto_file_ids"] = entry.photos.map(p => Number(p.fileId)); await queue.save(entry); guard();
        const response = StocktakeScanResponseSchema.parse((await api.post(`/audit-sessions/${entry.sessionId}/${entry.kind==="material"?"material-counts":entry.kind === "scan" ? "scan" : "findings"}`, entry.body, { signal, headers: { "Idempotency-Key": entry.id } })).data).data; guard();
        if (response.duplicate) return { duplicate: true };
        for (const photo of entry.photos) {
            let confirmed = false;
            try { await api.post("/files/confirm", { file_id: Number(photo.fileId), checksum: photo.checksum }, { signal }); confirmed = true; }
            catch (error) { if (!(error instanceof MobileApiError && error.status === 422 && error.details.some(d => d.field === "file_id"))) throw error; }
            guard();
            if (!confirmed) {
                const p = Presign.parse((await api.post(`/files/${photo.fileId}/presign`, undefined, { signal })).data).data;
                if (p.file_id !== photo.fileId) throw new Error("Pesanan foto berubah.");
                if (!await put(p.upload_url, photo.path, signal)) throw new Error("Foto belum terunggah."); guard();
                await api.post("/files/confirm", { file_id: Number(photo.fileId), checksum: photo.checksum }, { signal }); guard();
            }
        }
        return { duplicate: false };
    };
}
