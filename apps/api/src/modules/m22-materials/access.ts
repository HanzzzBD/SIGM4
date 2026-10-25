import type { AuthContext } from "../../shared/auth/index.js";
import { DomainError } from "../../shared/errors/index.js";
export const materialInvalid = (message: string, field = "status") => new DomainError("VALIDATION_ERROR", message, { errors: [{ field, message }] });
export const materialWibDate = (time: Date) => new Date(time.getTime() + 7 * 3600000).toISOString().slice(0, 10);
export const allMaterialRequests = (ctx: AuthContext) => ["material.manage", "material.issue", "approval.view", "approval.view_history"].some(p => ctx.can(p) && ctx.scopeOf(p) === "all");
export interface MaterialItemSnapshot { nama: string; lokasi: string; satuan: string; category_id: string; }
