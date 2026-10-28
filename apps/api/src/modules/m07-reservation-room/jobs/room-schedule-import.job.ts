import { z } from "zod";
import type { Kysely } from "kysely";
import { createAuthContext } from "../../../shared/auth/index.js";
import type { EffectivePermissions } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import type { RoomScheduleImportService } from "../services/room-schedule-import.service.js";

export const ROOM_SCHEDULE_IMPORT_JOB = "room-schedule-import";
export const roomScheduleImportQueueId = (id: string | number) => `room-schedule-import-${id}`;
const Payload = z.object({ job_id: z.coerce.number().int().positive(), oleh: z.number().int().positive() });
export class RoomScheduleImportRunner {
    constructor(private readonly db: Kysely<Database>, private readonly permissions: { load(id: number): Promise<EffectivePermissions | undefined> }, private readonly service: RoomScheduleImportService) {}
    async run(data: unknown, last: boolean): Promise<void> {
        const { job_id: id, oleh: userId } = Payload.parse(data);
        const effective = await this.permissions.load(userId);
        const user = await this.db.selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id").select(["u.status", "r.kode as roleCode"]).where("u.id", "=", String(userId)).executeTakeFirst();
        if (user === undefined) throw new Error("Pengunggah impor jadwal tetap tidak ditemukan.");
        const ctx = createAuthContext({ userId, roleCode: user.roleCode, scopes: effective?.scopes ?? new Map() });
        if (user?.status !== "AKTIF" || !ctx.can("reservation.fixed_schedule")) {
            await this.service.fail(ctx, id, "Pengunggah tidak lagi berwenang mengimpor jadwal tetap.");
            return;
        }
        try { await this.service.run(ctx, id); }
        catch (error) {
            if (last) await this.service.fail(ctx, id, "Pemrosesan impor jadwal tetap berhenti karena kesalahan sistem.");
            throw error;
        }
    }
}
