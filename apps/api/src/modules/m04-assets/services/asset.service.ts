// AssetService (FR-03.2, `m04-assets.md` §7). Modul M-04 lahir PERTAMA kali di
// sini — KERANGKA satu endpoint saja: tabel `assets` sendiri baru lahir
// `PR-02-10` (Phase 02), sehingga tidak ada tulis apa pun di sini (tanpa
// AuditLogger/transaksi — bandingkan `LocationService` yang menulis).

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { createAssetRepository } from "../repositories/asset.repository.js";

export type AssetCondition = "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT" | "HILANG";
export type AssetStatus = "TERSEDIA" | "DIRESERVASI" | "DIPINJAM" | "DALAM_PERBAIKAN" | "TIDAK_TERSEDIA";

export interface ListRoomAssetsFilter {
    readonly page: number;
    readonly perPage: number;
    readonly kategoriId?: number;
    readonly kondisi?: AssetCondition;
    readonly status?: AssetStatus;
}

export interface RoomAssetSummary {
    readonly kode_barang: string;
    readonly nama: string;
    readonly kondisi: AssetCondition;
    readonly status: AssetStatus;
}

export interface RoomAssetsResult {
    readonly roomId: string;
    readonly assets: readonly RoomAssetSummary[];
    readonly ringkasan: {
        readonly total: number;
        readonly perKondisi: Record<AssetCondition, number>;
        readonly jumlahDipinjam: number;
        readonly jumlahDalamPerbaikan: number;
    };
    readonly page: number;
    readonly perPage: number;
    readonly total: number;
    readonly totalPages: number;
}

export class AssetService {
    constructor(private readonly db: Kysely<Database>) {}

    /**
     * `GET /rooms/{id}/assets` (FR-03.2 langkah 2-3) — KERANGKA: tabel `assets`
     * baru lahir `PR-02-10` (Phase 02), sehingga daftar dan ringkasan SELALU
     * kosong hari ini. Filter (`kategoriId`/`kondisi`/`status`) sudah diterima
     * dan divalidasi (lihat skema) agar kontrak tidak berubah saat data
     * sungguhan tersambung — lihat log phase-01 §10.
     */
    async listByRoom(
        ctx: AuthContext,
        roomId: number,
        filter: ListRoomAssetsFilter,
    ): Promise<RoomAssetsResult> {
        const repo = createAssetRepository(this.db);
        if (!(await repo.roomExists(ctx, roomId))) {
            throw new NotFoundError("Ruangan tidak ditemukan.");
        }

        return {
            roomId: String(roomId),
            assets: [],
            ringkasan: {
                total: 0,
                perKondisi: { BAIK: 0, RUSAK_RINGAN: 0, RUSAK_BERAT: 0, HILANG: 0 },
                jumlahDipinjam: 0,
                jumlahDalamPerbaikan: 0,
            },
            page: filter.page,
            perPage: filter.perPage,
            total: 0,
            totalPages: 1,
        };
    }
}
