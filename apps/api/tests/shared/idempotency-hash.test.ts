// Hash body permintaan (ID-02, ID-04). Bagian idempotensi yang tidak menuntut
// basis data — alurnya sendiri diuji terhadap PostgreSQL nyata di
// tests/integration/idempotency.test.ts.

import { describe, expect, it } from 'vitest';
import { hashRequestBody } from '../../src/shared/http/index.js';

describe('hashRequestBody', () => {
  it('menghasilkan SHA-256 heksadesimal', () => {
    expect(hashRequestBody({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('body identik menghasilkan hash identik', () => {
    expect(hashRequestBody({ room_id: 1 })).toBe(hashRequestBody({ room_id: 1 }));
  });

  it('URUTAN kunci tidak mengubah hash — inilah yang mencegah 409 palsu (ID-04)', () => {
    expect(hashRequestBody({ a: 1, b: 2 })).toBe(hashRequestBody({ b: 2, a: 1 }));
  });

  it('urutan kunci bersarang juga tidak mengubah hash', () => {
    expect(hashRequestBody({ x: { a: 1, b: 2 } })).toBe(hashRequestBody({ x: { b: 2, a: 1 } }));
  });

  it('urutan ARRAY tetap bermakna — [1,2] bukan [2,1]', () => {
    expect(hashRequestBody([1, 2])).not.toBe(hashRequestBody([2, 1]));
  });

  it('nilai berbeda menghasilkan hash berbeda', () => {
    expect(hashRequestBody({ room_id: 1 })).not.toBe(hashRequestBody({ room_id: 2 }));
  });

  it('membedakan tipe: "1" bukan 1', () => {
    expect(hashRequestBody({ a: '1' })).not.toBe(hashRequestBody({ a: 1 }));
  });

  it('field undefined diabaikan, field null tidak', () => {
    expect(hashRequestBody({ a: 1, b: undefined })).toBe(hashRequestBody({ a: 1 }));
    expect(hashRequestBody({ a: 1, b: null })).not.toBe(hashRequestBody({ a: 1 }));
  });

  it('menerima body bukan objek', () => {
    for (const v of [null, 0, '', false, []]) {
      expect(hashRequestBody(v)).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
