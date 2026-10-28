// Password sementara (FR-02.1 langkah 4 akun baru, FR-01.3 langkah 4 reset administratif).
// Dipakai dua modul — M-02 (pembuatan akun) dan M-01 (reset password) — sehingga tinggal di
// shared/security, bukan di salah satunya (SDD-SYS-03: modul tidak mengimpor internal modul lain).
//
// Ditampilkan satu kali pada respons, tidak pernah disimpan apa adanya maupun masuk
// activity log (AL-05) — hanya hash-nya yang menetap.

import { randomInt } from "node:crypto";
import { checkPasswordPolicy } from "./password.js";
import type { UserIdentity } from "./password.js";

// Tanpa 0/O/1/I/l — ambigu dibaca dari kertas kredensial yang diserahkan manual
// (FR-02.1 langkah 5).
const HURUF_BESAR = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const HURUF_KECIL = "abcdefghijkmnpqrstuvwxyz";
const ANGKA = "23456789";
const SELURUH = HURUF_BESAR + HURUF_KECIL + ANGKA;
const PANJANG = 16;

function acak(dari: string): string {
    return dari.charAt(randomInt(dari.length));
}

/** Fisher-Yates dengan `randomInt` — bukan `Math.random()` (kredensial awal akun). */
function kocok(karakter: readonly string[]): string {
    const hasil = [...karakter];
    for (let i = hasil.length - 1; i > 0; i -= 1) {
        const j = randomInt(i + 1);
        const a = hasil[i];
        const b = hasil[j];
        if (a === undefined || b === undefined) continue;
        hasil[i] = b;
        hasil[j] = a;
    }
    return hasil.join("");
}

/**
 * Membangkitkan password sementara yang lolos `checkPasswordPolicy` (NFR-S-03a).
 * Komposisi (besar/kecil/angka) dijamin oleh konstruksi; larangan memuat
 * identitas tetap diverifikasi ulang lewat kebijakan yang sama, bukan diasumsikan.
 */
export function generateTemporaryPassword(identity: UserIdentity): string {
    let kandidat: string;
    do {
        const wajib = [acak(HURUF_BESAR), acak(HURUF_KECIL), acak(ANGKA)];
        const sisa = Array.from({ length: PANJANG - wajib.length }, () =>
            acak(SELURUH),
        );
        kandidat = kocok([...wajib, ...sisa]);
    } while (checkPasswordPolicy(kandidat, identity).length > 0);
    return kandidat;
}
