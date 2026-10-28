// Kode cadangan 2FA (FR-01.5 langkah 2, BR-070c): 10 kode sekali pakai, 10 karakter (±50 bit)
// dari alfabet tanpa karakter yang mudah tertukar (I, O, 0, 1), ditampilkan `XXXXX-XXXXX`.
// Hanya hash Argon2id yang disimpan; kode aslinya ditampilkan SATU kali.

import { randomInt } from "node:crypto";

export const JUMLAH_KODE_CADANGAN = 10;
/** Sisa kode yang memicu peringatan dan tawaran pembuatan ulang (FR-01.5 AC). */
export const AMBANG_KODE_CADANGAN_MENIPIS = 2;

const ALFABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PANJANG = 10;
const BENTUK_SAH = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;

function bangkitkanSatu(): string {
    let kode = "";
    for (let i = 0; i < PANJANG; i++) kode += ALFABET[randomInt(ALFABET.length)];
    return kode;
}

/**
 * SATU kode acak dalam bentuk normal, bentuk yang sama dengan kode cadangan. Dipakai kode aktivasi 2FA
 * (`BR-070d`): panjang dan alfabetnya sama, jadi `tampilkanKodeCadangan` dan `normalisasiKodeCadangan` berlaku pula.
 */
export function bangkitkanKodeTunggal(): string {
    return bangkitkanSatu();
}

/** Bentuk tampilan `XXXXX-XXXXX`. */
export function tampilkanKodeCadangan(kode: string): string {
    return `${kode.slice(0, PANJANG / 2)}-${kode.slice(PANJANG / 2)}`;
}

/** Sepuluh kode berbeda dalam bentuk NORMAL (tanpa tanda hubung); hash-lah yang disimpan. */
export function bangkitkanKodeCadangan(): string[] {
    const kumpulan = new Set<string>();
    while (kumpulan.size < JUMLAH_KODE_CADANGAN) kumpulan.add(bangkitkanSatu());
    return [...kumpulan];
}

/**
 * Bentuk normal masukan pengguna (huruf besar, tanpa tanda hubung/spasi), atau `undefined` bila
 * bukan bentuk kode cadangan — sehingga masukan asal tidak memicu Argon2id.
 */
export function normalisasiKodeCadangan(masukan: string): string | undefined {
    const normal = masukan.toUpperCase().replace(/[\s-]/g, "");
    return BENTUK_SAH.test(normal) ? normal : undefined;
}
