// Controller notifikasi (FR-17.1; NTF-01/03/05; SDD-08 §4.3/§4.3a).
// SSE: `user_id` SELALU dari AuthContext hasil autentikasi, tidak pernah dari query (NTF-01).

import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { getSesiId, requireAuthContext } from "../../../shared/auth/index.js";
import { DeviceTokenParamSchema, ListNotificationsQuerySchema, NotificationIdParamSchema, RegisterDeviceTokenBodySchema, UpdatePreferencesBodySchema } from "../schemas/notification.schema.js";
import type { DeviceTokenService } from "../services/device-token.service.js";
import type { PreferenceService } from "../services/preference.service.js";
import type { HubSse } from "../services/fanout.js";
import { RETRY_MS } from "../services/fanout.js";
import type { InboxService } from "../services/inbox.service.js";

export function listNotificationsHandler(service: InboxService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const q = ListNotificationsQuerySchema.parse(req.query);
        const { rows, total, unread_count } = await service.daftar(ctx, { jenis: q.jenis, belumDibaca: q.belum_dibaca, arsip: q.arsip, page: q.page, perPage: q.per_page });
        res.status(200).json({
            success: true,
            data: rows,
            meta: { page: q.page, per_page: q.per_page, total, total_pages: total === 0 ? 1 : Math.ceil(total / q.per_page), unread_count },
        });
    };
}

export function markReadHandler(service: InboxService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = NotificationIdParamSchema.parse(req.params);
        res.status(200).json({ success: true, data: await service.tandaiBaca(ctx, id), meta: null });
    };
}

export function markAllReadHandler(service: InboxService): RequestHandler {
    return async (_req, res) => {
        res.status(200).json({ success: true, data: await service.tandaiSemua(requireAuthContext(res)), meta: null });
    };
}

/** FR-17.3 langkah 2. */
export function getPreferencesHandler(service: PreferenceService): RequestHandler {
    return async (_req, res) => {
        res.json({ success: true, data: await service.baca(requireAuthContext(res)), meta: null });
    };
}

/** FR-17.3 langkah 3. */
export function updatePreferencesHandler(service: PreferenceService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const b = UpdatePreferencesBodySchema.parse(req.body);
        const data = await service.simpan(ctx, b.preferensi.map((p) => ({ jenis: p.jenis, inApp: p.in_app, push: p.push })));
        res.json({ success: true, data, meta: null });
    };
}

/** FR-17.2 langkah 1 — keluarga sesi dari klaim `sid`, tidak pernah dari klien (MOB-SEC-05). */
export function registerDeviceTokenHandler(service: DeviceTokenService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const b = RegisterDeviceTokenBodySchema.parse(req.body);
        res.status(201).json({ success: true, data: await service.daftarkan(ctx, getSesiId(res), b.token, b.platform), meta: null });
    };
}

/** Pencabutan eksplisit oleh aplikasi (mis. izin notifikasi dicabut); logout mencabut lewat SessionRevoked. */
export function deleteDeviceTokenHandler(service: DeviceTokenService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { token } = DeviceTokenParamSchema.parse(req.params);
        await service.cabut(ctx, token);
        res.status(204).end();
    };
}

/**
 * `GET /notifications/stream` (SDD-08 §4.3): retry hint 5000 ms, event awal `hitungan`,
 * lalu siaran dari hub. Klien memuat ulang `GET /notifications` saat tersambung ulang —
 * aliran tidak diputar ulang (kebenaran di basis data).
 */
export function streamHandler(service: InboxService, hub: () => HubSse): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const unread = await service.hitungBelumDibaca(ctx);
        res.status(200).set({
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            Connection: "keep-alive",
            // Nginx tidak boleh menahan aliran (SDD-16 §4.2).
            "X-Accel-Buffering": "no",
        });
        res.flushHeaders();
        res.write(`retry: ${String(RETRY_MS)}\n\n`);
        res.write(`data: ${JSON.stringify({ jenis: "hitungan", unread_count: unread })}\n\n`);

        const id = randomUUID();
        const h = hub();
        let tertutup = false;
        const klien = {
            id,
            kirim: (teks: string) => {
                if (!tertutup) res.write(teks);
            },
            tutup: () => {
                if (tertutup) return;
                tertutup = true;
                res.end();
            },
        };
        req.on("close", () => {
            tertutup = true;
            void h.lepas(ctx.userId, id);
        });
        await h.sambung(ctx.userId, klien);
    };
}
