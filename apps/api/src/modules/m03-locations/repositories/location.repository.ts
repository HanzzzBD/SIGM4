// Repository hierarki lokasi (SDD-AUTH-02, PM-03, `FR-03.1`). PRIVAT terhadap
// modul (SDD-SYS-03) — hanya service/location.service.ts yang boleh memanggilnya.
//
// Satu berkas bagi ketiga tabel: `buildings`/`areas`/`rooms` adalah satu
// hierarki yang selalu berubah bersama (area menunjuk gedungnya, ruangan
// menunjuk areanya), bukan tiga domain independen.

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export type RoomType =
    | "KELAS"
    | "LABORATORIUM"
    | "AULA"
    | "PERPUSTAKAAN"
    | "KANTOR"
    | "GUDANG"
    | "LAPANGAN"
    | "LAINNYA";
export type LocationStatus = "AKTIF" | "NONAKTIF";

const KOLOM_BUILDING = ["id", "nama", "kode", "keterangan", "status", "created_at", "updated_at"] as const;
export interface BuildingRow {
    readonly id: string;
    readonly nama: string;
    readonly kode: string;
    readonly keterangan: string | null;
    readonly status: LocationStatus;
    readonly created_at: Date;
    readonly updated_at: Date;
}

const KOLOM_AREA = ["id", "building_id", "nama", "kode", "lantai", "created_at", "updated_at"] as const;
export interface AreaRow {
    readonly id: string;
    readonly building_id: string;
    readonly nama: string;
    readonly kode: string;
    readonly lantai: number | null;
    readonly created_at: Date;
    readonly updated_at: Date;
}

const KOLOM_ROOM = [
    "id",
    "area_id",
    "nama",
    "kode",
    "jenis",
    "kapasitas",
    "penanggung_jawab_id",
    "dapat_direservasi",
    "boleh_direservasi_siswa",
    "status",
    "created_at",
    "updated_at",
] as const;
export interface RoomRow {
    readonly id: string;
    readonly area_id: string;
    readonly nama: string;
    readonly kode: string;
    readonly jenis: RoomType;
    readonly kapasitas: number | null;
    readonly penanggung_jawab_id: string | null;
    readonly dapat_direservasi: boolean;
    readonly boleh_direservasi_siswa: boolean;
    readonly status: LocationStatus;
    readonly created_at: Date;
    readonly updated_at: Date;
}

export interface CreateBuildingData {
    readonly nama: string;
    readonly kode: string;
    readonly keterangan: string | null;
}

export interface CreateAreaData {
    readonly buildingId: number;
    readonly nama: string;
    readonly kode: string;
    readonly lantai: number | null;
}

export interface RoomFields {
    readonly areaId: number;
    readonly nama: string;
    readonly kode: string;
    readonly jenis: RoomType;
    readonly kapasitas: number | null;
    readonly penanggungJawabId: number | null;
    readonly dapatDireservasi: boolean;
    readonly bolehDireservasiSiswa: boolean;
}

export class LocationRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    // --- Buildings (BR-013, BR-014) ---

    async existsBuildingByKode(ctx: AuthContext, kode: string): Promise<boolean> {
        return (
            (await this.query(ctx)
                .selectFrom("buildings")
                .select("id")
                .where("kode", "=", kode)
                .executeTakeFirst()) !== undefined
        );
    }

    async insertBuilding(ctx: AuthContext, data: CreateBuildingData): Promise<BuildingRow> {
        return this.query(ctx)
            .insertInto("buildings")
            .values({
                nama: data.nama,
                kode: data.kode,
                keterangan: data.keterangan,
                created_by: ctx.userId,
                updated_by: ctx.userId,
            })
            .returning(KOLOM_BUILDING)
            .executeTakeFirstOrThrow();
    }

    // --- Areas (BR-013, BR-014) ---

    async findBuildingById(ctx: AuthContext, id: number): Promise<BuildingRow | undefined> {
        return this.query(ctx)
            .selectFrom("buildings")
            .select(KOLOM_BUILDING)
            .where("id", "=", String(id))
            .executeTakeFirst();
    }

    async existsAreaByKode(ctx: AuthContext, kode: string): Promise<boolean> {
        return (
            (await this.query(ctx)
                .selectFrom("areas")
                .select("id")
                .where("kode", "=", kode)
                .executeTakeFirst()) !== undefined
        );
    }

    async insertArea(ctx: AuthContext, data: CreateAreaData): Promise<AreaRow> {
        return this.query(ctx)
            .insertInto("areas")
            .values({
                building_id: data.buildingId,
                nama: data.nama,
                kode: data.kode,
                lantai: data.lantai,
                created_by: ctx.userId,
                updated_by: ctx.userId,
            })
            .returning(KOLOM_AREA)
            .executeTakeFirstOrThrow();
    }

    // --- Rooms (BR-013, BR-014, BR-016) ---

    async findAreaById(ctx: AuthContext, id: number): Promise<AreaRow | undefined> {
        return this.query(ctx)
            .selectFrom("areas")
            .select(KOLOM_AREA)
            .where("id", "=", String(id))
            .executeTakeFirst();
    }

    async findRoomById(ctx: AuthContext, id: number): Promise<RoomRow | undefined> {
        return this.query(ctx)
            .selectFrom("rooms")
            .select(KOLOM_ROOM)
            .where("id", "=", String(id))
            .executeTakeFirst();
    }

    async existsRoomByKode(ctx: AuthContext, kode: string, excludeId?: number): Promise<boolean> {
        let q = this.query(ctx).selectFrom("rooms").select("id").where("kode", "=", kode);
        if (excludeId !== undefined) q = q.where("id", "!=", String(excludeId));
        return (await q.executeTakeFirst()) !== undefined;
    }

    async insertRoom(ctx: AuthContext, data: RoomFields): Promise<RoomRow> {
        return this.query(ctx)
            .insertInto("rooms")
            .values({
                area_id: data.areaId,
                nama: data.nama,
                kode: data.kode,
                jenis: data.jenis,
                kapasitas: data.kapasitas,
                penanggung_jawab_id: data.penanggungJawabId,
                dapat_direservasi: data.dapatDireservasi,
                boleh_direservasi_siswa: data.bolehDireservasiSiswa,
                created_by: ctx.userId,
                updated_by: ctx.userId,
            })
            .returning(KOLOM_ROOM)
            .executeTakeFirstOrThrow();
    }

    async updateRoom(ctx: AuthContext, id: number, data: RoomFields): Promise<RoomRow> {
        return this.query(ctx)
            .updateTable("rooms")
            .set({
                area_id: data.areaId,
                nama: data.nama,
                kode: data.kode,
                jenis: data.jenis,
                kapasitas: data.kapasitas,
                penanggung_jawab_id: data.penanggungJawabId,
                dapat_direservasi: data.dapatDireservasi,
                boleh_direservasi_siswa: data.bolehDireservasiSiswa,
                updated_by: ctx.userId,
            })
            .where("id", "=", String(id))
            .returning(KOLOM_ROOM)
            .executeTakeFirstOrThrow();
    }

    // --- Pohon lokasi & penonaktifan berjenjang (FR-03.1 langkah 1, BR-015) ---

    async listAllBuildings(ctx: AuthContext): Promise<readonly BuildingRow[]> {
        return this.query(ctx).selectFrom("buildings").select(KOLOM_BUILDING).orderBy("nama").execute();
    }

    async listAllAreas(ctx: AuthContext): Promise<readonly AreaRow[]> {
        return this.query(ctx).selectFrom("areas").select(KOLOM_AREA).orderBy("nama").execute();
    }

    async listAllRooms(ctx: AuthContext): Promise<readonly RoomRow[]> {
        return this.query(ctx).selectFrom("rooms").select(KOLOM_ROOM).orderBy("nama").execute();
    }

    /**
     * BR-015 (kerangka hierarki, lihat `location.service.ts`): apakah gedung ini
     * masih memiliki ruangan AKTIF di bawahnya, lintas seluruh area-nya.
     */
    async hasActiveRoomInBuilding(ctx: AuthContext, buildingId: number): Promise<boolean> {
        return (
            (await this.query(ctx)
                .selectFrom("rooms")
                .innerJoin("areas", "areas.id", "rooms.area_id")
                .select("rooms.id")
                .where("areas.building_id", "=", String(buildingId))
                .where("rooms.status", "=", "AKTIF")
                .executeTakeFirst()) !== undefined
        );
    }

    async updateBuildingStatus(
        ctx: AuthContext,
        id: number,
        status: LocationStatus,
    ): Promise<BuildingRow> {
        return this.query(ctx)
            .updateTable("buildings")
            .set({ status, updated_by: ctx.userId })
            .where("id", "=", String(id))
            .returning(KOLOM_BUILDING)
            .executeTakeFirstOrThrow();
    }

    async updateRoomStatus(ctx: AuthContext, id: number, status: LocationStatus): Promise<RoomRow> {
        return this.query(ctx)
            .updateTable("rooms")
            .set({ status, updated_by: ctx.userId })
            .where("id", "=", String(id))
            .returning(KOLOM_ROOM)
            .executeTakeFirstOrThrow();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createLocationRepository(executor: QueryExecutor): LocationRepository {
    return defineRepository(new LocationRepository(executor));
}
