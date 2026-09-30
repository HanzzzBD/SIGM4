// Controller konfigurasi approval rule + pratinjau (FR-10.1, RE-07, RE-08; keputusan 77).
// Pelanggaran STRUKTUR definisi aturan dijawab `422 INVALID_RULE_DEFINITION` beserta
// seluruh pelanggarannya (RE-08) — bukan 400 generik — sama dengan lapis makna.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { DefinisiAturan } from "../schemas/rule.schema.js";
import { DefinisiAturanSchema, PreviewBodySchema, RuleIdParamSchema, StatusAturanBodySchema } from "../schemas/rule.schema.js";
import type { RuleConfigService } from "../services/rule-config.service.js";

function definisi(body: unknown): DefinisiAturan {
    const hasil = DefinisiAturanSchema.safeParse(body);
    if (hasil.success) return hasil.data;
    throw new DomainError("INVALID_RULE_DEFINITION", "Definisi aturan persetujuan tidak valid.", {
        errors: hasil.error.issues.map((i) => ({ field: i.path.map(String).join(".") || "(body)", message: i.message })),
    });
}

const kirim = (data: unknown) => ({ success: true as const, data, meta: null });

export function listRulesHandler(service: RuleConfigService): RequestHandler {
    return async (_req, res) => {
        res.status(200).json(kirim(await service.daftar(requireAuthContext(res))));
    };
}

export function createRuleHandler(service: RuleConfigService): RequestHandler {
    return async (req, res) => {
        res.status(201).json(kirim(await service.buat(requireAuthContext(res), definisi(req.body))));
    };
}

export function updateRuleHandler(service: RuleConfigService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = RuleIdParamSchema.parse(req.params);
        res.status(200).json(kirim(await service.ganti(ctx, id, definisi(req.body))));
    };
}

export function ruleStatusHandler(service: RuleConfigService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = RuleIdParamSchema.parse(req.params);
        const { status_aktif, alasan } = StatusAturanBodySchema.parse(req.body);
        res.status(200).json(kirim(await service.ubahStatus(ctx, id, status_aktif, alasan)));
    };
}

export function previewRuleHandler(service: RuleConfigService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const b = PreviewBodySchema.parse(req.body);
        res.status(200).json(kirim(await service.pratinjau(ctx, b)));
    };
}
