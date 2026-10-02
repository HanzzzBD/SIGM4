// Resolusi UUID QR → aset atas permintaan M-05 (FR-05.2; PR-03-03, keputusan 3 log phase-03).
// QR yang tidak dikenali — UUID bukan v4 (QR sistem lain, label rusak) maupun UUID yang tak lagi
// menunjuk aset (regenerasi FR-05.1 A2) — selalu 404 berpesan jelas, tidak pernah 500 (FR-05.2 A1).

import type { Kysely } from "kysely";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { createScanRepository, PublicAssetRepository } from "../repositories/scan.repository.js";
import type { PublicAssetRow } from "../repositories/scan.repository.js";

/** Payload QR hanya pernah memuat UUIDv4 (`gen_random_uuid`); selain itu bukan QR aset sistem ini. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** FR-05.2 A1 — klien menawarkan input kode aset manual. */
export const PESAN_QR_TIDAK_DIKENALI = "QR tidak dikenali. Masukkan kode aset secara manual.";

/** Tanpa ini PostgreSQL menolak literal `uuid` tak sah dengan 22P02 → 500. */
function uuidSah(uuid: string): string {
    if (!UUID_V4.test(uuid)) throw new NotFoundError(PESAN_QR_TIDAK_DIKENALI);
    return uuid.toLowerCase();
}

export interface LokasiAset {
    readonly gedung: string;
    readonly area: string;
    readonly ruang: string;
}

export interface AsetPindaian {
    readonly baris: Record<string, unknown>;
    readonly kategoriNama: string;
    readonly lokasi: LokasiAset;
}

const lokasiDari = (b: { readonly gedung_nama: unknown; readonly area_nama: unknown; readonly ruang_nama: unknown }): LokasiAset => ({
    gedung: String(b.gedung_nama),
    area: String(b.area_nama),
    ruang: String(b.ruang_nama),
});

/** `GET /assets/by-uuid/{uuid}` (FR-05.2 langkah 3, A2) — BR-073 & scope `restricted` dari repository. */
export async function asetByUuid(scope: TransactionScope, uuid: string): Promise<AsetPindaian> {
    const baris = await createScanRepository(scope.tx).cariByUuid(scope.ctx, uuidSah(uuid));
    if (baris === undefined) throw new NotFoundError(PESAN_QR_TIDAK_DIKENALI);
    const { kategori_nama: kategoriNama, gedung_nama, area_nama, ruang_nama, ...sisanya } = baris;
    return { baris: sisanya, kategoriNama: String(kategoriNama), lokasi: lokasiDari({ gedung_nama, area_nama, ruang_nama }) };
}

export interface ProfilPublikAset {
    readonly kode_barang: string;
    readonly nama: string;
    readonly kategori: string;
    readonly lokasi: LokasiAset;
    readonly kondisi: string;
    readonly status: string;
    /** FR-05.2 A2 di halaman publik: aset terhapuskan tetap tampil, bertanda tidak aktif (keputusan 3c). */
    readonly aktif: boolean;
}

/** `GET /public/assets/{uuid}` (FR-05.2 A3) — tanpa `AuthContext` (pengecualian, keputusan 3d). */
export async function profilPublikAset(db: Kysely<Database>, uuid: string): Promise<ProfilPublikAset> {
    const b: PublicAssetRow | undefined = await new PublicAssetRepository(db).profil(uuidSah(uuid));
    if (b === undefined) throw new NotFoundError(PESAN_QR_TIDAK_DIKENALI);
    return { kode_barang: b.kode_barang, nama: b.nama, kategori: b.kategori_nama, lokasi: lokasiDari(b), kondisi: b.kondisi, status: b.status, aktif: !b.dihapuskan };
}
