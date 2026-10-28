// SystemAuthContext — pelaku pekerjaan terjadwal (SDD-03 §5, AL-06, SDD-AUTH-05).
//
// Pekerjaan terjadwal tidak punya pengguna, tetapi setiap repository mewajibkan
// `AuthContext` (SDD-AUTH-02). Konteks ini berscope `all` dan HANYA boleh dibentuk
// dari luar siklus permintaan HTTP: pabriknya dibatasi `src/worker/**` oleh lint
// (`import/no-restricted-paths`, apps/api/eslint.config.js) — `index.ts` shared/auth
// sengaja tidak mengekspornya (SDD-03 §6, risiko "dipakai di jalur HTTP").
//
// `userId` = 0: tidak ada baris `users` ber-id 0, sehingga titik tulis yang lupa
// memakai `pelakuId` ditolak FK (`updated_by`, `created_by`) — gagal keras, bukan
// mencatat pelaku palsu diam-diam.

import type { AuthContext } from "./context.js";

export const PERAN_SISTEM = "SYSTEM";

export interface SystemAuthContext extends AuthContext {
    /** Nama pekerjaan terjadwal — dicatat bersama pelaku `SYSTEM` (AL-06). */
    readonly namaPekerjaan: string;
}

/**
 * Registri identitas: hanya objek yang lahir dari `createSystemAuthContext` yang
 * dikenali sebagai SYSTEM. Objek literal yang meniru bentuknya tidak lolos.
 */
const terdaftar = new WeakSet<AuthContext>();

export function createSystemAuthContext(namaPekerjaan: string): SystemAuthContext {
    if (namaPekerjaan.trim() === "") throw new Error("Nama pekerjaan wajib bagi pelaku SYSTEM (AL-06).");
    const ctx: SystemAuthContext = Object.freeze({
        userId: 0,
        roleCode: PERAN_SISTEM,
        namaPekerjaan,
        // Scope `all` atas seluruh permission (SDD-03 §5) — tidak ada daftar yang bisa tertinggal.
        permissions: new Set<string>(),
        can: () => true,
        scopeOf: () => "all" as const,
    });
    terdaftar.add(ctx);
    return ctx;
}

export function isSystemAuthContext(ctx: AuthContext): ctx is SystemAuthContext {
    return terdaftar.has(ctx);
}

/**
 * Nilai kolom pelaku (`updated_by`, `created_by`, `actor_id`): id pengguna, atau
 * NULL bila pelakunya SYSTEM — tidak ada baris `users` yang mewakilinya.
 */
export function pelakuId(ctx: AuthContext): number | null {
    return isSystemAuthContext(ctx) ? null : ctx.userId;
}
