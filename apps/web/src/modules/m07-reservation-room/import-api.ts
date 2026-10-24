import { queryOptions } from "@tanstack/react-query";
import { ROOM_SCHEDULE_IMPORT_COLUMNS, ROOM_SCHEDULE_IMPORT_MAX_BYTES, RoomScheduleImportResponseSchema } from "@sigm4/schemas";
import type { RoomScheduleImportJob } from "@sigm4/schemas";
import { api } from "../../shared/api";
export const scheduleImportKey = (account: string, id: string | null) => ["rooms", "schedule-import", account, id] as const;
export const runningScheduleImport = (j?: RoomScheduleImportJob) => j?.status === "MENUNGGU" || j?.status === "BERJALAN";
export class ScheduleImportInputError extends Error {}
export function scheduleImportQuery(account: string, id: string | null) {
    return queryOptions({ queryKey: scheduleImportKey(account, id), enabled: id !== null, gcTime: 0, staleTime: 0,
        queryFn: async () => RoomScheduleImportResponseSchema.parse((await api.get(`/room-fixed-schedules/import/${id}`)).data).data,
        refetchInterval: q => runningScheduleImport(q.state.data) ? 1500 : false });
}
export async function uploadRoomSchedules(file: File) {
    if (!/\.csv$/i.test(file.name) || file.size > ROOM_SCHEDULE_IMPORT_MAX_BYTES || file.size === 0) throw new ScheduleImportInputError("Pilih CSV berisi data, maksimal 6 MB.");
    const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new ScheduleImportInputError("Berkas tidak dapat dibaca."));
        reader.onabort = () => reject(new ScheduleImportInputError("Pembacaan berkas dibatalkan. Pilih berkas kembali."));
        reader.readAsDataURL(file);
    });
    return RoomScheduleImportResponseSchema.parse((await api.post("/room-fixed-schedules/import", { filename: file.name, content_base64: content })).data);
}
export function saveScheduleCsv(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadScheduleTemplate() {
    const response = await api.get<Blob>("/room-fixed-schedules/import/template", { responseType: "blob" });
    saveScheduleCsv(response.data, "template_jadwal_tetap.csv");
}
const cell = (v: string | number) => { const s = String(v); return `"${(/^\s*[=+\-@]/.test(s) ? "'" + s : s).replaceAll('"', '""')}"`; };
export function scheduleFailureCsv(job: RoomScheduleImportJob, correction: boolean) {
    const rows = correction
        ? [[...ROOM_SCHEDULE_IMPORT_COLUMNS], ...job.laporan_gagal.map(r => ROOM_SCHEDULE_IMPORT_COLUMNS.map(c => r.data[c] ?? ""))]
        : [["baris", "kode_ruangan", "alasan"], ...job.laporan_gagal.map(r => [r.baris, r.kode_ruangan ?? "", r.pesan])];
    return "\uFEFF" + rows.map(r => r.map(cell).join(",")).join("\r\n");
}
