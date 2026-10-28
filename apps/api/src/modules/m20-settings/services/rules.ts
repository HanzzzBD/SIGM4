// Galat aturan bisnis M-20 (Bab 17.3): VALIDATION_ERROR (422) dan DUPLICATE_CODE (409),
// keduanya membawa `field` agar klien dapat menandai isian yang salah.

import { DomainError } from "../../../shared/errors/index.js";

export const MODUL = "m20-settings";

export function tolak(pesan: string, field?: string): never {
    throw new DomainError("VALIDATION_ERROR", pesan, field === undefined ? undefined : { field });
}

export function duplikat(pesan: string, field: string): never {
    throw new DomainError("DUPLICATE_CODE", pesan, { field });
}
