import type { TransactionScope } from "../../../shared/db/index.js";
import { DomainError,ForbiddenError } from "../../../shared/errors/index.js";
/** Permukaan baca khusus M-05: satu target satu jenis Bahan, tanpa kode/unit aset. */
export async function materialQrTargets(scope:TransactionScope,ids:readonly number[]){if(!scope.ctx.can("material.qr_print"))throw new ForbiddenError();const rows=await scope.tx.selectFrom("materials").select(["id","uuid","nama"]).where("id","in",ids.map(String)).execute();if(rows.length!==ids.length)throw new DomainError("VALIDATION_ERROR","Sebagian bahan tidak ditemukan.");return ids.map(id=>rows.find(row=>row.id===String(id))!);}
