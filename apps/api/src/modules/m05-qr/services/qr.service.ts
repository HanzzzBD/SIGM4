// Layanan siklus hidup QR aset (FR-05.1; PR-03-01, keputusan 1 log phase-03). Kolom QR milik
// `assets` (M-04) ditulis lewat `index.ts` M-04 di transaksi yang sama dengan entri log-nya
// (AL-01, SDD-SYS-03). Pembuatan payload & matriks QR: `shared/qr`.

import type { Kysely } from "kysely";
import { asetByUuid, asetUntukLabel, gantiUuidAset, profilPublikAset, tandaiQrTerpasang } from "../../m04-assets/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { PembangkitPdf } from "../../../shared/pdf/index.js";
import { urlQrAset } from "../../../shared/qr/index.js";
import type { ElemenLabel, KodeTataLetak } from "./label-html.js";
import { htmlLabel } from "./label-html.js";

const MODUL = "m05-qr";

export class QrService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        /** `APP_BASE_URL` tervalidasi (`shared/config`). */
        private readonly dasarQr: string,
        private readonly pdf: PembangkitPdf,
    ) {}

    /**
     * FR-05.1 A2: UUID baru → QR lama otomatis tidak berlaku (uuid lama tak lagi menunjuk aset
     * mana pun; pemindaiannya dijawab "tidak dikenali", FR-05.2 A1). Hanya `asset.qr_regenerate`
     * (inti Administrator). Alasan wajib (UX-04) tersimpan di `keterangan` entri log.
     */
    async regenerasi(ctx: AuthContext, assetId: number, alasan: string): Promise<{ readonly id: string; readonly uuid: string; readonly qr_url: string }> {
        return withTransaction(
            ctx,
            async (scope) => {
                const { uuidLama, uuidBaru } = await gantiUuidAset(scope, assetId);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ASSET_QR_REGENERATED",
                    entitas: "assets",
                    entitasId: String(assetId),
                    nilaiSebelum: { uuid: uuidLama },
                    nilaiSesudah: { uuid: uuidBaru },
                    keterangan: alasan,
                });
                return { id: String(assetId), uuid: uuidBaru, qr_url: urlQrAset(this.dasarQr, uuidBaru) };
            },
            this.db,
        );
    }

    /** FR-05.2 langkah 3 (PR-03-03): baca saja — tanpa entri log (bukan operasi tulis, AL-01). */
    async pindai(ctx: AuthContext, uuid: string) {
        const aset = await withTransaction(ctx, (scope) => asetByUuid(scope, uuid), this.db);
        return { ...aset.baris, qr_url: urlQrAset(this.dasarQr, String(aset.baris["uuid"])), kategori_nama: aset.kategoriNama, lokasi: aset.lokasi };
    }

    /** FR-05.2 A3 (PR-03-03): tanpa pengguna — lihat pengecualian `PublicAssetRepository`. */
    async profilPublik(uuid: string) {
        return profilPublikAset(this.db, uuid);
    }

    /**
     * FR-05.1 langkah 2–4 dan A1 (cetak ulang — UUID tidak berubah, jadi label lama tetap sah).
     * Render terjadi DI LUAR transaksi agar koneksi basis data tidak tertahan selama Chromium
     * bekerja; `ASSET_QR_PRINTED` (m05 §11, beserta jumlah) dicatat setelah PDF benar-benar jadi.
     */
    async cetakLabel(ctx: AuthContext, input: { readonly assetIds: readonly number[]; readonly tataLetak: KodeTataLetak; readonly elemen: ElemenLabel }): Promise<Buffer> {
        const label = await withTransaction(ctx, (scope) => asetUntukLabel(scope, input.assetIds), this.db);
        const pdf = await this.pdf.render(htmlLabel(this.dasarQr, label, input.tataLetak, input.elemen));
        await withTransaction(
            ctx,
            (scope) =>
                this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ASSET_QR_PRINTED",
                    entitas: "assets",
                    nilaiSesudah: { jumlah: label.length, tata_letak: input.tataLetak, asset_ids: label.map((l) => String(l.id)) },
                }),
            this.db,
        );
        return pdf;
    }

    /** FR-05.1 langkah 5 (dan A1 — label dilepas): atomik; `ASSET_UPDATED` per aset yang berubah. */
    async tandaiTerpasang(ctx: AuthContext, assetIds: readonly number[], nilai: boolean): Promise<readonly number[]> {
        return withTransaction(ctx, (scope) => tandaiQrTerpasang(scope, this.audit, assetIds, nilai), this.db);
    }
}
