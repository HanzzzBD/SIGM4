// Kanonikalisasi baris activity log dan rantai hash (NFR-S-03d, AL-03a,
// SDD-05 §4.4).
//
// Bentuknya ditetapkan sampai ke byte, dan itu bukan kerewelan: `row_hash`
// dihitung sekali saat menulis lalu diperiksa ulang berbulan-bulan kemudian oleh
// job verifikasi. Urutan field atau pemisah yang berbeda antara penulis dan
// pemeriksa menghasilkan rantai yang "terputus" tanpa ada yang menyunting apa pun.

import { createHash } from 'node:crypto';

/** Pemisah field: U+001F UNIT SEPARATOR, yang tidak muncul pada teks yang wajar. */
const PEMISAH = '\u001f';

/** Urutan field pada kanonikalisasi. **Tidak boleh** diubah tanpa migrasi rantai. */
export const URUTAN_FIELD = [
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
] as const;

export type FieldKanonik = (typeof URUTAN_FIELD)[number];
export type BarisKanonik = Readonly<Record<FieldKanonik, unknown>>;

/**
 * JSON dengan kunci terurut, rekursif.
 *
 * `{"a":1,"b":2}` dan `{"b":2,"a":1}` adalah nilai yang sama; tanpa pengurutan,
 * keduanya menghasilkan hash berbeda dan rantai tampak terputus hanya karena
 * urutan kunci berubah di antara dua versi kode.
 */
export function jsonTerurut(nilai: unknown): string {
  if (nilai === null || typeof nilai !== 'object') return JSON.stringify(nilai) ?? 'null';
  if (Array.isArray(nilai)) return `[${nilai.map(jsonTerurut).join(',')}]`;
  const isi = Object.keys(nilai as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${jsonTerurut((nilai as Record<string, unknown>)[k])}`);
  return `{${isi.join(',')}}`;
}

/** Satu field menjadi teks. NULL/undefined menjadi string kosong (`SDD-05 §4.4`). */
function keTeks(nilai: unknown): string {
  if (nilai === null || nilai === undefined) return '';
  if (nilai instanceof Date) return nilai.toISOString(); // ISO-8601 UTC bermilidetik
  if (typeof nilai === 'object') return jsonTerurut(nilai);
  return String(nilai);
}

/** Bentuk kanonik sebuah baris — masukan bagi hash, dan hanya itu. */
export function kanonikal(baris: BarisKanonik): string {
  return URUTAN_FIELD.map((f) => keTeks(baris[f])).join(PEMISAH);
}

/**
 * `row_hash = sha256(prev_hash || kanonikal(baris))` (`SDD-05 §4.4`).
 *
 * `prev_hash` ikut masuk sebagai byte mentah, bukan sebagai teks heksadesimal:
 * itu yang membuat setiap entri terikat pada seluruh riwayat sebelumnya, bukan
 * hanya pada isinya sendiri.
 */
export function hashBaris(prevHash: Buffer | null, baris: BarisKanonik): Buffer {
  const hash = createHash('sha256');
  if (prevHash !== null) hash.update(prevHash);
  hash.update(kanonikal(baris), 'utf8');
  return hash.digest();
}
