import type { Sesi } from "../../shared/auth";
/** A tab/session changing account, role or grants must never reuse a previous report/job cache. */
export const analyticsCacheScope = (session: Sesi) => [session.user.id, session.user.role_kode, JSON.stringify(Object.keys(session.permissions).sort().map(p => [p, session.permissions[p]]))] as const;
