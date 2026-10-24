import { DamageReportCreateSchema, DamageReportCreatedResponseSchema, DamageReportNoteCreateSchema, DamageReportNoteResponseSchema, DamageReportOpenResponseSchema } from "@sigm4/schemas";
import type { DamageReportOpen } from "@sigm4/schemas";
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { MobileApiError } from "../../shared/api/client";
import type { NewUpload, UploadQueue } from "../../shared/upload/queue";

export type DamageObject = { kind: "ASET" | "RUANGAN"; id: string; label: string };
export type Photo = Pick<NewUpload, "id" | "path" | "checksum" | "size" | "createdAt">;
export const urgencyLabels = { RENDAH: "Rendah", SEDANG: "Sedang", TINGGI: "Tinggi", KRITIS: "Kritis" } as const;
export const statusLabels = { DILAPORKAN: "Dilaporkan", DIVERIFIKASI: "Diverifikasi", DALAM_PERBAIKAN: "Dalam Perbaikan", SELESAI: "Selesai", DITOLAK: "Ditolak" } as const;
export function readablePhotoUrl(photo: { status: string; url: string | null }, development = false): string | null {
    if (photo.status !== "CLEAN" || !photo.url) return null;
    try { const parsed = new URL(photo.url); return (parsed.protocol === "https:" || (development && parsed.protocol === "http:")) && !parsed.username && !parsed.password ? photo.url : null; } catch { return null; }
}
export const objectParams = (object: DamageObject) => ({ [object.kind === "ASET" ? "asset_id" : "room_id"]: Number(z.string().regex(/^[1-9]\d*$/).parse(object.id)) });
export async function openReport(api: AxiosInstance, object: DamageObject, signal: AbortSignal): Promise<DamageReportOpen | null> {
    return DamageReportOpenResponseSchema.parse((await api.get("/damage-reports/open", { params: objectParams(object), signal })).data).data;
}
export interface SubmissionInput { object: DamageObject; description: string; urgency: keyof typeof urgencyLabels; existingId: string | null; photos: readonly Photo[] }
export interface SubmissionResult { reportId: string; number: string | null; note: boolean; pending: number; queueWarning: boolean }
/** Tidak ada retry transaksi otomatis: API M-11 belum mendukung idempotency key. */
export class DamageSubmission {
    private busy = false;
    private unknownResult = false;
    private completed: SubmissionResult | null = null;
    private readonly staged = new Map<string, string>();
    constructor(private readonly api: AxiosInstance, private readonly queue: UploadQueue, private readonly account: string, private readonly currentAccount: () => string | null) {}
    get uncertain() { return this.unknownResult; }
    hasStaged(photoId: string) { return this.staged.has(photoId); }
    async send(input: SubmissionInput, signal: AbortSignal): Promise<SubmissionResult> {
        const guard = () => { if (signal.aborted || this.currentAccount() !== this.account) throw new Error("Sesi berubah atau pengiriman dibatalkan."); };
        guard();
        if (this.completed) return this.completed;
        if (this.busy) throw new Error("Laporan sedang dikirim.");
        if (this.unknownResult) throw new Error("Hasil pengiriman belum pasti. Periksa tiket sebelum mengirim informasi lagi.");
        if (input.photos.length > 5 || (!input.existingId && input.photos.length < 1)) throw new Error("Laporan baru memerlukan 1 sampai 5 foto; catatan paling banyak 5 foto.");
        if (new Set(input.photos.map((photo) => photo.id)).size !== input.photos.length) throw new Error("Foto tidak boleh berulang.");
        // Validasi seluruh isian sebelum memesan berkas (BR-044).
        if (input.existingId) { z.string().regex(/^[1-9]\d*$/).parse(input.existingId); DamageReportNoteCreateSchema.parse({ keterangan: input.description, foto_file_ids: [] }); }
        else DamageReportCreateSchema.parse({ ...objectParams(input.object), deskripsi: input.description, urgensi: input.urgency, foto_file_ids: input.photos.map((_photo, index) => index + 1) });
        this.busy = true;
        try {
            const fileIds: number[] = [];
            for (const photo of input.photos) {
                guard(); let fileId = this.staged.get(photo.id);
                if (!fileId) {
                    const order = z.object({ file_id: z.string().regex(/^[1-9]\d*$/) }).parse((await this.api.post("/files/presign", { jenis: "DAMAGE_PHOTO", mime: "image/jpeg", ukuran: photo.size }, { signal })).data.data);
                    guard(); fileId = order.file_id;
                    // Byte + metadata disimpan SEBELUM POST bisnis; URL/token/isian tidak masuk SQLite.
                    await this.queue.enqueue({ ...photo, accountId: this.account, ownerType: "DAMAGE_PHOTO", ownerId: null, fileId });
                    this.staged.set(photo.id, fileId);
                }
                fileIds.push(Number(fileId));
            }
            guard(); this.unknownResult = true;
            let result: SubmissionResult;
            if (input.existingId) {
                const body = DamageReportNoteCreateSchema.parse({ keterangan: input.description, foto_file_ids: fileIds });
                const note = DamageReportNoteResponseSchema.parse((await this.api.post(`/damage-reports/${input.existingId}/notes`, body, { signal })).data).data;
                result = { reportId: input.existingId, number: null, note: true, pending: note.foto.filter((photo) => photo.status === "BELUM_TERUNGGAH").length, queueWarning: false };
            } else {
                const body = DamageReportCreateSchema.parse({ ...objectParams(input.object), deskripsi: input.description, urgensi: input.urgency, foto_file_ids: fileIds });
                const ticket = DamageReportCreatedResponseSchema.parse((await this.api.post("/damage-reports", body, { signal })).data).data;
                result = { reportId: ticket.id, number: ticket.nomor, note: false, pending: ticket.foto_tertunda, queueWarning: false };
            }
            // Respons sukses sudah membuktikan transaksi; gagalnya metadata lokal tidak boleh memicu POST ulang.
            this.completed = result; this.unknownResult = false;
            for (const photo of input.photos) try { await this.queue.setOwner(photo.id, this.account, result.reportId); } catch { result.queueWarning = true; }
            guard(); return result;
        } catch (error) {
            if (error instanceof MobileApiError && ((error.status >= 400 && error.status < 500 && error.status !== 408) || error.code === "OFFLINE")) this.unknownResult = false;
            throw error;
        } finally { this.busy = false; }
    }
}
