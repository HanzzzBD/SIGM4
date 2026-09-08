// Kanonikalisasi dan rantai hash (NFR-S-03d, AL-03a, SDD-05 §4.4).
//
// Bagian yang tidak menuntut PostgreSQL. Nilainya justru tinggi di sini: bentuk
// kanonik menentukan hash sampai ke byte, dan perubahannya yang tak disengaja
// membuat seluruh rantai lama gagal diverifikasi tanpa ada yang menyunting apa pun.

import { describe, expect, it } from 'vitest';
import { URUTAN_FIELD, hashBaris, jsonTerurut, kanonikal } from '../../src/shared/audit/index.js';
import type { BarisKanonik } from '../../src/shared/audit/index.js';

const baris = (ubah: Partial<Record<string, unknown>> = {}): BarisKanonik =>
  ({
    waktu: new Date('2026-09-08T02:31:44.000Z'),
    user_id: 42,
    user_nama: 'Sari Wulandari',
    role: 'PETUGAS_SARPRAS',
    ip: '192.168.1.24',
    user_agent: 'SIGM4-Mobile/1.2.0',
    modul: 'INVENTARIS',
    aksi: 'ASSET_CONDITION_CHANGED',
    entitas: 'assets',
    entitas_id: 3021,
    nilai_sebelum: { kondisi: 'BAIK' },
    nilai_sesudah: { kondisi: 'RUSAK_RINGAN' },
    keterangan: 'Layar retak saat pengembalian',
    hasil: 'SUKSES',
    request_id: 'req_01J8XK2',
    ...ubah,
  }) as BarisKanonik;

describe('urutan field kanonik', () => {
  it('memuat lima belas field 21.2, tanpa id dan tanpa hash', () => {
    expect(URUTAN_FIELD).toHaveLength(15);
    expect(URUTAN_FIELD).not.toContain('id');
    expect(URUTAN_FIELD).not.toContain('row_hash');
  });

  it('urutannya tetap — mengubahnya membatalkan seluruh rantai lama', () => {
    expect([...URUTAN_FIELD]).toEqual([
      'waktu',
      'user_id',
      'user_nama',
      'role',
      'ip',
      'user_agent',
      'modul',
      'aksi',
      'entitas',
      'entitas_id',
      'nilai_sebelum',
      'nilai_sesudah',
      'keterangan',
      'hasil',
      'request_id',
    ]);
  });
});

describe('jsonTerurut', () => {
  it('urutan kunci tidak mengubah hasilnya', () => {
    expect(jsonTerurut({ a: 1, b: 2 })).toBe(jsonTerurut({ b: 2, a: 1 }));
  });

  it('mengurutkan kunci bersarang juga', () => {
    expect(jsonTerurut({ x: { b: 1, a: 2 } })).toBe('{"x":{"a":2,"b":1}}');
  });

  it('urutan ARRAY tetap bermakna — [1,2] bukan [2,1]', () => {
    expect(jsonTerurut([1, 2])).not.toBe(jsonTerurut([2, 1]));
  });

  it('membedakan null dari string kosong', () => {
    expect(jsonTerurut(null)).not.toBe(jsonTerurut(''));
  });
});

describe('kanonikal', () => {
  it('memisahkan field dengan U+001F, bukan spasi', () => {
    expect(kanonikal(baris())).toContain('\u001f');
    expect(kanonikal(baris()).split('\u001f')).toHaveLength(15);
  });

  it('NULL dan undefined sama-sama menjadi string kosong', () => {
    const a = kanonikal(baris({ keterangan: null }));
    const b = kanonikal(baris({ keterangan: undefined }));
    expect(a).toBe(b);
  });

  it('waktu ditulis ISO-8601 UTC bermilidetik', () => {
    expect(kanonikal(baris())).toContain('2026-09-08T02:31:44.000Z');
  });

  it('jsonb ikut dikanonikalisasi — urutan kunci tidak mengubah hasil', () => {
    const a = kanonikal(baris({ nilai_sesudah: { a: 1, b: 2 } }));
    const b = kanonikal(baris({ nilai_sesudah: { b: 2, a: 1 } }));
    expect(a).toBe(b);
  });

  it('field yang berpindah nilai menghasilkan teks berbeda', () => {
    expect(kanonikal(baris({ modul: 'BAHAN' }))).not.toBe(kanonikal(baris()));
  });

  it('nilai yang berpindah KOLOM tetap terdeteksi — pemisah menjaga batas field', () => {
    // Tanpa pemisah, 'AB'+'C' dan 'A'+'BC' menghasilkan teks yang sama.
    const a = kanonikal(baris({ modul: 'AB', aksi: 'C' }));
    const b = kanonikal(baris({ modul: 'A', aksi: 'BC' }));
    expect(a).not.toBe(b);
  });
});

describe('hashBaris (NFR-S-03d)', () => {
  it('menghasilkan SHA-256 sepanjang 32 byte', () => {
    expect(hashBaris(null, baris())).toHaveLength(32);
  });

  it('deterministik untuk masukan yang sama', () => {
    expect(hashBaris(null, baris())).toEqual(hashBaris(null, baris()));
  });

  it('prev_hash IKUT masuk — entri yang sama pada rantai berbeda berbeda hash', () => {
    const p1 = Buffer.alloc(32, 1);
    const p2 = Buffer.alloc(32, 2);
    expect(hashBaris(p1, baris())).not.toEqual(hashBaris(p2, baris()));
    expect(hashBaris(null, baris())).not.toEqual(hashBaris(p1, baris()));
  });

  it('perubahan satu karakter mengubah hash', () => {
    expect(hashBaris(null, baris({ keterangan: 'Layar retak saat pengembalian.' }))).not.toEqual(
      hashBaris(null, baris()),
    );
  });

  it('setiap field ikut terhitung — tak satu pun terlewat dari hash', () => {
    const dasar = hashBaris(null, baris());
    for (const field of URUTAN_FIELD) {
      const diubah = hashBaris(null, baris({ [field]: 'NILAI-BERBEDA-UNTUK-UJI' }));
      expect(diubah, `field ${field} tidak ikut terhitung`).not.toEqual(dasar);
    }
  });
});
