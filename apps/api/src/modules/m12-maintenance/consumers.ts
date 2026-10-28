import { z } from "zod";
import { WorkOrderAssignmentSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import { withTransaction } from "../../shared/db/index.js";
import type { AuthContext } from "../../shared/auth/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { EventHandlerRegistry } from "../../shared/events/index.js";
import { EVENT_KERUSAKAN_DIVERIFIKASI } from "../m11-damage-reports/index.js";
import { WorkOrderService } from "./services/work-order.service.js";

export function installWorkOrderConsumers(registry: EventHandlerRegistry, deps: { db: () => Kysely<Database>; ctx: () => AuthContext; clock: Clock; audit: AuditLogger }) {
    registry.on(EVENT_KERUSAKAN_DIVERIFIKASI, async event => {
        const p = z.object({ damage_report_id: z.number().int().positive(), status: z.string() }).parse(event.payload);
        if (p.status !== "DIVERIFIKASI") return;
        await withTransaction(deps.ctx(), async scope => {
            const ticket = await scope.tx.selectFrom("damage_reports").select(["id", "work_order_assignment", "urgensi", "deskripsi"]).where("id", "=", String(p.damage_report_id)).forUpdate().executeTakeFirstOrThrow();
            // Events committed before migration retain their manual creation path.
            if (ticket.work_order_assignment === null) return;
            const assignment = WorkOrderAssignmentSchema.parse(ticket.work_order_assignment);
            await new WorkOrderService(deps.db(), deps.clock, deps.audit).create(scope, { ...assignment, damage_report_id: p.damage_report_id, deskripsi: ticket.deskripsi, prioritas: ticket.urgensi }, true);
        }, deps.db());
    });
}
