// Permukaan publik shared/auth. Deklarasi permission (SDD-AUTH-01) sejak
// PR-00-09; middleware yang menegakkannya (PM-02) ditambahkan PR-01-15.
export type { AuthContext, AuthContextInput, Scope } from "./context.js";
export { assertAuthContext, createAuthContext } from "./context.js";
export type { FieldPolicy } from "./fields.js";
export { allowedFields } from "./fields.js";
export { authorize, getAuthContext, setAuthContext } from "./middleware.js";
