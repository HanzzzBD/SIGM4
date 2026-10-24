import { BlockIdParamSchema, ImportRoomScheduleBodySchema, RoomScheduleImportResponseSchema } from "@sigm4/schemas";
import { defineRoute } from "../../shared/http/index.js";
import { z } from "zod";
const common = { permission: "reservation.fixed_schedule", rateLimitClass: "default", module: "m07-reservation-room" } as const;
export const importRoomSchedulesRoute = defineRoute({ ...common, method: "POST", path: "/room-fixed-schedules/import", summary: "Impor CSV jadwal tetap E.5.3; baris bentrok gagal tanpa pembatalan", body: ImportRoomScheduleBodySchema, response: RoomScheduleImportResponseSchema, successStatus: 202, additionalSuccessStatuses: [200] });
export const getRoomScheduleImportRoute = defineRoute({ ...common, method: "GET", path: "/room-fixed-schedules/import/:id", summary: "Status dan laporan impor jadwal tetap milik pengunggah; retensi 30 hari", params: BlockIdParamSchema, response: RoomScheduleImportResponseSchema });
export const roomScheduleImportTemplateRoute = defineRoute({ ...common, method: "GET", path: "/room-fixed-schedules/import/template", summary: "Unduh template CSV jadwal tetap beserta contoh E.5.3", response: z.string(), contentType: "text/csv" });
export const roomScheduleImportRoutes = [importRoomSchedulesRoute, getRoomScheduleImportRoute, roomScheduleImportTemplateRoute] as const;
