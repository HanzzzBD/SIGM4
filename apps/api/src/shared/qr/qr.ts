// QR aset (FR-05.1, M-05; PR-03-01). QR adalah URL PERMANEN `https://{domain}/a/{asset_uuid}`
// — tanpa tanda tangan berbatas waktu, sebab label dicetak permanen (klarifikasi FR-05.1
// langkah 1). Payload hanya memuat UUIDv4 aset: tidak ada data pribadi maupun finansial
// (FR-05.2 A3, `DP-05`). Yang disimpan hanya `assets.uuid`; QR dirender saat dibutuhkan
// (keputusan 1 log phase-03) — oleh label PDF worker (`PR-03-02`, SDD-FS-12) dan klien.
//
// Di `shared/` karena dipakai dua modul tanpa saling mengimpor: M-04 (`qr_url` pada respons
// aset) dan M-05 (cetak & pemindaian).

import { encode } from "uqr";

/** Jalur halaman publik aset (FR-05.2 A3) — bagian tetap dari URL yang tercetak di label. */
export const JALUR_PUBLIK_ASET = "/a/";

/**
 * Payload QR satu unit aset. `dasar` = `APP_BASE_URL` yang sudah tervalidasi (https, berhost,
 * tanpa garis miring penutup — `shared/config`).
 */
export function urlQrAset(dasar: string, assetUuid: string): string {
    return `${dasar}${JALUR_PUBLIK_ASET}${assetUuid}`;
}

export interface MatriksQr {
    /** Jumlah modul per sisi, TERMASUK zona tenang. */
    readonly ukuran: number;
    readonly data: readonly (readonly boolean[])[];
}

/** Zona tenang 4 modul (ISO/IEC 18004) — tanpa ini pemindai gagal pada label yang ditempel rapat. */
const ZONA_TENANG = 4;

/**
 * Matriks QR bertingkat koreksi galat **M** (AC FR-05.1: terbaca pada cetak 2×2 cm dengan
 * koreksi M). Tingkat dikunci — tidak dinaikkan otomatis — agar ukuran modul pada label
 * yang sama dapat diramalkan.
 */
export function matriksQr(teks: string): MatriksQr {
    const { size, data } = encode(teks, { ecc: "M", boostEcc: false, border: ZONA_TENANG });
    return { ukuran: size, data };
}

/**
 * SVG berdiri sendiri (hitam di atas putih, tanpa gaya luar) — siap disisipkan ke HTML cetak
 * label (`PR-03-02`). Satu `path` untuk seluruh modul gelap agar ringan pada 200 label.
 */
export function svgQr(teks: string): string {
    const { ukuran, data } = matriksQr(teks);
    const jalur: string[] = [];
    data.forEach((baris, y) =>
        baris.forEach((gelap, x) => {
            if (gelap) jalur.push(`M${String(x)} ${String(y)}h1v1h-1z`);
        }),
    );
    const sisi = String(ukuran);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sisi} ${sisi}" shape-rendering="crispEdges"><rect width="${sisi}" height="${sisi}" fill="#fff"/><path d="${jalur.join("")}" fill="#000"/></svg>`;
}
