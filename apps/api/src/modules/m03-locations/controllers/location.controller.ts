// Controller M-03: validasi skema (SDD-API-01), lalu delegasi ke LocationService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import {
    CreateAreaBodySchema,
    CreateBuildingBodySchema,
    CreateRoomBodySchema,
    IdParamSchema,
    UpdateLocationStatusBodySchema,
    UpdateRoomBodySchema,
} from "../schemas/location.schema.js";
import type { AreaRow, BuildingRow, RoomRow } from "../repositories/location.repository.js";
import type { LocationTreeBuilding } from "../services/location.service.js";
import type { LocationService } from "../services/location.service.js";

function keBuilding(b: BuildingRow) {
    return {
        id: b.id,
        nama: b.nama,
        kode: b.kode,
        keterangan: b.keterangan,
        status: b.status,
        created_at: b.created_at,
        updated_at: b.updated_at,
    };
}

function keArea(a: AreaRow) {
    return {
        id: a.id,
        building_id: a.building_id,
        nama: a.nama,
        kode: a.kode,
        lantai: a.lantai,
        created_at: a.created_at,
        updated_at: a.updated_at,
    };
}

function keRoom(r: RoomRow) {
    return {
        id: r.id,
        area_id: r.area_id,
        nama: r.nama,
        kode: r.kode,
        jenis: r.jenis,
        kapasitas: r.kapasitas,
        penanggung_jawab_id: r.penanggung_jawab_id,
        dapat_direservasi: r.dapat_direservasi,
        boleh_direservasi_siswa: r.boleh_direservasi_siswa,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
}

function keTree(buildings: readonly LocationTreeBuilding[]) {
    return buildings.map((b) => ({
        ...keBuilding(b),
        areas: b.areas.map((a) => ({
            ...keArea(a),
            rooms: a.rooms.map(keRoom),
        })),
    }));
}

export function getLocationTreeHandler(service: LocationService): RequestHandler {
    return async (_req, res) => {
        const ctx = requireAuthContext(res);
        const tree = await service.getTree(ctx);
        res.status(200).json({ success: true, data: keTree(tree), meta: null });
    };
}

export function createBuildingHandler(service: LocationService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = CreateBuildingBodySchema.parse(req.body);
        const building = await service.createBuilding(ctx, {
            nama: body.nama,
            kode: body.kode,
            keterangan: body.keterangan ?? null,
        });
        res.status(201).json({ success: true, data: keBuilding(building), meta: null });
    };
}

export function createAreaHandler(service: LocationService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = CreateAreaBodySchema.parse(req.body);
        const area = await service.createArea(ctx, {
            buildingId: body.building_id,
            nama: body.nama,
            kode: body.kode,
            lantai: body.lantai ?? null,
        });
        res.status(201).json({ success: true, data: keArea(area), meta: null });
    };
}

export function createRoomHandler(service: LocationService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = CreateRoomBodySchema.parse(req.body);
        const room = await service.createRoom(ctx, {
            areaId: body.area_id,
            nama: body.nama,
            kode: body.kode,
            jenis: body.jenis,
            kapasitas: body.kapasitas ?? null,
            penanggungJawabId: body.penanggung_jawab_id ?? null,
            dapatDireservasi: body.dapat_direservasi,
            bolehDireservasiSiswa: body.boleh_direservasi_siswa,
        });
        res.status(201).json({ success: true, data: keRoom(room), meta: null });
    };
}

export function updateRoomHandler(service: LocationService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = IdParamSchema.parse(req.params);
        const body = UpdateRoomBodySchema.parse(req.body);
        const room = await service.updateRoom(ctx, id, {
            areaId: body.area_id,
            nama: body.nama,
            kode: body.kode,
            jenis: body.jenis,
            kapasitas: body.kapasitas ?? null,
            penanggungJawabId: body.penanggung_jawab_id ?? null,
            dapatDireservasi: body.dapat_direservasi,
            bolehDireservasiSiswa: body.boleh_direservasi_siswa,
        });
        res.status(200).json({ success: true, data: keRoom(room), meta: null });
    };
}

export function updateBuildingStatusHandler(service: LocationService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = IdParamSchema.parse(req.params);
        const { status } = UpdateLocationStatusBodySchema.parse(req.body);
        const building = await service.updateBuildingStatus(ctx, id, status);
        res.status(200).json({ success: true, data: keBuilding(building), meta: null });
    };
}

export function updateRoomStatusHandler(service: LocationService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = IdParamSchema.parse(req.params);
        const { status } = UpdateLocationStatusBodySchema.parse(req.body);
        const room = await service.updateRoomStatus(ctx, id, status);
        res.status(200).json({ success: true, data: keRoom(room), meta: null });
    };
}
