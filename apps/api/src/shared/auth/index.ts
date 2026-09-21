// Permukaan publik shared/auth. Deklarasi permission (SDD-AUTH-01) sejak
// PR-00-09; middleware yang menegakkannya (PM-02) sejak PR-01-15; `authenticate`
// (verifikasi token) sejak PR-02-02.
export type { AuthenticateDeps } from "./authenticate.js";
export { authenticate, gerbangGantiPassword } from "./authenticate.js";
export type { AuthContext, AuthContextInput, Scope } from "./context.js";
export { assertAuthContext, createAuthContext } from "./context.js";
export type { FieldPolicy } from "./fields.js";
export { allowedFields } from "./fields.js";
export type { OpsiAutentikasi } from "./middleware.js";
export {
    authenticated,
    authorize,
    getAmr,
    getAuthContext,
    getSesiId,
    requireAuthContext,
    setAmr,
    setAuthContext,
} from "./middleware.js";
export { AMR_OTP, ROLE_WAJIB_DUA_FAKTOR, periksaDuaFaktor, wajibDuaFaktor } from "./two-factor.js";
export type { SessionChecker } from "./session-store.js";
export { SessionStore } from "./session-store.js";
export type { EffectivePermissions } from "./permission-cache.js";
export { PermissionCache } from "./permission-cache.js";
export {
    COOKIE_ACCESS,
    COOKIE_REFRESH,
    PATH_ACCESS,
    PATH_REFRESH,
    bacaCookie,
    hapusCookie,
    susunCookie,
} from "./session-cookies.js";
