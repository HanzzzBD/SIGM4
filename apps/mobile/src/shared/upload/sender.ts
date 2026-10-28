import type { AxiosInstance } from "axios";
import { z } from "zod";
import { MobileApiError } from "../api/client";
import type { UploadQueue, UploadEntry } from "./queue";
const PresignSchema = z.object({ file_id: z.string(), upload_url: z.url().refine((v) => ["https:", "http:"].includes(new URL(v).protocol)) });
export function createUploadSender(api: AxiosInstance, queue: UploadQueue, currentAccount: () => string | null, progress: (id: string, message: string) => void, put: (url: string, path: string, signal: AbortSignal) => Promise<boolean>) {
    return async (entry: UploadEntry, signal: AbortSignal) => {
        const guard = () => { if (signal.aborted || currentAccount() !== entry.accountId) throw new Error("Sesi berubah atau unggahan dibatalkan."); };
        guard();
        // PR-05-34: DAMAGE_PHOTO dipersistensi sebelum POST tiket agar crash tidak membuang byte.
        // Konfirmasi tetap menguji kepemilikan file_id server; jenis lain menuntut transaksi tertaut.
        let fileId=entry.fileId;
        if((fileId===null&&entry.ownerType!=="WORK_ORDER_PHOTO")||(entry.ownerId===null&&entry.ownerType!=="DAMAGE_PHOTO"))throw new Error("Foto belum ditautkan ke transaksi server.");
        if(fileId===null){progress(entry.id,"Menyiapkan unggahan foto hasil");const order=PresignSchema.parse((await api.post("/files/presign",{jenis:"WORK_ORDER_PHOTO",mime:"image/jpeg",ukuran:entry.size},{signal})).data.data);guard();fileId=order.file_id;await queue.setFileId(entry.id,entry.accountId,fileId);guard();}
        const link=async()=>{if(entry.ownerType==="WORK_ORDER_PHOTO"){guard();progress(entry.id,"Menautkan foto hasil ke work order");await api.post(`/work-orders/${entry.ownerId}/photos`,{foto_file_ids:[Number(fileId)]},{signal,headers:{"Idempotency-Key":entry.id}});guard();}};
        if (fileId) {
            // Confirm idempoten menutup kasus respons hilang setelah commit, tanpa menimpa berkas CLEAN.
            let confirmed=false;
            try { await api.post("/files/confirm", { file_id: Number(fileId), checksum: entry.checksum }, { signal }); guard();confirmed=true; }
            catch (error) { if (!(error instanceof MobileApiError && error.status === 422 && error.details.some((d) => d.field === "file_id"))) throw error; }
            if(confirmed){await link();return;}
        }
        guard(); progress(entry.id, "Menyiapkan unggahan");
        const order = PresignSchema.parse((await api.post(`/files/${fileId}/presign`, undefined, { signal })).data.data);
        if(order.file_id!==fileId)throw new Error("Pesanan unggahan tidak sesuai berkas antrean.");
        guard(); await queue.setFileId(entry.id, entry.accountId, order.file_id);
        progress(entry.id, "Mengunggah foto");
        const uploaded = await put(order.upload_url, entry.path, signal);
        if (!uploaded) throw new Error("Foto belum terunggah. Akan dicoba ulang.");
        guard(); progress(entry.id, "Mengonfirmasi foto");
        await api.post("/files/confirm", { file_id: Number(order.file_id), checksum: entry.checksum }, { signal });
        guard();
        await link();
    };
}
