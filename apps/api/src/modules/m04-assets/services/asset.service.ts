// AssetService (FR-03.2, FR-04.1, FR-04.2, FR-04.3, FR-04.4, `m04-assets.md` §7).
// `daftarkan` (PR-02-11) adalah tulis pertama M-04: batas transaksi SDD-07 —
// INSERT + penomoran + `AuditLogger.write()` sinkron dalam SATU transaksi per
// unit (SDD-EVT-02, AL-01); tidak ada efek tertunda di sini, jadi tanpa outbox.
// `list`/`listByRoom` (PR-02-12) murni baca — tanpa activity log (FR-04.2
// Post Conditions: "Tidak ada perubahan data"). `ubahKondisi` (PR-02-13) sama
// polanya dengan `daftarkan`: UPDATE + riwayat + `AuditLogger.write()` sinkron
// satu transaksi, tanpa efek tertunda — pembatalan reservasi mendatang (A1) dan
// notifikasi (A1/A2) TIDAK ada di sini, lihat docstring `ubahKondisi`.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
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

export interface MutasiLokasiInput {
    readonly assetIds: readonly number[];
    readonly roomTujuanId: number;
    /** `YYYY-MM-DD`, dipilih pengguna (FR-04.4 langkah 2). */
    readonly tanggal: string;
    readonly alasan: string;
    readonly penanggungJawabBaruId: number | null;
}

/** FR-04.4 Preconditions: HANYA dua status ini yang boleh dimutasi (BR-010, A1). */
const STATUS_BOLEH_MUTASI: ReadonlySet<AssetStatus> = new Set(["TERSEDIA", "DALAM_PERBAIKAN"]);

export interface UbahKondisiInput {
    readonly kondisi: AssetCondition;
    readonly alasan: string;
    /** BR-012: wajib bila `kondisi === "HILANG"` — divalidasi di `ubahKondisi`. */
    readonly referensiJenis: string | null;
    readonly referensiId: number | null;
}

export class AssetService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly clock: Clock,
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

    /**
     * `PATCH /assets/{id}/condition` (FR-04.3 langkah 1-4; `asset.update_condition`,
     * bukan `asset.update` — katalog permission `m04-assets.md` §10 dan seed RBAC
     * `0010` memberi Teknisi scope `ASSIGNED` khusus di sini, cocok Actor FR-04.3
     * "Teknisi (khusus kondisi pasca-perbaikan)"; tabel `§7` menyebut `asset.update`,
     * dianggap keliru — dikonfirmasi pemilik produk).
     *
     * **TERBUKA (scope `ASSIGNED`):** `work_orders` (M-12 Maintenance, Phase 04)
     * belum ada, sehingga Teknisi TIDAK dibatasi ke aset yang ditugaskan padanya —
     * scope ini berlaku seperti `all` untuk sementara (dikonfirmasi pemilik produk).
     * Ditutup begitu `work_orders` ada, mengikuti pola `SDD-AUTH-03 §4.2`.
     *
     * **TERBUKA (efek lintas modul):** A1 (membatalkan reservasi mendatang +
     * notifikasi pemohon) dan A2 (notifikasi Pimpinan Sekolah) TIDAK diterbitkan
     * di sini — `booking_slots` (M-07, `PR-02-16`) dan notifikasi (M-17,
     * `PR-02-25`) belum ada; `m04-assets.md` §9 juga menyatakan modul ini TIDAK
     * menerbitkan notifikasi sama sekali (kondisi `Hilang` resmi dinotifikasi M-13,
     * `NT-33`, di luar endpoint generik ini).
     */
    async ubahKondisi(ctx: AuthContext, id: number, input: UbahKondisiInput): Promise<AssetRow> {
        if (input.kondisi === "HILANG" && (input.referensiJenis === null || input.referensiId === null)) {
            throw new DomainError(
                "VALIDATION_ERROR",
                "Kondisi Hilang wajib merujuk sesi stock opname atau berita acara kehilangan.",
                { field: "referensi_jenis" },
            );
        }

        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createAssetRepository(scope.tx);
                const existing = await repo.findById(scope.ctx, id);
                if (existing === undefined) {
                    throw new NotFoundError("Aset tidak ditemukan.");
                }

                const kondisiLama = existing.kondisi;
                // BR-006/FR-04.3 A1/A2: kondisi memburuk -> status turunan Tidak Tersedia.
                const statusBaru: AssetStatus | undefined =
                    input.kondisi === "RUSAK_BERAT" || input.kondisi === "HILANG" ? "TIDAK_TERSEDIA" : undefined;

                const diperbarui = await repo.updateKondisi(scope.ctx, id, {
                    kondisi: input.kondisi,
                    ...(statusBaru === undefined ? {} : { status: statusBaru }),
                });

                // BR-007: riwayat kondisi (nilai lama -> baru, pelaku, waktu, alasan).
                await repo.insertRiwayatKondisi(scope.ctx, {
                    assetId: id,
                    kondisiLama,
                    kondisiBaru: input.kondisi,
                    alasan: input.alasan,
                    referensiJenis: input.referensiJenis,
                    referensiId: input.referensiId,
                    diubahOleh: ctx.userId,
                    diubahPada: this.clock.now(),
                });

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ASSET_CONDITION_CHANGED",
                    entitas: "assets",
                    entitasId: String(id),
                    nilaiSebelum: { kondisi: kondisiLama },
                    nilaiSesudah: { kondisi: input.kondisi, alasan: input.alasan },
                });

                // §11: "termasuk yang otomatis oleh sistem" — hanya bila status BENAR berubah.
                if (statusBaru !== undefined && existing.status !== statusBaru) {
                    await this.audit.write(scope, {
                        modul: MODUL,
                        aksi: "ASSET_STATUS_CHANGED",
                        entitas: "assets",
                        entitasId: String(id),
                        nilaiSebelum: { status: existing.status },
                        nilaiSesudah: { status: statusBaru },
                    });
                }

                return diperbarui;
            },
            this.db,
        );
    }

    /**
     * `POST /assets/move` (FR-04.4 langkah 1-4; `asset.update`). Satu ruangan
     * tujuan untuk 1..50 aset (AC), SATU transaksi: aset mana pun yang tak lolos
     * membatalkan seluruhnya (AC "atomik"). Ruangan tujuan wajib AKTIF (BR-009);
     * status aset wajib `TERSEDIA`/`DALAM_PERBAIKAN` (Preconditions — mencakup
     * BR-010 `Dipinjam` dan A1 `Direservasi`).
     *
     * **TERBUKA:** A1 memeriksa pinjaman/reservasi PADA `tanggal` mutasi — itu
     * `booking_slots` (BR-005a, `PR-02-16`/`PR-02-17`), belum ada; yang diperiksa
     * di sini hanya `status` SAAT INI. Validasi kapasitas lokasi tujuan (langkah 3)
     * ditunda — tidak ada konsep kapasitas aset di skema (`rooms.kapasitas` adalah
     * kapasitas orang); dikonfirmasi pemilik produk. Berita acara PDF (AC) menunggu
     * pembangkit PDF (`SDD-FS-12`) yang belum dibangun.
     */
    async mutasiLokasi(ctx: AuthContext, input: MutasiLokasiInput): Promise<readonly AssetRow[]> {
        const assetIds = [...new Set(input.assetIds)];

        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createAssetRepository(scope.tx);
                const ruangan = await repo.findRuanganAktifById(scope.ctx, input.roomTujuanId);
                if (ruangan === undefined) {
                    throw new DomainError(
                        "VALIDATION_ERROR",
                        "Ruangan tujuan tidak ditemukan atau berstatus nonaktif.",
                        { field: "room_tujuan_id" },
                    );
                }

                const dipindah: AssetRow[] = [];
                for (const id of assetIds) {
                    const aset = await repo.findById(scope.ctx, id);
                    if (aset === undefined) {
                        throw new DomainError("VALIDATION_ERROR", `Aset ${id} tidak ditemukan.`, {
                            field: "asset_ids",
                        });
                    }
                    if (!STATUS_BOLEH_MUTASI.has(aset.status)) {
                        throw new DomainError(
                            "VALIDATION_ERROR",
                            `Aset ${aset.kode_barang} berstatus ${aset.status} — hanya aset Tersedia atau Dalam Perbaikan yang dapat dimutasi.`,
                            { field: "asset_ids" },
                        );
                    }

                    const diperbarui = await repo.updateLokasi(scope.ctx, id, {
                        roomId: input.roomTujuanId,
                        ...(input.penanggungJawabBaruId === null ? {} : { penanggungJawabId: input.penanggungJawabBaruId }),
                    });
                    await repo.insertMutasi(scope.ctx, {
                        assetId: id,
                        roomAsalId: aset.room_id,
                        roomTujuanId: input.roomTujuanId,
                        tanggal: input.tanggal,
                        alasan: input.alasan,
                        dilakukanOleh: ctx.userId,
                    });
                    // AL-01: satu entri per aset, pola pembuatan massal `daftarkan` (§11 "asal dan tujuan").
                    await this.audit.write(scope, {
                        modul: MODUL,
                        aksi: "ASSET_MOVED",
                        entitas: "assets",
                        entitasId: String(id),
                        nilaiSebelum: { room_id: aset.room_id },
                        nilaiSesudah: { room_id: String(input.roomTujuanId), tanggal: input.tanggal, alasan: input.alasan },
                    });
                    dipindah.push(diperbarui);
                }
                return dipindah;
            },
            this.db,
        );
    }
}
