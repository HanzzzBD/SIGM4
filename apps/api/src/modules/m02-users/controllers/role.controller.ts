// Controller role/permission: validasi skema (SDD-API-01), lalu delegasi ke RoleService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { RoleIdParamSchema, UpdateRolePermissionsBodySchema } from "../schemas/role.schema.js";
import type { RoleSummary } from "../services/role.service.js";
import type { RoleService } from "../services/role.service.js";

function keRole(r: RoleSummary) {
    return {
        id: r.id,
        kode: r.kode,
        nama: r.nama,
        deskripsi: r.deskripsi,
        is_system: r.is_system,
        role_version: r.role_version,
        jumlah_pengguna: r.jumlahPengguna,
        permissions: r.permissions,
    };
}

export function listRolesHandler(service: RoleService): RequestHandler {
    return async (_req, res) => {
        const ctx = requireAuthContext(res);
        const roles = await service.list(ctx);
        res.status(200).json({ success: true, data: roles.map(keRole), meta: null });
    };
}

export function updateRolePermissionsHandler(service: RoleService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = RoleIdParamSchema.parse(req.params);
        const body = UpdateRolePermissionsBodySchema.parse(req.body);
        const role = await service.updatePermissions(ctx, id, { permissions: body.permissions });
        res.status(200).json({ success: true, data: keRole(role), meta: null });
    };
}
