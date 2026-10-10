// Detail tiket kerusakan `GET /damage-reports/{id}` (FR-11.2 langkah 1–2, A3, BR-052; PR-03-15, keputusan 21a
// log phase-03). Scope `damage.view` ditegakkan di kueri: selain `all` hanya tiket milik sendiri, lainnya 404.
// URL foto hanya bagi berkas `CLEAN` (SDD-FS-03); garansi dari M-06, hanya bagi pemegang `asset_document.view`.

import type { DamageReportDetail } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import { garansiAktifAset, urlUnduhBerkas } from "../../m06-documents/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { createDamageReportRepository } from "../repositories/damage-report.repository.js";

const WIB_MS = 7 * 3_600_000;
/** Tanggal perdata WIB `YYYY-MM-DD` — "hari ini" bagi masa garansi (CAL-03). */
const tanggalWib = (instan: Date): string => new Date(instan.getTime() + WIB_MS).toISOString().slice(0, 10);

export class DamageReportQueryService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
        private readonly penyimpanan: PenyimpananObjek,
    ) {}

    async detail(ctx: AuthContext, id: number): Promise<DamageReportDetail> {
        const repo = createDamageReportRepository(this.db);
        const t = await repo.detail(ctx, id);
        if (t === undefined) throw new NotFoundError("Laporan kerusakan tidak ditemukan.");

        const foto = await Promise.all(
            (await repo.foto(ctx, t.id)).map(async (f) => ({
                file_id: f.file_id,
                urutan: f.urutan,
                // MOB-OFF-04: pesanan tanpa checksum = unggahannya masih di antrean perangkat (A2).
                status: f.checksum === null ? ("BELUM_TERUNGGAH" as const) : f.scan_status,
                url: f.checksum !== null && f.scan_status === "CLEAN" ? (await urlUnduhBerkas(this.penyimpanan, this.clock, f, "medium")).url : null,
            })),
        );
        const garansi =
            t.asset_id !== null && ctx.can("asset_document.view")
                ? (await garansiAktifAset(this.db, ctx, Number(t.asset_id), tanggalWib(this.clock.now()))).map((g) => ({ dokumen_id: g.id, nama_berkas: g.nama_berkas, garansi_selesai: g.garansi_selesai }))
                : null;

        const aset = t.asset_id !== null;
        return {
            id: t.id,
            nomor: t.nomor,
            status: t.status,
            urgensi: t.urgensi,
            deskripsi: t.deskripsi,
            objek: {
                jenis: aset ? "ASET" : "RUANGAN",
                id: aset ? (t.asset_id ?? "") : (t.room_id ?? ""),
                label: aset ? `${t.aset_nama ?? ""} (${t.kode_barang ?? ""})` : (t.ruangan ?? ""),
                lokasi: aset ? `${t.ruangan ?? ""}, ${t.gedung ?? ""}` : (t.gedung ?? ""),
            },
            pelapor: { id: t.pelapor_id, nama: t.pelapor_nama },
            dilaporkan_pada: t.created_at.toISOString(),
            diverifikasi_oleh: t.diverifikasi_oleh === null ? null : { id: t.diverifikasi_oleh, nama: t.verifikator_nama ?? "" },
            diverifikasi_pada: t.diverifikasi_pada?.toISOString() ?? null,
            catatan_verifikasi: t.catatan_verifikasi,
            foto,
            foto_tertunda: foto.filter((f) => f.status === "BELUM_TERUNGGAH").length,
            garansi,
        };
    }
}
