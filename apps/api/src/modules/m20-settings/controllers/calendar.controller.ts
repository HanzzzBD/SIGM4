// Controller kalender akademik dan kalender kerja M-20: validasi skema
// (SDD-API-01), lalu delegasi ke AcademicYearService / CalendarService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { HolidayRow } from "../repositories/calendar.repository.js";
import {
    AcademicYearBodySchema,
    HolidayBodySchema,
    IdParamSchema,
    ListAcademicYearsQuerySchema,
    ListHolidaysQuerySchema,
    UpdateWorkDaysBodySchema,
} from "../schemas/calendar.schema.js";
import type { AcademicYearService, AcademicYearView } from "../services/academic-year.service.js";
import type { CalendarService } from "../services/calendar.service.js";

function keTahun(v: AcademicYearView) {
    return {
        id: v.tahun.id,
        nama: v.tahun.nama,
        tanggal_mulai: v.tahun.tanggal_mulai,
        tanggal_selesai: v.tahun.tanggal_selesai,
        is_active: v.tahun.is_active,
        semester: v.semester.map((s) => ({
            id: s.id,
            nama: s.nama,
            tanggal_mulai: s.tanggal_mulai,
            tanggal_selesai: s.tanggal_selesai,
        })),
    };
}

function keLibur(h: HolidayRow) {
    return { id: h.id, tanggal: h.tanggal, nama: h.nama, jenis: h.jenis, academic_year_id: h.academic_year_id };
}

function masukanTahun(body: ReturnType<typeof AcademicYearBodySchema.parse>) {
    return {
        nama: body.nama,
        tanggalMulai: body.tanggal_mulai,
        tanggalSelesai: body.tanggal_selesai,
        semester: body.semester.map((s) => ({
            nama: s.nama,
            tanggalMulai: s.tanggal_mulai,
            tanggalSelesai: s.tanggal_selesai,
        })),
    };
}

function masukanLibur(body: ReturnType<typeof HolidayBodySchema.parse>) {
    return {
        tanggal: body.tanggal,
        nama: body.nama,
        jenis: body.jenis,
        academicYearId: body.academic_year_id ?? null,
    };
}

export function listAcademicYearsHandler(service: AcademicYearService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const query = ListAcademicYearsQuerySchema.parse({ page: req.query["page"], per_page: req.query["per_page"] });
        const hasil = await service.list(ctx, query.page, query.per_page);
        res.status(200).json({
            success: true,
            data: hasil.rows.map(keTahun),
            meta: { page: hasil.page, per_page: hasil.perPage, total: hasil.total, total_pages: hasil.totalPages },
        });
    };
}

export function createAcademicYearHandler(service: AcademicYearService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const hasil = await service.create(ctx, masukanTahun(AcademicYearBodySchema.parse(req.body)));
        res.status(201).json({ success: true, data: keTahun(hasil), meta: null });
    };
}

export function updateAcademicYearHandler(service: AcademicYearService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = IdParamSchema.parse(req.params);
        const hasil = await service.update(ctx, id, masukanTahun(AcademicYearBodySchema.parse(req.body)));
        res.status(200).json({ success: true, data: keTahun(hasil), meta: null });
    };
}

export function activateAcademicYearHandler(service: AcademicYearService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = IdParamSchema.parse(req.params);
        const hasil = await service.activate(ctx, id);
        res.status(200).json({ success: true, data: keTahun(hasil), meta: null });
    };
}

export function listHolidaysHandler(service: CalendarService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const query = ListHolidaysQuerySchema.parse({
            page: req.query["page"],
            per_page: req.query["per_page"],
            academic_year_id: req.query["filter[academic_year_id]"],
        });
        const hasil = await service.listHolidays(ctx, {
            page: query.page,
            perPage: query.per_page,
            ...(query.academic_year_id === undefined ? {} : { academicYearId: query.academic_year_id }),
        });
        res.status(200).json({
            success: true,
            data: hasil.rows.map(keLibur),
            meta: { page: hasil.page, per_page: hasil.perPage, total: hasil.total, total_pages: hasil.totalPages },
        });
    };
}

export function createHolidayHandler(service: CalendarService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const hasil = await service.createHoliday(ctx, masukanLibur(HolidayBodySchema.parse(req.body)));
        res.status(201).json({ success: true, data: keLibur(hasil), meta: null });
    };
}

export function updateHolidayHandler(service: CalendarService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = IdParamSchema.parse(req.params);
        const hasil = await service.updateHoliday(ctx, id, masukanLibur(HolidayBodySchema.parse(req.body)));
        res.status(200).json({ success: true, data: keLibur(hasil), meta: null });
    };
}

export function deleteHolidayHandler(service: CalendarService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = IdParamSchema.parse(req.params);
        await service.deleteHoliday(ctx, id);
        res.status(200).json({ success: true, data: null, meta: null });
    };
}

export function getWorkDaysHandler(service: CalendarService): RequestHandler {
    return async (_req, res) => {
        const ctx = requireAuthContext(res);
        res.status(200).json({ success: true, data: await service.workDays(ctx), meta: null });
    };
}

export function updateWorkDaysHandler(service: CalendarService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = UpdateWorkDaysBodySchema.parse(req.body);
        res.status(200).json({ success: true, data: await service.updateWorkDays(ctx, body.hari_kerja), meta: null });
    };
}
