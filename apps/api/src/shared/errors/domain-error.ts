// Galat domain: dilempar service, dipetakan ErrorMapper menjadi respons HTTP.
// Service tidak pernah menyebut status HTTP — itu urusan lapisan API (SDD-06 §4.4).

import type { KodeGalat } from './codes.js';

/**
 * Galat yang membawa kode Bab 17.3. `detail` boleh memuat konteks bagi klien;
 * ia TIDAK pernah memuat pesan galat asli sistem — lihat ErrorMapper.
 */
export class DomainError extends Error {
  constructor(
    readonly kode: KodeGalat,
    pesan?: string,
    readonly detail?: Readonly<Record<string, unknown>>,
  ) {
    super(pesan ?? kode);
    this.name = 'DomainError';
  }
}

/** Autentikasi gagal atau token kedaluwarsa (401). */
export class AuthError extends DomainError {
  constructor(kode: Extract<KodeGalat, 'UNAUTHENTICATED' | 'TOKEN_EXPIRED'> = 'UNAUTHENTICATED') {
    super(kode);
    this.name = 'AuthError';
  }
}

/**
 * Tidak berhak (403). SDD-AUTH-08: ketiadaan hak atas objek yang ADA dan objek
 * yang TIDAK ADA menghasilkan respons yang sama — karena itu tidak ada varian
 * "not found" yang boleh dipakai untuk membedakan keduanya.
 */
export class ForbiddenError extends DomainError {
  constructor(kode: Extract<KodeGalat, 'FORBIDDEN' | 'INSUFFICIENT_PERMISSION'> = 'FORBIDDEN') {
    super(kode);
    this.name = 'ForbiddenError';
  }
}

/** Sumber daya tidak ada, dan pemanggil memang berhak mengetahuinya (404). */
export class NotFoundError extends DomainError {
  constructor(pesan?: string) {
    super('NOT_FOUND', pesan);
    this.name = 'NotFoundError';
  }
}
