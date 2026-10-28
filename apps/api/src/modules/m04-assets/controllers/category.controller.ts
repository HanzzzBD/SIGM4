// Controller kategori aset (FR-04.5): validasi skema (SDD-API-01), lalu delegasi.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { KategoriFields } from "../repositories/category.repository.js";
import {
    CategoryBodySchema,
    CategoryIdParamSchema,
    ListCategoriesQuerySchema,
} from "../schemas/category.schema.js";
import type { CategoryService } from "../services/category.service.js";

function keFields(body: unknown): KategoriFields {
    const b = CategoryBodySchema.parse(body);
    return {
        nama: b.nama,
        kode: b.kode,
        parentId: b.parent_id ?? null,
        umurTeknisTahun: b.umur_teknis_tahun ?? null,
        intervalPreventifHari: b.interval_preventif_hari ?? null,
    };
}

export function listCategoriesHandler(
    service: CategoryService,
): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const q = ListCategoriesQuerySchema.parse({
            page: req.query["page"],
            per_page: req.query["per_page"],
        });
        const hasil = await service.list(ctx, q.page, q.per_page);
        res.status(200).json({
            success: true,
            data: hasil.rows,
            meta: {
                page: hasil.page,
                per_page: hasil.perPage,
                total: hasil.total,
                total_pages: hasil.totalPages,
            },
        });
    };
}

export function createCategoryHandler(
    service: CategoryService,
): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        res.status(201).json({
            success: true,
            data: await service.buat(ctx, keFields(req.body)),
            meta: null,
        });
    };
}

export function updateCategoryHandler(
    service: CategoryService,
): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = CategoryIdParamSchema.parse(req.params);
        res.status(200).json({
            success: true,
            data: await service.ubah(ctx, id, keFields(req.body)),
            meta: null,
        });
    };
}

export function deleteCategoryHandler(
    service: CategoryService,
): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = CategoryIdParamSchema.parse(req.params);
        await service.hapus(ctx, id);
        res.status(200).json({ success: true, data: null, meta: null });
    };
}
