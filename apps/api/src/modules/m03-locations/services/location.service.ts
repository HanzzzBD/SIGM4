// LocationService (FR-03.1). Batas transaksi SDD-07: tulis + AuditLogger.write()
// sinkron di dalam satu transaksi (SDD-EVT-02, AL-01) — tidak ada efek tertunda
// pada CRUD lokasi itu sendiri, sehingga tidak ada outbox di sini.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import type {
    AreaRow,
    BuildingRow,
    LocationStatus,
    RoomFields,
    RoomRow,
    RoomType,
} from "../repositories/location.repository.js";
import { createLocationRepository } from "../repositories/location.repository.js";

const MODUL = "m03-locations";

export interface LocationTreeArea extends AreaRow {
    readonly rooms: readonly RoomRow[];
}

export interface LocationTreeBuilding extends BuildingRow {
    readonly areas: readonly LocationTreeArea[];
}

export interface CreateBuildingInput {
    readonly nama: string;
    readonly kode: string;
    readonly keterangan: string | null;
}

export interface CreateAreaInput {
    readonly buildingId: number;
    readonly nama: string;
    readonly kode: string;
    readonly lantai: number | null;
}

export interface RoomInput {
    readonly areaId: number;
    readonly nama: string;
    readonly kode: string;
    readonly jenis: RoomType;
    readonly kapasitas: number | null;
    readonly penanggungJawabId: number | null;
    readonly dapatDireservasi: boolean;
    readonly bolehDireservasiSiswa: boolean;
}

function tolakKodeDuplikat(): never {
    throw new DomainError("DUPLICATE_CODE", "Kode lokasi sudah digunakan.", {
        field: "kode",
    });
}

function keRoomFields(input: RoomInput): RoomFields {
    return {
        areaId: input.areaId,
        nama: input.nama,
        kode: input.kode,
        jenis: input.jenis,
        kapasitas: input.kapasitas,
        penanggungJawabId: input.penanggungJawabId,
        dapatDireservasi: input.dapatDireservasi,
        bolehDireservasiSiswa: input.bolehDireservasiSiswa,
    };
}

export class LocationService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
    ) {}

    /** FR-03.1 langkah 2, A1 (BR-014). */
    async createBuilding(ctx: AuthContext, input: CreateBuildingInput): Promise<BuildingRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createLocationRepository(scope.tx);
                if (await repo.existsBuildingByKode(scope.ctx, input.kode)) tolakKodeDuplikat();

                const building = await repo.insertBuilding(scope.ctx, input);

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "LOCATION_CREATED",
                    entitas: "buildings",
                    entitasId: building.id,
                    nilaiSesudah: building,
                });

                return building;
            },
            this.db,
        );
    }

    /** FR-03.1 langkah 3, A1 (BR-014). */
    async createArea(ctx: AuthContext, input: CreateAreaInput): Promise<AreaRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createLocationRepository(scope.tx);
                const building = await repo.findBuildingById(scope.ctx, input.buildingId);
                if (building === undefined) {
                    throw new DomainError(
                        "VALIDATION_ERROR",
                        "Gedung tidak ditemukan.",
                        { field: "building_id" },
                    );
                }
                if (await repo.existsAreaByKode(scope.ctx, input.kode)) tolakKodeDuplikat();

                const area = await repo.insertArea(scope.ctx, input);

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "LOCATION_CREATED",
                    entitas: "areas",
                    entitasId: area.id,
                    nilaiSesudah: area,
                });

                return area;
            },
            this.db,
        );
    }

    /** FR-03.1 langkah 4, A1 (BR-014). */
    async createRoom(ctx: AuthContext, input: RoomInput): Promise<RoomRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createLocationRepository(scope.tx);
                const area = await repo.findAreaById(scope.ctx, input.areaId);
                if (area === undefined) {
                    throw new DomainError("VALIDATION_ERROR", "Area tidak ditemukan.", {
                        field: "area_id",
                    });
                }
                if (await repo.existsRoomByKode(scope.ctx, input.kode)) tolakKodeDuplikat();

                const room = await repo.insertRoom(scope.ctx, keRoomFields(input));

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "LOCATION_CREATED",
                    entitas: "rooms",
                    entitasId: room.id,
                    nilaiSesudah: room,
                });

                return room;
            },
            this.db,
        );
    }

    /** `PUT /rooms/{id}` — pengganti field yang boleh disunting (TANPA `status`, lihat skema). */
    async updateRoom(ctx: AuthContext, id: number, input: RoomInput): Promise<RoomRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createLocationRepository(scope.tx);
                const before = await repo.findRoomById(scope.ctx, id);
                if (before === undefined) throw new NotFoundError("Ruangan tidak ditemukan.");

                const area = await repo.findAreaById(scope.ctx, input.areaId);
                if (area === undefined) {
                    throw new DomainError("VALIDATION_ERROR", "Area tidak ditemukan.", {
                        field: "area_id",
                    });
                }
                if (
                    before.kode !== input.kode &&
                    (await repo.existsRoomByKode(scope.ctx, input.kode, id))
                )
                    tolakKodeDuplikat();

                const after = await repo.updateRoom(scope.ctx, id, keRoomFields(input));

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "LOCATION_UPDATED",
                    entitas: "rooms",
                    entitasId: id,
                    nilaiSebelum: before,
                    nilaiSesudah: after,
                });

                return after;
            },
            this.db,
        );
    }

    /** FR-03.1 langkah 1 — pohon lokasi lengkap, tanpa penyaringan status. */
    async getTree(ctx: AuthContext): Promise<readonly LocationTreeBuilding[]> {
        const repo = createLocationRepository(this.db);
        const [buildings, areas, rooms] = await Promise.all([
            repo.listAllBuildings(ctx),
            repo.listAllAreas(ctx),
            repo.listAllRooms(ctx),
        ]);

        const roomsByArea = new Map<string, RoomRow[]>();
        for (const room of rooms) {
            const daftar = roomsByArea.get(room.area_id) ?? [];
            daftar.push(room);
            roomsByArea.set(room.area_id, daftar);
        }

        const areasByBuilding = new Map<string, LocationTreeArea[]>();
        for (const area of areas) {
            const daftar = areasByBuilding.get(area.building_id) ?? [];
            daftar.push({ ...area, rooms: roomsByArea.get(area.id) ?? [] });
            areasByBuilding.set(area.building_id, daftar);
        }

        return buildings.map((building) => ({
            ...building,
            areas: areasByBuilding.get(building.id) ?? [],
        }));
    }

    /**
     * `PATCH /buildings/{id}/status` — penonaktifan berjenjang, KERANGKA hierarki
     * (BR-015): gedung tidak dapat dinonaktifkan selagi masih memiliki ruangan
     * AKTIF di bawahnya. Pemeriksaan terhadap ASET sungguhan menyusul `PR-02-10`
     * (Phase 02, tabel `assets` belum ada) — dicatat di log phase-01 §10.
     */
    async updateBuildingStatus(
        ctx: AuthContext,
        id: number,
        status: LocationStatus,
    ): Promise<BuildingRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createLocationRepository(scope.tx);
                const before = await repo.findBuildingById(scope.ctx, id);
                if (before === undefined) throw new NotFoundError("Gedung tidak ditemukan.");

                if (status === "NONAKTIF" && before.status === "AKTIF") {
                    if (await repo.hasActiveRoomInBuilding(scope.ctx, id)) {
                        throw new DomainError(
                            "VALIDATION_ERROR",
                            "Gedung masih memiliki ruangan aktif di bawahnya.",
                            { rule: "BR-015" },
                        );
                    }
                }

                const after = await repo.updateBuildingStatus(scope.ctx, id, status);

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: status === "NONAKTIF" ? "LOCATION_DEACTIVATED" : "LOCATION_UPDATED",
                    entitas: "buildings",
                    entitasId: id,
                    nilaiSebelum: before,
                    nilaiSesudah: after,
                });

                return after;
            },
            this.db,
        );
    }

    /**
     * `PATCH /rooms/{id}/status`. BR-015 di tingkat ruangan (memuat aset) BELUM
     * dapat ditegakkan — `assets` baru lahir `PR-02-10`. Tanpa pemeriksaan sampai
     * saat itu; lihat log phase-01 §10 "Yang diserahkan ke phase berikutnya".
     */
    async updateRoomStatus(ctx: AuthContext, id: number, status: LocationStatus): Promise<RoomRow> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createLocationRepository(scope.tx);
                const before = await repo.findRoomById(scope.ctx, id);
                if (before === undefined) throw new NotFoundError("Ruangan tidak ditemukan.");

                const after = await repo.updateRoomStatus(scope.ctx, id, status);

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: status === "NONAKTIF" ? "LOCATION_DEACTIVATED" : "LOCATION_UPDATED",
                    entitas: "rooms",
                    entitasId: id,
                    nilaiSebelum: before,
                    nilaiSesudah: after,
                });

                return after;
            },
            this.db,
        );
    }
}
