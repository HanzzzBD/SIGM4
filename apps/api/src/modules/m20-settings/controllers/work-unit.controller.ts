// Controller unit kerja M-20: validasi skema (SDD-API-01), lalu delegasi ke WorkUnitService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { IdParamSchema } from "../schemas/calendar.schema.js";
import type { WorkUnitRow } from "../repositories/work-unit.repository.js";
import {
    ListWorkUnitsQuerySchema,
    UpdateWorkUnitStatusBodySchema,
    WorkUnitBodySchema,
} from "../schemas/work-unit.schema.js";
import type { WorkUnitService } from "../services/work-unit.service.js";

function keUnit(u: WorkUnitRow) {
    return { id: u.id, nama: u.nama, kode: u.kode, jenis: u.jenis, kepala_unit_id: u.kepala_unit_id, status: u.status };
}

function masukan(body: ReturnType<typeof WorkUnitBodySchema.parse>) {
    return { nama: body.nama, kode: body.kode, jenis: body.jenis, kepalaUnitId: body.kepala_unit_id ?? null };
}

export function listWorkUnitsHandler(service: WorkUnitService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const query = ListWorkUnitsQuerySchema.parse({
            page: req.query["page"],
            per_page: req.query["per_page"],
            jenis: req.query["filter[jenis]"],
            status: req.query["filter[status]"],
        });
        const hasil = await service.list(ctx, {
            page: query.page,
            perPage: query.per_page,
            ...(query.jenis === undefined ? {} : { jenis: query.jenis }),
            ...(query.status === undefined ? {} : { status: query.status }),
        });
        res.status(200).json({
            success: true,
            data: hasil.rows.map(keUnit),
            meta: { page: hasil.page, per_page: hasil.perPage, total: hasil.total, total_pages: hasil.totalPages },
        });
    };
}

export function createWorkUnitHandler(service: WorkUnitService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const hasil = await service.create(ctx, masukan(WorkUnitBodySchema.parse(req.body)));
        res.status(201).json({ success: true, data: keUnit(hasil), meta: null });
    };
}

export function updateWorkUnitHandler(service: WorkUnitService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = IdParamSchema.parse(req.params);
        const hasil = await service.update(ctx, id, masukan(WorkUnitBodySchema.parse(req.body)));
        res.status(200).json({ success: true, data: keUnit(hasil), meta: null });
    };
}

export function updateWorkUnitStatusHandler(service: WorkUnitService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = IdParamSchema.parse(req.params);
        const body = UpdateWorkUnitStatusBodySchema.parse(req.body);
        const hasil = await service.updateStatus(ctx, id, body.status);
        res.status(200).json({ success: true, data: keUnit(hasil), meta: null });
    };
}
