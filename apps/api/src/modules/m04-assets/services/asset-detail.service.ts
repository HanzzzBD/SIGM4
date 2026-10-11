// Detail aset & linimasa (FR-04.2 langkah 5 & A1; PR-03-24, keputusan 4 & 24). Hanya baca — tanpa
// entri activity log (AL-01 mengikat operasi tulis). Aset di luar scope dijawab sama dengan aset yang
// tak ada (SDD-AUTH-08); linimasa memakai penjaga yang sama sebelum membaca riwayat.

import type { Kysely } from "kysely";
import type { AssetDetail, EntriLinimasaAset } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { urlQrAset } from "../../../shared/qr/index.js";
import { SUMBER_M04, createAssetDetailRepository } from "../repositories/asset-detail.repository.js";
import type { RegistriSumberLinimasa } from "./timeline-registry.js";
import { sumberLinimasaAset } from "./timeline-registry.js";

const TIDAK_DITEMUKAN = "Aset tidak ditemukan.";
const iso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();

export class AssetDetailService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly dasarQr: string,
        private readonly registri: RegistriSumberLinimasa = sumberLinimasaAset,
    ) {}

    async detail(ctx: AuthContext, id: number): Promise<AssetDetail> {
        const b = await createAssetDetailRepository(this.db).detail(ctx, id);
        if (b === undefined) throw new NotFoundError(TIDAK_DITEMUKAN);
        return {
            id: String(b["id"]),
            uuid: String(b["uuid"]),
            kode_barang: String(b["kode_barang"]),
            nama: String(b["nama"]),
            kategori: { id: String(b["category_id"]), nama: String(b["kategori_nama"]) },
            merek: (b["merek"] as string | null) ?? null,
            model: (b["model"] as string | null) ?? null,
            nomor_seri: (b["nomor_seri"] as string | null) ?? null,
            tahun_perolehan: Number(b["tahun_perolehan"]),
            lokasi: { room_id: String(b["room_id"]), ruang: String(b["ruang_nama"]), area: String(b["area_nama"]), gedung: String(b["gedung_nama"]) },
            kondisi: b["kondisi"] as AssetDetail["kondisi"],
            status: b["status"] as AssetDetail["status"],
            dapat_dipinjam: Boolean(b["dapat_dipinjam"]),
            boleh_dipinjam_siswa: Boolean(b["boleh_dipinjam_siswa"]),
            penanggung_jawab: b["penanggung_jawab_id"] === null ? null : { id: String(b["penanggung_jawab_id"]), nama: String(b["penanggung_jawab_nama"]) },
            qr_url: urlQrAset(this.dasarQr, String(b["uuid"])),
            qr_terpasang: Boolean(b["qr_terpasang"]),
            dihapuskan: Boolean(b["dihapuskan"]),
            tanggal_penghapusan: b["tanggal_penghapusan"] === null ? null : iso(b["tanggal_penghapusan"]),
            created_at: iso(b["created_at"]),
            // BR-073: kunci hadir HANYA bila repository memilih kolomnya.
            ...("sumber_perolehan" in b ? { sumber_perolehan: b["sumber_perolehan"] as NonNullable<AssetDetail["sumber_perolehan"]>, nilai_perolehan: (b["nilai_perolehan"] as string | null) ?? null } : {}),
        };
    }

    async linimasa(ctx: AuthContext, id: number, page: number, perPage: number): Promise<{ readonly entri: readonly EntriLinimasaAset[]; readonly total: number }> {
        const repo = createAssetDetailRepository(this.db);
        if ((await repo.detail(ctx, id)) === undefined) throw new NotFoundError(TIDAK_DITEMUKAN);
        const { baris, total } = await repo.linimasa(ctx, id, [...SUMBER_M04, ...this.registri.semua()], page, perPage);
        return { entri: baris.map((b) => ({ ...b.data, jenis: b.jenis, id: b.id, waktu: iso(b.waktu) }) as EntriLinimasaAset), total };
    }
}
