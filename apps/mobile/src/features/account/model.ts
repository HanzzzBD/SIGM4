// Logika murni layar akun (MS-27, MS-28, MS-30) — dapat diuji tanpa runtime native.
import type { IconName } from "../../shared/ui/Icon";
import { REGISTERED_SCREENS } from "../../shared/screens";

/** Batas USER_PHOTO server: JPG/PNG maks 2 MB (kebijakan berkas M-06). */
export const PROFILE_PHOTO_MAX = 2 * 1024 * 1024;

/** FR-01.4: nama wajib ≤200, telepon opsional ≤30; pesan galat satu kalimat. */
export function profileError(nama: string, telepon: string): string | null {
    if (nama.trim() === "") return "Nama wajib diisi.";
    if (nama.trim().length > 200) return "Nama paling banyak 200 karakter.";
    if (telepon.trim().length > 30) return "Telepon paling banyak 30 karakter.";
    return null;
}

/** Pintu keluar Profil (P-76 → MS-30): hanya layar yang terdaftar di build ini dan izinnya dipegang. */
const LINKS: readonly { id: string; label: string; icon: IconName; permission: string | null }[] = [
    { id: "MS-27", label: "Keamanan & 2FA", icon: "shield", permission: null },
    { id: "MS-28", label: "Preferensi Notifikasi", icon: "bell", permission: "notification.manage_own" },
    { id: "MS-26", label: "Pemberitahuan Privasi", icon: "fileText", permission: null },
];
export function profileLinks(permissions: Readonly<Record<string, string>>, registered: Readonly<Record<string, string>> = REGISTERED_SCREENS) {
    return LINKS.flatMap((link) => { const path = registered[link.id]; return path !== undefined && (link.permission === null || Object.hasOwn(permissions, link.permission)) ? [{ ...link, path }] : []; });
}
