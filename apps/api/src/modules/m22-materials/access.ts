import type { AuthContext } from "../../shared/auth/index.js";
import { DomainError } from "../../shared/errors/index.js";
export const materialInvalid = (message: string, field = "status") => new DomainError("VALIDATION_ERROR", message, { errors: [{ field, message }] });
export const materialWibDate = (time: Date) => new Date(time.getTime() + 7 * 3600000).toISOString().slice(0, 10);
/** BR-091a: Siswa/OSIS memegang `material.view` berscope restricted — katalog bertanda, saldo sebagai status saja. */
export const studentMaterialScope = (ctx: AuthContext) => ctx.can("material.view") && ctx.scopeOf("material.view") === "restricted";
/** BR-091a: Habis (0) · Terbatas (> 0 dan ≤ stok minimum) · Tersedia. */
export const stockStatus = (saldo: number, minimum: number): "TERSEDIA" | "TERBATAS" | "HABIS" => saldo <= 0 ? "HABIS" : minimum > 0 && saldo <= minimum ? "TERBATAS" : "TERSEDIA";
export const allMaterialRequests = (ctx: AuthContext) => ["material.manage", "material.issue", "approval.view", "approval.view_history"].some(p => ctx.can(p) && ctx.scopeOf(p) === "all");
export interface MaterialItemSnapshot { nama: string; lokasi: string; satuan: string; category_id: string; }
