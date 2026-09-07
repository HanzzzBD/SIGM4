// Permukaan publik shared/auth. Middleware permission (SDD-AUTH-01) ditambahkan PR-00-09.
export type { AuthContext, AuthContextInput, Scope } from './context.js';
export { assertAuthContext, createAuthContext } from './context.js';
