// Panggilan API M-01 dari web (FR-01.1, FR-01.2). Platform WEB: token hanya di cookie
// httpOnly, body membawa `tokens: null` (SDD-SESS-05).

import { ambilData, api } from "../../shared/api";

export interface HasilLoginSesi {
    readonly user: { readonly id: string; readonly nama: string; readonly role_kode: string; readonly must_change_password: boolean };
    readonly permissions: Readonly<Record<string, string>>;
}

export interface HasilLoginTantangan {
    readonly requires_2fa: true;
    readonly challenge_token: string;
    readonly expires_in: number;
}

export type HasilLogin = HasilLoginSesi | HasilLoginTantangan;

export const perluDuaFaktor = (h: HasilLogin): h is HasilLoginTantangan => "requires_2fa" in h;

export function login(email: string, password: string): Promise<HasilLogin> {
    return ambilData<HasilLogin>(api.post("/auth/login", { email, password, platform: "WEB" }));
}

/** FR-01.2: sesi ini saja. */
export async function logout(): Promise<void> {
    await api.post("/auth/logout");
}

/** FR-01.2 A1: seluruh perangkat. */
export async function logoutSemua(): Promise<void> {
    await api.post("/auth/logout-all");
}

/**
 * Challenge 2FA disimpan di memori tab saja — tidak pernah di storage peramban — sampai
 * P-02 (`PR-02-36`) memakainya; kedaluwarsa 5 menit di server (SDD-SESS-10).
 */
let tantangan: HasilLoginTantangan | null = null;
export const simpanTantangan = (t: HasilLoginTantangan): void => {
    tantangan = t;
};
export const ambilTantangan = (): HasilLoginTantangan | null => tantangan;
