// AssetService (FR-03.2, FR-04.1, FR-04.2, `m04-assets.md` §7). `daftarkan`
// (PR-02-11) adalah tulis pertama M-04: batas transaksi SDD-07 — INSERT +
// penomoran + `AuditLogger.write()` sinkron dalam SATU transaksi per unit
// (SDD-EVT-02, AL-01); tidak ada efek tertunda di sini, jadi tanpa outbox.
// `list`/`listByRoom` (PR-02-12) murni baca — tanpa activity log (FR-04.2
// Post Conditions: "Tidak ada perubahan data").

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import type {
    AssetFields,
    AssetRow,
    ListAssetsFilter,
    PengaturanKodeAset,
} from "../repositories/asset.repository.js";
import { createAssetRepository } from "../repositories/asset.repository.js";

const MODUL = "m04-assets";
/** FR-04.1 langkah 3: sama dengan rentang `jumlah_unit` impor massal (conventions.md E.5.1). */
const JUMLAH_UNIT_MAKS = 500;

export type AssetCondition = "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT" | "HILANG";
export type AssetStatus = "TERSEDIA" | "DIRESERVASI" | "DIPINJAM" | "DALAM_PERBAIKAN" | "TIDAK_TERSEDIA";
export type SumberPerolehan = "PEMBELIAN" | "HIBAH" | "BANTUAN_PEMERINTAH" | "SUMBANGAN" | "LAINNYA";

export interface DaftarkanAsetInput {
    readonly nama: string;
    readonly categoryId: number;
    readonly merek: string | null;
    readonly model: string | null;
    readonly nomorSeri: string | null;
    readonly tahunPerolehan: number;
    readonly sumberPerolehan: SumberPerolehan;
    readonly nilaiPerolehan: number | null;
    readonly roomId: number;
    readonly kondisi: AssetCondition;
    readonly dapatDipinjam: boolean;
    readonly bolehDipinjamSiswa: boolean;
    readonly penanggungJawabId: number | null;
    readonly procurementId: number | null;
    /** FR-04.1 langkah 3: N record identik sekaligus (BR-001). */
    readonly jumlahUnit: number;
}

/**
 * Token yang dikenali `kode_aset.pola` (FR-20.1). `URUT` BUKAN token di sini —
 * selalu ditambahkan di akhir oleh `rakitKodeBarang`, tidak dapat dihilangkan
 * lewat konfigurasi, sehingga keunikan kode (`BR-002`) tidak pernah bergantung
 * pilihan Administrator.
 */
const TOKEN_RESOLVER: Record<string, (kategoriKode: string, ruanganKode: string) => string> = {
    KATEGORI: (kategoriKode) => kategoriKode,
    LOKASI: (_kategoriKode, ruanganKode) => ruanganKode,
};

/** Merakit `kode_barang` dari pola tersimpan + kode kategori/ruangan + nomor urut. */
export function rakitKodeBarang(
    pengaturan: PengaturanKodeAset,
    kategoriKode: string,
    ruanganKode: string,
    urut: string,
): string {
    const tokens = pengaturan.pola
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    const segmen = tokens.map((token) => {
        const resolve = TOKEN_RESOLVER[token];
        if (resolve === undefined) {
            throw new Error(`Token pola kode_aset.pola tidak dikenal: ${token}`);
        }
        return resolve(kategoriKode, ruanganKode);
    });
    segmen.push(urut.padStart(pengaturan.panjangUrut, "0"));
    return segmen.join(pengaturan.pemisah);
}

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

export type ListAssetsInput = ListAssetsFilter;

export interface ListAssetsOutput {
    readonly rows: readonly Record<string, unknown>[];
    readonly page: number;
    readonly perPage: number;
    readonly total: number;
    readonly totalPages: number;
}

export class AssetService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
    ) {}

    /**
     * `POST /assets` (FR-04.1 langkah 1-6, A1). Membuat `jumlahUnit` record
     * terpisah dengan kode aset unik berurutan (BR-001, BR-002). Kategori
     * (A4: pembuatan kategori inline BELUM ada endpoint-nya — `PR-02-15`,
     * tetap `TERBUKA`) dan ruangan AKTIF wajib ada (BR-009); nomor seri, bila
     * diisi, wajib unik dan HANYA untuk satu unit (BR-003).
     */
    async daftarkan(ctx: AuthContext, input: DaftarkanAsetInput): Promise<readonly AssetRow[]> {
        if (input.jumlahUnit < 1 || input.jumlahUnit > JUMLAH_UNIT_MAKS) {
            throw new DomainError(
                "VALIDATION_ERROR",
                `jumlah_unit wajib antara 1 dan ${JUMLAH_UNIT_MAKS}.`,
                { field: "jumlah_unit" },
            );
        }
        if (input.jumlahUnit > 1 && input.nomorSeri !== null) {
            throw new DomainError(
                "VALIDATION_ERROR",
                "Nomor seri hanya dapat diisi bila jumlah_unit = 1 — nomor seri mengidentifikasi satu unit fisik.",
                { field: "nomor_seri" },
            );
        }
        // conventions.md E.5.1: boleh_dipinjam_siswa menuntut dapat_dipinjam. Diperiksa
        // di sini agar galatnya VALIDATION_ERROR, bukan 23514 mentah (ErrorMapper
        // memetakan 23514 ke INSUFFICIENT_BALANCE + alarm — salah konteks untuk aset).
        if (input.bolehDipinjamSiswa && !input.dapatDipinjam) {
            throw new DomainError(
                "VALIDATION_ERROR",
                "boleh_dipinjam_siswa tidak dapat true bila dapat_dipinjam false.",
                { field: "boleh_dipinjam_siswa" },
            );
        }

        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createAssetRepository(scope.tx);
                const kategori = await repo.findKategoriById(scope.ctx, input.categoryId);
                if (kategori === undefined) {
                    throw new DomainError("VALIDATION_ERROR", "Kategori aset tidak ditemukan.", {
                        field: "category_id",
                    });
                }
                const ruangan = await repo.findRuanganAktifById(scope.ctx, input.roomId);
                if (ruangan === undefined) {
                    throw new DomainError(
                        "VALIDATION_ERROR",
                        "Ruangan tidak ditemukan atau berstatus nonaktif.",
                        { field: "room_id" },
                    );
                }
                if (input.nomorSeri !== null && (await repo.existsNomorSeri(scope.ctx, input.nomorSeri))) {
                    throw new DomainError("DUPLICATE_CODE", "Nomor seri sudah digunakan.", {
                        field: "nomor_seri",
                    });
                }

                const pengaturan = await repo.ambilPengaturanKodeAset(scope.ctx);
                const dibuat: AssetRow[] = [];
                for (let i = 0; i < input.jumlahUnit; i += 1) {
                    const urut = await repo.nomorUrutBerikutnya(scope.ctx, input.categoryId, input.roomId);
                    const kodeBarang = rakitKodeBarang(pengaturan, kategori.kode, ruangan.kode, urut);
                    const fields: AssetFields = {
                        kodeBarang,
                        nama: input.nama,
                        categoryId: input.categoryId,
                        merek: input.merek,
                        model: input.model,
                        nomorSeri: input.nomorSeri,
                        tahunPerolehan: input.tahunPerolehan,
                        sumberPerolehan: input.sumberPerolehan,
                        nilaiPerolehan: input.nilaiPerolehan,
                        roomId: input.roomId,
                        kondisi: input.kondisi,
                        dapatDipinjam: input.dapatDipinjam,
                        bolehDipinjamSiswa: input.bolehDipinjamSiswa,
                        penanggungJawabId: input.penanggungJawabId,
                        procurementId: input.procurementId,
                    };
                    const asset = await repo.insertAsset(scope.ctx, fields);

                    // AL-01: satu entri per unit — "termasuk pembuatan massal N unit" (m04-assets.md §11).
                    await this.audit.write(scope, {
                        modul: MODUL,
                        aksi: "ASSET_CREATED",
                        entitas: "assets",
                        entitasId: asset.id,
                        nilaiSesudah: asset,
                    });

                    dibuat.push(asset);
                }
                return dibuat;
            },
            this.db,
        );
    }

    /**
     * `GET /rooms/{id}/assets` (FR-03.2 langkah 2-3). Daftar terpaginasi lewat
     * kueri katalog bersama (`AssetRepository.list`, `PR-02-12`); ringkasan
     * kondisi/status SELALU mencakup SELURUH isi ruangan, tidak terpotong
     * filter/paginasi daftar (`ringkasanRuangan`).
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

        const { rows, total } = await repo.list(ctx, {
            roomId,
            page: filter.page,
            perPage: filter.perPage,
            sort: "-created_at",
            ...(filter.kategoriId === undefined ? {} : { categoryId: filter.kategoriId }),
            ...(filter.kondisi === undefined ? {} : { kondisi: filter.kondisi }),
            ...(filter.status === undefined ? {} : { status: filter.status }),
        });
        const ringkasanRows = await repo.ringkasanRuangan(ctx, roomId);

        const perKondisi: Record<AssetCondition, number> = { BAIK: 0, RUSAK_RINGAN: 0, RUSAK_BERAT: 0, HILANG: 0 };
        let totalRuangan = 0;
        let jumlahDipinjam = 0;
        let jumlahDalamPerbaikan = 0;
        for (const baris of ringkasanRows) {
            const jumlah = Number(baris.jumlah);
            perKondisi[baris.kondisi] += jumlah;
            totalRuangan += jumlah;
            if (baris.status === "DIPINJAM") jumlahDipinjam += jumlah;
            if (baris.status === "DALAM_PERBAIKAN") jumlahDalamPerbaikan += jumlah;
        }

        return {
            roomId: String(roomId),
            assets: rows.map((baris) => ({
                kode_barang: baris["kode_barang"] as string,
                nama: baris["nama"] as string,
                kondisi: baris["kondisi"] as AssetCondition,
                status: baris["status"] as AssetStatus,
            })),
            ringkasan: { total: totalRuangan, perKondisi, jumlahDipinjam, jumlahDalamPerbaikan },
            page: filter.page,
            perPage: filter.perPage,
            total,
            totalPages: total === 0 ? 1 : Math.ceil(total / filter.perPage),
        };
    }

    /**
     * `GET /assets` (FR-04.2): katalog aset dengan pencarian, filter, dan
     * paginasi. BR-073 (field finansial) dan scope `restricted` (Siswa/OSIS,
     * `boleh_dipinjam_siswa`) ditegakkan di repository (`SDD-AUTH-06`).
     */
    async list(ctx: AuthContext, filter: ListAssetsInput): Promise<ListAssetsOutput> {
        const repo = createAssetRepository(this.db);
        const { rows, total } = await repo.list(ctx, filter);
        return {
            rows,
            page: filter.page,
            perPage: filter.perPage,
            total,
            totalPages: total === 0 ? 1 : Math.ceil(total / filter.perPage),
        };
    }
}
