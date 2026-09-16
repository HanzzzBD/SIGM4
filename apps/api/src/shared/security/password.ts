// Hash password dan kebijakan kata sandi (SDD-SYS-15, SDD-SESS-01, NFR-S-02).
//
// Dua aturan `NFR-S-03a` yang lain — daftar password bocor dan larangan memakai
// ulang 3 password terakhir — TIDAK ada di sini: keduanya menuntut sumber data
// dan tabel riwayat yang belum ada, dan dimiliki PR tersendiri di Phase 02
// (logs/phase-01.md §2, keputusan 9).

import { hash, verify } from "@node-rs/argon2";
import type { Options } from "@node-rs/argon2";

/**
 * Parameter Argon2id `SDD-SESS-01`. Nilainya dibandingkan dengan SDD oleh uji,
 * sehingga perbedaan antara dokumen dan kode memerah, bukan lolos diam-diam.
 *
 * `algorithm: 2` adalah `Algorithm.Argon2id`. Nilainya ditulis langsung karena
 * enum paket ini `const enum`, yang tidak dapat diakses saat
 * `verbatimModuleSyntax` aktif; bahwa hash benar-benar `argon2id` dijaga uji.
 */
export const ARGON2ID_PARAMETERS = {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
} as const satisfies Options;

/** `NFR-S-03a`, `FR-01.4` langkah 3. */
export const PASSWORD_MIN_LENGTH = 12;

export type PasswordViolation =
    | "TOO_SHORT"
    | "MISSING_UPPERCASE"
    | "MISSING_LOWERCASE"
    | "MISSING_DIGIT"
    | "CONTAINS_IDENTITY";

/** Identitas yang tidak boleh muncul di dalam password (`NFR-S-03a`). */
export interface UserIdentity {
    nama: string;
    email: string;
    nipNis: string;
}

/** Potongan identitas yang bermakna: bagian pendek menolak terlalu banyak password. */
const PANJANG_POTONGAN_IDENTITAS = 3;

function potonganIdentitas(identity: UserIdentity): string[] {
    const emailLokal = identity.email.split("@")[0] ?? "";
    return [...identity.nama.split(/\s+/), emailLokal, identity.nipNis]
        .map((bagian) => bagian.trim().toLowerCase())
        .filter((bagian) => bagian.length >= PANJANG_POTONGAN_IDENTITAS);
}

/**
 * Daftar pelanggaran kebijakan; kosong berarti password diterima. Pesan bagi
 * pengguna dirakit lapisan penyajian — di sini hanya kodenya.
 */
export function checkPasswordPolicy(
    password: string,
    identity: UserIdentity,
): PasswordViolation[] {
    const pelanggaran: PasswordViolation[] = [];
    if (password.length < PASSWORD_MIN_LENGTH) pelanggaran.push("TOO_SHORT");
    if (!/\p{Lu}/u.test(password)) pelanggaran.push("MISSING_UPPERCASE");
    if (!/\p{Ll}/u.test(password)) pelanggaran.push("MISSING_LOWERCASE");
    if (!/\d/u.test(password)) pelanggaran.push("MISSING_DIGIT");

    const kecil = password.toLowerCase();
    if (potonganIdentitas(identity).some((bagian) => kecil.includes(bagian)))
        pelanggaran.push("CONTAINS_IDENTITY");

    return pelanggaran;
}

/** Hash Argon2id ber-salt acak; keluarannya memuat parameternya sendiri. */
export function hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2ID_PARAMETERS);
}

/**
 * Password cocok dengan hash tersimpan. Hash yang rusak atau bukan Argon2id
 * dijawab `false`, bukan dilempar: bagi pemanggil ia kegagalan autentikasi yang
 * sama, dan melempar akan mengubah satu baris rusak menjadi `500`.
 */
export async function verifyPassword(
    encoded: string,
    password: string,
): Promise<boolean> {
    try {
        return await verify(encoded, password, ARGON2ID_PARAMETERS);
    } catch {
        return false;
    }
}
