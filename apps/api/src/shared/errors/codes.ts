// Katalog kode galat — cerminan Bab 17.3 (api-conventions.md), yang sejak audit
// 7 September 2026 bersifat TERTUTUP: judul kolomnya bukan lagi "Contoh error.code".
//
// Kode galat adalah kontrak klien — web dan mobile memetakannya ke pesan Bahasa
// Indonesia (NFR-AC-09). Karena itu daftar ini tidak boleh bertambah di sini
// lebih dulu; ia bertambah di Bab 17.3, lalu dicerminkan ke sini.

/** Kode galat -> status HTTP-nya, persis Bab 17.3. */
export const KODE_GALAT = {
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  INSUFFICIENT_PERMISSION: 403,
  CORE_PERMISSION_LOCKED: 403,
  NOT_FOUND: 404,
  RESERVATION_CONFLICT: 409,
  ASSET_NOT_AVAILABLE: 409,
  DUPLICATE_CODE: 409,
  APPROVAL_ALREADY_DECIDED: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  REQUEST_IN_PROGRESS: 409,
  VALIDATION_ERROR: 422,
  BORROWER_BLOCKED: 422,
  DURATION_EXCEEDED: 422,
  INVALID_RULE_DEFINITION: 422,
  INSUFFICIENT_BALANCE: 422,
  EXCEEDS_APPROVED_QTY: 422,
  ACCOUNT_LOCKED: 423,
  UPGRADE_REQUIRED: 426,
  RATE_LIMIT_EXCEEDED: 429,
  INTERNAL_ERROR: 500,
  LLM_UNAVAILABLE: 503,
  STORAGE_UNAVAILABLE: 503,
} as const satisfies Record<string, number>;

export type KodeGalat = keyof typeof KODE_GALAT;

/** Status HTTP baku bagi sebuah kode galat. */
export function statusUntuk(kode: KodeGalat): number {
  return KODE_GALAT[kode];
}
