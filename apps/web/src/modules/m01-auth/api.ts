// Panggilan API M-01 dari web (FR-01.1, FR-01.2, FR-01.4, FR-01.5). Platform WEB: token hanya di cookie
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

/** Hasil `POST /auth/2fa/verify`: sesi + sisa kode cadangan (FR-01.5 AC). */
export type HasilVerifikasi = HasilLoginSesi & { readonly sisa_kode_cadangan: number | null; readonly kode_cadangan_menipis: boolean };

export function verifikasiDuaFaktor(challengeToken: string, kode: string): Promise<HasilVerifikasi> {
    return ambilData<HasilVerifikasi>(api.post("/auth/2fa/verify", { challenge_token: challengeToken, kode }));
}

/** Tampil SATU kali (BR-070c): secret, URI untuk QR, 10 kode cadangan. */
export interface PendaftaranDuaFaktor {
    readonly secret: string;
    readonly otpauth_uri: string;
    readonly kode_cadangan: readonly string[];
}

/** FR-01.5 langkah 1-2; role wajib 2FA membawa kode aktivasi dari Administrator (BR-070d). */
export function mulaiPendaftaran(kodeAktivasi: string): Promise<PendaftaranDuaFaktor> {
    return ambilData<PendaftaranDuaFaktor>(api.post("/auth/2fa/enroll", { kode_aktivasi: kodeAktivasi }));
}

/** FR-01.5 langkah 3: 6 digit pertama mengaktifkan 2FA; cookie akses baru membawa amr `otp`. */
export async function konfirmasiPendaftaran(kode: string): Promise<void> {
    await api.post("/auth/2fa/enroll/confirm", { kode });
}

/** FR-01.4 langkah 2-4; sesi lain dicabut server, sesi ini menerima cookie akses baru. */
export async function gantiPassword(passwordLama: string, passwordBaru: string): Promise<void> {
    await api.post("/auth/password/change", { password_lama: passwordLama, password_baru: passwordBaru });
}

/**
 * Challenge 2FA disimpan di memori tab saja — tidak pernah di storage peramban — sampai
 * P-02 memakainya; kedaluwarsa 5 menit di server (SDD-SESS-10). `kedaluwarsaPada` dihitung
 * saat diterima agar P-02 dapat membedakan challenge habis dari kode salah (keduanya 401).
 */
export type Tantangan = HasilLoginTantangan & { readonly kedaluwarsaPada: number };
let tantangan: Tantangan | null = null;
export const simpanTantangan = (t: HasilLoginTantangan): void => {
    tantangan = { ...t, kedaluwarsaPada: Date.now() + t.expires_in * 1000 };
};
export const ambilTantangan = (): Tantangan | null => tantangan;
export const hapusTantangan = (): void => {
    tantangan = null;
};
