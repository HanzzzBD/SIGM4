// Kode aktivasi 2FA (BR-070d, SDD-SESS-17): konstanta dan pembangkitan bersama `TwoFactorService` (pemeriksaan
// pada `enroll`) dan `PengelolaDuaFaktorService` (penerbitan/reset oleh Administrator).

import {
    bangkitkanKodeTunggal,
    hashPassword,
    tampilkanKodeCadangan,
} from "../../../shared/security/index.js";

/** BR-070d: kode berlaku 72 jam, sama dengan password sementara (`FR-01.3` A3). */
export const MASA_KODE_AKTIVASI_MS = 72 * 60 * 60 * 1000;

/** BR-070d: lima kesalahan menghanguskan kode — TANPA mengunci akun (SDD-SESS-17). */
export const BATAS_GAGAL_KODE_AKTIVASI = 5;

/**
 * Jawaban SERAGAM untuk kode yang tidak ada, salah, kedaluwarsa, atau hangus (`FR-01.5 A5`, UX F-03): tidak
 * membedakan sebabnya. Pembedaan hanya ada di activity log internal.
 */
export const PESAN_KODE_AKTIVASI_TIDAK_BERLAKU = "Kode aktivasi tidak berlaku. Minta kode baru kepada Administrator.";

/** Kode yang tampil SATU kali kepada penerbit dan tak dapat dibaca ulang (BR-070d). */
export interface KodeAktivasiTerbit {
    readonly kode: string;
    readonly berlakuSampai: Date;
}

export interface KodeAktivasiSiap {
    readonly tampil: string;
    readonly hash: string;
}

/**
 * Membangkitkan satu kode dan hash Argon2id-nya. Dihitung SEBELUM transaksi: hash tidak menahan kunci baris.
 * Yang disimpan hanya `hash`; `tampil` (`XXXXX-XXXXX`) hanya dikembalikan kepada penerbit.
 */
export async function siapkanKodeAktivasi(): Promise<KodeAktivasiSiap> {
    const normal = bangkitkanKodeTunggal();
    return { tampil: tampilkanKodeCadangan(normal), hash: await hashPassword(normal) };
}
