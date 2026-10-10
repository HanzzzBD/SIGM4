// Controller blokade ruangan (FR-07.5; PR-03-13). Isian tak sah → 422 per isian (Bab 17.2).

import { BlockIdParamSchema, BlockStatusBodySchema, RoomBlockCreateSchema, RoomBlockInputSchema, RoomIdParamSchema } from "@sigm4/schemas";
import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { BlockService, IsianBlokade } from "../services/block.service.js";

function urai<T>(skema: ZodType<T>, body: unknown): T {
    const hasil = skema.safeParse(body);
    if (!hasil.success) {
        throw new DomainError("VALIDATION_ERROR", "Isian blokade ruangan tidak sah.", {
            errors: hasil.error.issues.map((i) => ({ field: i.path.map(String).join(".") || "(body)", message: i.message })),
        });
    }
    return hasil.data;
}

export function listBlocksHandler(service: BlockService): RequestHandler {
    return async (req, res) => {
        const { id } = RoomIdParamSchema.parse(req.params);
        res.status(200).json({ success: true, data: await service.daftar(requireAuthContext(res), id), meta: null });
    };
}

export function previewBlockHandler(service: BlockService): RequestHandler {
    return async (req, res) => {
        const { id } = RoomIdParamSchema.parse(req.params);
        const isian = urai(RoomBlockInputSchema, req.body) as IsianBlokade;
        res.status(200).json({ success: true, data: await service.pratinjau(requireAuthContext(res), id, isian), meta: null });
    };
}

export function createBlockHandler(service: BlockService): RequestHandler {
    return async (req, res) => {
        const { id } = RoomIdParamSchema.parse(req.params);
        const { batalkan_bentrok, ...isian } = urai(RoomBlockCreateSchema, req.body);
        res.status(201).json({ success: true, data: await service.buat(requireAuthContext(res), id, isian as IsianBlokade, batalkan_bentrok), meta: null });
    };
}

export function deactivateBlockHandler(service: BlockService, jenis: "JADWAL_TETAP" | "BLOKADE_MANUAL"): RequestHandler {
    return async (req, res) => {
        const { id } = BlockIdParamSchema.parse(req.params);
        urai(BlockStatusBodySchema, req.body);
        res.status(200).json({ success: true, data: await service.nonaktifkan(requireAuthContext(res), jenis, id), meta: null });
    };
}
