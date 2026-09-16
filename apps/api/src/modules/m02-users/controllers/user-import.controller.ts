// Controller impor massal pengguna (FR-02.1 A4). Validasi skema (SDD-API-01),
// lalu delegasi ke UserImportService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { ImportUsersBodySchema } from "../schemas/user-import.schema.js";
import type { UserImportService } from "../services/user-import.service.js";

export function importUsersHandler(service: UserImportService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = ImportUsersBodySchema.parse(req.body);
        const hasil = await service.import(ctx, {
            filename: body.filename,
            contentBase64: body.content_base64,
        });
        res.status(200).json({ success: true, data: hasil, meta: null });
    };
}
