// Gerbang `twoFactorVerified` — langkah 3 rantai SDD-AUTH-09 (BR-070, SDD-SESS-09, PR-02-07).
//
// Role Administrator dan Pimpinan Sekolah wajib ber-2FA. Gerbang ini memeriksa KLAIM `amr`
// pada access token (bukan tabel `users`): sesi yang hanya membuktikan password (`amr=["pwd"]`)
// tidak boleh menjangkau route terlindung mana pun, kecuali yang dinyatakan pengecualian
// secara eksplisit pada deklarasinya — pendaftaran 2FA dan logout, yang justru jalan keluarnya.
//
// Ditegakkan di `authenticated()` dan `authorize()` (bukan middleware global berdaftar-putih
// path) supaya bawaannya TERTUTUP: route terlindung baru otomatis terjaga, sedangkan route
// publik — login, refresh, verifikasi 2FA — tidak pernah tersentuh oleh sesi setengah-jadi.

import { DomainError } from "../errors/index.js";
import type { AuthContext } from "./context.js";

/** Nilai `amr` yang membuktikan faktor kedua (`SDD-SESS-09`). */
export const AMR_OTP = "otp";

/** Role yang wajib 2FA (`BR-070`): Administrator (R-01) dan Pimpinan Sekolah (R-03). */
export const ROLE_WAJIB_DUA_FAKTOR: ReadonlySet<string> = new Set(["R-01", "R-03"]);

export function wajibDuaFaktor(roleCode: string): boolean {
    return ROLE_WAJIB_DUA_FAKTOR.has(roleCode);
}

/**
 * Galat bagi sesi yang belum lolos gerbang 2FA, atau `undefined` bila boleh lanjut. `amr` yang
 * tidak diketahui diperlakukan sebagai belum terverifikasi — gagal tertutup.
 */
export function periksaDuaFaktor(ctx: AuthContext, amr: readonly string[] | undefined): DomainError | undefined {
    if (!wajibDuaFaktor(ctx.roleCode)) return undefined;
    if (amr?.includes(AMR_OTP) === true) return undefined;
    return new DomainError("TWO_FACTOR_REQUIRED", "Anda wajib menyelesaikan verifikasi dua langkah (2FA) sebelum melanjutkan.");
}
