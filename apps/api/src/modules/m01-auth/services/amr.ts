// Klaim `amr` access token (SDD-SESS-09): `["pwd"]` bagi sesi yang baru membuktikan password,
// `["pwd","otp"]` bagi sesi yang juga membuktikan faktor kedua. Gerbang `twoFactorVerified`
// (`shared/auth/two-factor.ts`) memeriksa klaim ini, bukan tabel.

import { AMR_OTP } from "../../../shared/auth/index.js";

const AMR_KREDENSIAL = ["pwd"] as const;
const AMR_DUA_FAKTOR = ["pwd", AMR_OTP] as const;

export function amrSesi(faktorKeduaTerbukti: boolean): readonly string[] {
    return faktorKeduaTerbukti ? AMR_DUA_FAKTOR : AMR_KREDENSIAL;
}
