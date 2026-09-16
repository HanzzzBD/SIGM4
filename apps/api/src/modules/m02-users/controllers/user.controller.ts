// Controller M-02: validasi skema (SDD-API-01), lalu delegasi ke UserService.
// Handler async — Express 5 meneruskan promise yang ditolak ke errorHandler
// tanpa try/catch manual (SDD-06 §4.4).

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import {
    CreateUserBodySchema,
    ListUsersQuerySchema,
    UpdateUserBodySchema,
    UpdateUserStatusBodySchema,
    UserIdParamSchema,
} from "../schemas/user.schema.js";
import type { UserRow } from "../repositories/user.repository.js";
import type { UserService } from "../services/user.service.js";

function keUser(u: UserRow) {
    return {
        id: u.id,
        nama: u.nama,
        email: u.email,
        nip_nis: u.nip_nis,
        role_id: u.role_id,
        unit_kerja: u.unit_kerja,
        telepon: u.telepon,
        status: u.status,
        must_change_password: u.must_change_password,
        login_terakhir_pada: u.login_terakhir_pada,
        created_at: u.created_at,
        updated_at: u.updated_at,
    };
}

export function listUsersHandler(service: UserService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const query = ListUsersQuerySchema.parse({
            page: req.query["page"],
            per_page: req.query["per_page"],
            status: req.query["filter[status]"],
            role_id: req.query["filter[role_id]"],
            unit_kerja: req.query["filter[unit_kerja]"],
        });
        const hasil = await service.list(ctx, {
            page: query.page,
            perPage: query.per_page,
            ...(query.status === undefined ? {} : { status: query.status }),
            ...(query.role_id === undefined ? {} : { roleId: query.role_id }),
            ...(query.unit_kerja === undefined ? {} : { unitKerja: query.unit_kerja }),
        });
        res.status(200).json({
            success: true,
            data: hasil.rows.map(keUser),
            meta: {
                page: query.page,
                per_page: query.per_page,
                total: hasil.total,
                total_pages: Math.max(1, Math.ceil(hasil.total / query.per_page)),
            },
        });
    };
}

export function createUserHandler(service: UserService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = CreateUserBodySchema.parse(req.body);
        const hasil = await service.create(ctx, {
            nama: body.nama,
            email: body.email,
            nipNis: body.nip_nis,
            roleId: body.role_id,
            unitKerja: body.unit_kerja ?? null,
            telepon: body.telepon ?? null,
        });
        res.status(201).json({
            success: true,
            data: { ...keUser(hasil.user), password_sementara: hasil.passwordSementara },
            meta: null,
        });
    };
}

export function getUserHandler(service: UserService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = UserIdParamSchema.parse(req.params);
        const user = await service.getById(ctx, id);
        res.status(200).json({ success: true, data: keUser(user), meta: null });
    };
}

export function updateUserHandler(service: UserService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = UserIdParamSchema.parse(req.params);
        const body = UpdateUserBodySchema.parse(req.body);
        const user = await service.update(ctx, id, {
            nama: body.nama,
            email: body.email,
            nipNis: body.nip_nis,
            roleId: body.role_id,
            unitKerja: body.unit_kerja ?? null,
            telepon: body.telepon ?? null,
        });
        res.status(200).json({ success: true, data: keUser(user), meta: null });
    };
}

export function updateUserStatusHandler(service: UserService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = UserIdParamSchema.parse(req.params);
        const body = UpdateUserStatusBodySchema.parse(req.body);
        const user = await service.updateStatus(ctx, id, {
            status: body.status,
            alasan: body.alasan,
        });
        res.status(200).json({ success: true, data: keUser(user), meta: null });
    };
}
