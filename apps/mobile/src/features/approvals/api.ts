import type { AxiosInstance } from "axios";
import { HistoryResponseSchema, ListPendingResponseSchema, ReservationDetailResponseSchema, RoomAvailabilityResponseSchema, RENTANG_KETERSEDIAAN_MAKS_HARI } from "@sigm4/schemas";
import type { ApprovalPending, ReservationDetail } from "@sigm4/schemas";
import { ProcurementDetailResponseSchema } from "@sigm4/schemas";
import type { ProcurementDetail } from "@sigm4/schemas";
import type { ApprovalReview, AvailabilityReview } from "./model";

export async function findPending(api: AxiosInstance, id: number, signal: AbortSignal): Promise<ApprovalPending | null> {
    let page = 1;
    while (!signal.aborted) {
        const response = ListPendingResponseSchema.parse((await api.get("/approvals/pending", { params: { page, per_page: 100 }, signal })).data);
        const match = response.data.find((item) => item.instance_id === id); if (match) return match;
        if (page++ >= response.meta.total_pages) return null;
    }
    throw new Error("Permintaan dibatalkan.");
}
async function availability(api: AxiosInstance, room: ReservationDetail, signal: AbortSignal): Promise<AvailabilityReview> {
    if (!room.ruangan) throw new Error("Ruangan pengajuan belum tersedia.");
    const dates = room.tanggal.length ? room.tanggal.filter((date) => date.status === "MENUNGGU_PERSETUJUAN").map((date) => ({ id: date.id, start: date.waktu_mulai, end: date.waktu_selesai })) : [{ id: room.id, start: room.waktu_mulai, end: room.waktu_selesai }];
    if (dates.length === 0) throw new Error("Tidak ada tanggal yang masih menunggu persetujuan.");
    const earliest = Math.min(...dates.map((date) => Date.parse(date.start))); const latest = Math.max(...dates.map((date) => Date.parse(date.end)));
    const own = new Set([room.id, ...dates.map((date) => date.id)]);
    const results = dates.map((date) => ({ start: date.start, end: date.end, held: false, conflicts: new Set<string>(), closed: false }));
    let listed = true;
    for (let from = earliest; from < latest;) {
        const to = Math.min(latest, from + RENTANG_KETERSEDIAAN_MAKS_HARI * 86_400_000);
        const response = RoomAvailabilityResponseSchema.parse((await api.get("/rooms/availability", { params: { dari: new Date(from).toISOString(), sampai: new Date(to).toISOString() }, signal })).data).data;
        listed &&= response.ruangan.some((resource) => resource.id === room.ruangan!.id);
        for (const date of results) {
            const start = Date.parse(date.start); const end = Date.parse(date.end);
            if (start >= to || end <= from) continue;
            const slots = response.slot.filter((slot) => slot.ruangan_id === room.ruangan!.id && Date.parse(slot.mulai) < end && Date.parse(slot.selesai) > start);
            date.held ||= slots.some((slot) => slot.reservasi && own.has(slot.reservasi.id) && Date.parse(slot.mulai) <= start && Date.parse(slot.selesai) >= end);
            for (const slot of slots) if (!slot.reservasi || !own.has(slot.reservasi.id)) date.conflicts.add(`${slot.mulai}:${slot.selesai}:${slot.keadaan}`);
            const local = new Date(start + 7 * 3_600_000); const isoDay = local.getUTCDay() || 7; const day = local.toISOString().slice(0, 10);
            const clock = local.toISOString().slice(11, 16); const endClock = new Date(end + 7 * 3_600_000).toISOString().slice(11, 16);
            date.closed ||= !response.jam_operasional.hari.includes(isoDay) || response.hari_libur.some((holiday) => holiday.tanggal === day) || clock < response.jam_operasional.mulai || endClock > response.jam_operasional.selesai;
        }
        from = to;
    }
    return { resourceListed: listed, dates: results.map((date) => ({ ...date, conflicts: date.conflicts.size })) };
}
export async function loadReview(api: AxiosInstance, id: number, permissions: Readonly<Record<string, string>>, signal: AbortSignal): Promise<ApprovalReview> {
    const history = HistoryResponseSchema.parse((await api.get(`/approvals/${id}/history`, { signal })).data).data;
    if (history.instance_id !== id) throw new Error("Linimasa tidak cocok dengan pengajuan yang diminta.");
    const pending = Object.hasOwn(permissions, "approval.decide") ? await findPending(api, id, signal) : null;
    if (history.jenis_pengajuan === "PENGADAAN_BARANG") {
        let procurement: ProcurementDetail | null = null, contextError: string | null = null;
        try {
            const path = pending && Object.hasOwn(permissions, "procurement.approve") ? `/procurements/${history.referensi_id}/review` : `/procurements/${history.referensi_id}`;
            procurement = ProcurementDetailResponseSchema.parse((await api.get(path, { signal })).data).data;
        } catch (error) { if (signal.aborted) throw error; contextError = error instanceof Error ? error.message : "Rincian pengadaan belum dapat dimuat."; }
        return { history, pending, procurement, room: null, availability: null, contextError, requesterContextComplete: procurement !== null };
    }
    let room: ReservationDetail | null = null; let currentAvailability: AvailabilityReview | null = null; let contextError: string | null = null;
    if (history.jenis_pengajuan === "RESERVASI_RUANGAN" && Object.hasOwn(permissions, "reservation.view")) {
        try { room = ReservationDetailResponseSchema.parse((await api.get(`/reservations/${history.referensi_id}`, { signal })).data).data; currentAvailability = await availability(api, room, signal); }
        catch (error) { if (signal.aborted) throw error; contextError = error instanceof Error ? error.message : "Rincian/ketersediaan pengajuan belum dapat dimuat."; }
    } else if (history.jenis_pengajuan === "RESERVASI_RUANGAN") contextError = "Izin melihat rincian reservasi belum tersedia pada akun Anda.";
    // API role/riwayat pemohon belum tersedia. Jangan menganggap histori kosong/utang nol.
    return { history, pending, room, availability: currentAvailability, contextError, requesterContextComplete: false };
}
