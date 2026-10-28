import type { StatusTone } from "../../shared/ui/status";
import { DecideBodySchema, ProcurementPartialSchema, LABEL_JENIS_PENGAJUAN, LABEL_STATUS_INSTANCE_APPROVAL } from "@sigm4/schemas";
import type { DisposalDetail, ProcurementDetail } from "@sigm4/schemas";
import type { ApprovalDecision, ApprovalDecisionResult, ApprovalPending, LinimasaPersetujuan, ReservationDetail } from "@sigm4/schemas";
import { MobileApiError } from "../../shared/api/client";

export interface AvailabilityReview { resourceListed: boolean; dates: readonly { start: string; end: string; held: boolean; conflicts: number; closed: boolean }[] }
export interface ApprovalReview {
    history: LinimasaPersetujuan;
    pending: ApprovalPending | null;
    room: ReservationDetail | null;
    availability: AvailabilityReview | null;
    contextError: string | null;
    requesterContextComplete: boolean;
    procurement?: ProcurementDetail | null;
    disposal?: DisposalDetail | null;
}
export function decisionBlockers(review: ApprovalReview, permissions: Readonly<Record<string, string>>): string[] {
    const reasons: string[] = [];
    if (!Object.hasOwn(permissions, "approval.decide")) reasons.push("Anda tidak memiliki izin memutus persetujuan.");
    if (review.history.status !== "MENUNGGU") reasons.push("Pengajuan sudah tidak menunggu keputusan.");
    const item = review.pending;
    if (!item || item.instance_id !== review.history.instance_id || item.urutan !== review.history.langkah_aktif || item.jenis_pengajuan !== review.history.jenis_pengajuan || item.referensi_id !== review.history.referensi_id || item.pemohon.id !== review.history.pemohon.id || !review.history.langkah.some((step) => step.urutan === item.urutan && step.status === "AKTIF")) reasons.push("Langkah ini tidak lagi berada pada kewenangan Anda. Muat ulang untuk memeriksa antrean.");
    if (review.history.jenis_pengajuan === "PENGHAPUSAN_ASET") {
        const d = review.disposal;
        if (!d || d.id !== String(review.history.referensi_id) || d.approval_instance_id !== String(review.history.instance_id) || Number(d.pengusul_id) !== review.history.pemohon.id || d.status !== "MENUNGGU_PERSETUJUAN") reasons.push("Rincian penghapusan tidak cocok dengan pengajuan aktif. Muat ulang konteks.");
        if (review.contextError) reasons.push(review.contextError);
        return reasons;
    }
    if (review.history.jenis_pengajuan === "PENGADAAN_BARANG") {
        if (!Object.hasOwn(permissions, "procurement.approve")) reasons.push("Anda tidak memiliki izin menyetujui pengadaan.");
        const proposal = review.procurement;
        if (!proposal || proposal.id !== String(review.history.referensi_id) || proposal.approval_instance_id !== review.history.instance_id || Number(proposal.pengusul.id) !== review.history.pemohon.id || proposal.status !== "MENUNGGU_PERSETUJUAN") reasons.push("Rincian pengadaan tidak cocok dengan langkah yang menunggu. Muat ulang.");
        if (review.contextError) reasons.push(review.contextError);
        return reasons;
    }
    if (review.history.jenis_pengajuan !== "RESERVASI_RUANGAN" || !review.room) reasons.push("Rincian objek untuk jenis pengajuan ini belum tersedia.");
    else if (review.room.jenis !== "RUANGAN" || review.room.id !== String(review.history.referensi_id) || review.room.approval_instance_id !== review.history.instance_id || Number(review.room.pemohon.id) !== review.history.pemohon.id || review.room.status !== "MENUNGGU_PERSETUJUAN") reasons.push("Rincian objek tidak lagi cocok dengan pengajuan yang menunggu. Muat ulang.");
    if (!review.availability) reasons.push("Ketersediaan objek belum berhasil diperiksa.");
    else if (!review.availability.resourceListed || review.availability.dates.length === 0) reasons.push("Ketersediaan ruangan pengajuan belum lengkap.");
    if (!review.requesterContextComplete) reasons.push("Role pemohon serta riwayat keterlambatan dan kewajiban belum tersedia. Keputusan menunggu seluruh konteks wajib tersedia.");
    if (review.contextError) reasons.push(review.contextError);
    return reasons;
}
export function procurementDecision(proposal: ProcurementDetail, urutan: number, keputusan: ApprovalDecision["keputusan"], catatan: string, quantities?: Readonly<Record<string, string>>): ApprovalDecision {
    if (!catatan.trim()) throw new Error("Catatan keputusan pengadaan wajib diisi.");
    if (keputusan === "DISETUJUI" && proposal.lampiran.some(file => file.status !== "CLEAN" || !file.url)) throw new Error("Lampiran harus selesai diperiksa sebelum disetujui.");
    const parsed = quantities ? ProcurementPartialSchema.safeParse({ items: proposal.items.map(item => ({ item_id: Number(item.id), jumlah_disetujui: Number(quantities[item.id]) })) }) : undefined;
    if (parsed && !parsed.success) throw new Error("Isi jumlah setiap item dengan bilangan bulat nol atau positif dalam batas persetujuan sebelumnya.");
    const rincian = parsed?.success ? parsed.data : undefined;
    if (rincian && (rincian.items.every(item => item.jumlah_disetujui === 0) || rincian.items.some((item, index) => !quantities![String(item.item_id)]?.trim() || item.jumlah_disetujui > (proposal.items[index]!.jumlah_disetujui ?? proposal.items[index]!.jumlah_diusulkan)))) throw new Error("Jumlah harus tetap atau berkurang, dan minimal satu item disetujui.");
    return { urutan, keputusan, catatan: catatan.trim(), ...(rincian ? { rincian_keputusan: rincian } : {}) };
}
/** MS-54 (keputusan 20): penyetujuan akhir hanya Pimpinan (R-03 + disposal.approve); lampiran wajib CLEAN. Tolak/revisi selalu boleh. */
export function disposalApproveBlocker(d: Pick<DisposalDetail, "lampiran">, finalStep: boolean, u: { role_kode: string }, p: Readonly<Record<string, string>>): string | null {
    if (d.lampiran.some((f) => f.status !== "CLEAN")) return "Persetujuan menunggu seluruh lampiran terverifikasi.";
    if (finalStep && !(u.role_kode === "R-03" && Object.hasOwn(p, "disposal.approve"))) return "Keputusan akhir penghapusan memerlukan Pimpinan. Anda dapat menolak atau meminta revisi.";
    return null;
}
export const isFinalStep = (steps: readonly { urutan: number; status: string }[], current: number) => !steps.some((s) => s.urutan > current && s.status === "BELUM_AKTIF");
export function disposalDecision(d: Pick<DisposalDetail, "items">, urutan: number, keputusan: "DISETUJUI" | "DITOLAK" | "PERLU_REVISI", catatan: string, approved?: readonly string[]) {
    if (!catatan.trim()) throw new Error("Catatan keputusan penghapusan wajib diisi.");
    if (approved && !approved.length) throw new Error("Pilih minimal satu aset, atau gunakan Tolak.");
    return { urutan, keputusan, catatan: catatan.trim(), ...(approved ? { rincian_keputusan: { items: d.items.map((i) => ({ item_id: Number(i.id), disetujui: approved.includes(i.id), keterangan: catatan.trim() })) } } : {}) };
}
export function approvalConflict(error: unknown): { name: string; at: string | null } | null {
    if (!(error instanceof MobileApiError) || error.code !== "APPROVAL_ALREADY_DECIDED") return null;
    return { name: error.details.find((entry) => entry.field === "diputuskan_oleh")?.message ?? "approver lain", at: error.details.find((entry) => entry.field === "diputuskan_pada")?.message ?? null };
}
/** Badge SLA C-13: terlampaui galat, berjalan informasi, belum ada menunggu (FOUNDATIONS §1.8). */
export function slaTone(sla: { terlambat: boolean } | null): StatusTone { return !sla ? "pending" : sla.terlambat ? "error" : "info"; }
export function slaLabel(sla: { sisa_menit_kerja: number; terlambat: boolean } | null) {
    if (!sla) return "Tenggat belum tersedia";
    if (sla.terlambat) return "Melewati SLA";
    const hours = Math.floor(sla.sisa_menit_kerja / 60);
    return hours >= 1 ? `Sisa ${hours} jam kerja` : `Sisa ${sla.sisa_menit_kerja} menit kerja`;
}
export interface DecisionPort {
    authorize(signal: AbortSignal): Promise<void>;
    post(body: ApprovalDecision, key: string, signal: AbortSignal): Promise<ApprovalDecisionResult>;
}
/** Satu niat/satu key, hanya di memori; retry manual mempertahankan body+key saat hasil belum pasti. */
export class DecisionAttempt {
    private operation: { body: ApprovalDecision; key: string } | null = null;
    private busy = false;
    constructor(private readonly port: DecisionPort, private readonly key: () => string) {}
    get uncertain() { return this.operation !== null; }
    get body() { return this.operation ? { ...this.operation.body } : null; }
    async send(input: ApprovalDecision, signal: AbortSignal): Promise<ApprovalDecisionResult> {
        if (signal.aborted) throw new Error("Permintaan dibatalkan.");
        if (this.busy) throw new Error("Keputusan sedang dikirim. Tunggu sampai selesai.");
        const body = DecideBodySchema.parse({ ...input, catatan: input.catatan?.trim() || null });
        if (body.keputusan !== "DISETUJUI" && !body.catatan) throw new Error(body.keputusan === "DITOLAK" ? "Alasan penolakan wajib diisi." : "Catatan revisi wajib diisi.");
        if (this.operation && JSON.stringify(this.operation.body) !== JSON.stringify(body)) throw new Error("Hasil keputusan sebelumnya belum pasti. Periksa hasil dengan isi yang sama sebelum mengubah keputusan.");
        this.busy = true;
        try {
            if (!this.operation) {
                await this.port.authorize(signal);
                if (signal.aborted) throw new Error("Permintaan dibatalkan.");
                this.operation = { body, key: this.key() };
            }
            const result = await this.port.post(this.operation.body, this.operation.key, signal);
            if (signal.aborted) throw new Error("Permintaan dibatalkan.");
            this.operation = null; return result;
        } catch (error) {
            if (error instanceof MobileApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429 && error.code !== "REQUEST_IN_PROGRESS") this.operation = null;
            throw error;
        } finally { this.busy = false; }
    }
}

/** Label tampilan bukan kode enum (NFR-AC-09). */
/** Nada status instance/langkah persetujuan (FOUNDATIONS §1.8): menunggu dan belum aktif berikon garis putus. */
export function approvalTone(code: string): StatusTone {
    return code === "DISETUJUI" ? "success" : code === "DITOLAK" ? "error" : code === "PERLU_REVISI" ? "warning" : code === "AKTIF" ? "info" : "pending";
}
export function approvalLabel(code: string): string {
    const labels: Readonly<Record<string, string>> = { ...LABEL_JENIS_PENGAJUAN, ...LABEL_STATUS_INSTANCE_APPROVAL, DILEWATI: "Dilewati", AKTIF: "Aktif", BELUM_AKTIF: "Belum Aktif", TIDAK_DIJALANKAN: "Tidak Dijalankan" };
    return labels[code] ?? code.toLowerCase().replaceAll("_", " ");
}
