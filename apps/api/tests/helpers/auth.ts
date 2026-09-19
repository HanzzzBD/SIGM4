// Bantuan uji autentikasi (PR-02-02): pasangan kunci Ed25519 sekali-pakai dan dependensi
// `AppDeps.auth` untuk uji yang merakit `createApp` tanpa pernah login.

import { generateKeyPairSync } from "node:crypto";
import type { AppDeps } from "../../src/api/index.js";
import type { PermissionCache } from "../../src/shared/auth/index.js";
import { JwtKeys } from "../../src/shared/security/index.js";

export interface PasanganPem {
    readonly privat: string;
    readonly publik: string;
}

export function bangkitkanPem(): PasanganPem {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return {
        privat: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        publik: publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
}

/** Env `JWT_*` sah untuk `readApiConfig`. */
export function envJwtUji(pem: PasanganPem = bangkitkanPem()): {
    JWT_PRIVATE_KEY: string;
    JWT_PUBLIC_KEY: string;
} {
    return { JWT_PRIVATE_KEY: pem.privat, JWT_PUBLIC_KEY: pem.publik };
}

export function kunciUji(pem: PasanganPem = bangkitkanPem()): JwtKeys {
    return JwtKeys.dariPem(pem.privat, pem.publik);
}

/** `AppDeps.auth` untuk uji yang tidak mengautentikasi siapa pun: cache tak pernah dipanggil. */
export function authPalsu(): AppDeps["auth"] {
    const permissions = { load: () => Promise.resolve(undefined) } as unknown as PermissionCache;
    // Tanpa basis data: setiap sesi dianggap hidup — uji yang membuktikan pencabutan memakai `SessionStore` nyata.
    return { jwtKeys: kunciUji(), permissions, sessions: { aktif: () => Promise.resolve(true) } };
}
