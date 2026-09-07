// Redaction (SDD-OBS-04, SDD-15 §4.2).
//
// Dilakukan di FORMATTER, bukan di titik pemanggilan — sehingga field sensitif
// tidak bisa lolos karena satu pemanggil lupa. Itu perbedaan yang menentukan:
// pendekatan "bersihkan sebelum log" gagal pada pemanggil pertama yang lalai,
// dan kelalaian itu baru terlihat saat rahasianya sudah ada di agregator.

/** Daftar kunci yang tidak boleh muncul di log — SDD-15 §4.2 apa adanya. */
export const KUNCI_TERTUTUP: readonly string[] = [
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'token_hash',
  'totp_secret',
  'totp_secret_enc',
  'code_hash',
  'authorization',
  'cookie',
  'set-cookie',
  'api_key',
  'secret_value',
  'nip_nis', // PII — DP-03
  'telepon', // PII — DP-03
];

const KUNCI = new Set(KUNCI_TERTUTUP);

/**
 * Pola NILAI yang ditutup meski kuncinya tidak tertutup — rahasia sering
 * menyelinap lewat field bernama netral seperti `catatan` atau `payload`.
 */
const POLA_NILAI: readonly RegExp[] = [
  /^sk-[A-Za-z0-9_-]{8,}$/, // kunci API bergaya OpenAI/Gemini
  /^Bearer\s+\S+$/i, // header Authorization yang ikut tersalin
  /^eyJ[A-Za-z0-9_-]{10,}\./, // JWT
];

export const DITUTUP = '[REDACTED]';

const MAKS_KEDALAMAN = 12;

function nilaiTertutup(nilai: string): boolean {
  return POLA_NILAI.some((p) => p.test(nilai));
}

/**
 * Menutup field sensitif secara rekursif, pada kunci **dan** pola nilai.
 * Struktur objek dipertahankan supaya log tetap terbaca; hanya nilainya diganti.
 */
export function redact(nilai: unknown, kedalaman = 0): unknown {
  if (kedalaman > MAKS_KEDALAMAN) return '[TERLALU_DALAM]';

  if (typeof nilai === 'string') return nilaiTertutup(nilai) ? DITUTUP : nilai;
  if (nilai === null || typeof nilai !== 'object') return nilai;
  if (nilai instanceof Date) return nilai.toISOString();
  if (Array.isArray(nilai)) return nilai.map((v) => redact(v, kedalaman + 1));

  // Error tidak dapat di-JSON-kan apa adanya: name/message/stack tidak enumerable.
  if (nilai instanceof Error) {
    return {
      type: nilai.name,
      message: nilai.message,
      stack: nilai.stack, // hanya ke agregator, tidak pernah ke klien (NFR-R-10)
    };
  }

  const keluar: Record<string, unknown> = {};
  for (const [kunci, isi] of Object.entries(nilai as Record<string, unknown>)) {
    keluar[kunci] = KUNCI.has(kunci.toLowerCase()) ? DITUTUP : redact(isi, kedalaman + 1);
  }
  return keluar;
}
