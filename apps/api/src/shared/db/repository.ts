// Base repository (SDD-AUTH-02, PM-03). Yang ditegakkan di sini adalah BENTUK
// metode repository, bukan isi filternya: penerjemahan scope -> klausa WHERE
// (SDD-03 §4.2) milik repository tiap modul, karena kolom pemiliknya berbeda-beda.

import type { AuthContext } from '../auth/index.js';
import { assertAuthContext } from '../auth/index.js';
import type { QueryExecutor } from './transaction.js';

/**
 * Batasan tipe: setiap metode publik repository menerima `AuthContext` sebagai
 * argumen PERTAMA. Metode yang tidak menerimanya dipetakan ke `never`, sehingga
 * repository-nya tidak dapat dikompilasi.
 *
 * Inilah bentuk teknis dari "tidak ada nilai bawaan" pada `SDD-AUTH-02`: pemanggil
 * yang lupa mengirim scope gagal di waktu kompilasi, bukan mengembalikan seluruh
 * baris di produksi.
 */
export type ScopedRepository<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => unknown
    ? A extends [AuthContext, ...unknown[]]
      ? T[K]
      : never
    : T[K];
};

/**
 * Gerbang kompilasi. Repository dipublikasikan lewat fungsi ini, bukan diekspor
 * langsung — sebuah aturan yang tidak pernah dijalankan tidak menolak apa pun.
 */
export function defineRepository<T extends ScopedRepository<T>>(repository: T): T {
  return repository;
}

/**
 * Basis repository. Ia memegang eksekutor kueri dan **tidak** pernah memegang
 * `AuthContext`: ctx yang tersimpan di dalam objek adalah ctx yang dapat basi
 * terhadap permintaan yang sedang berjalan.
 */
export abstract class BaseRepository {
  protected constructor(private readonly executor: QueryExecutor) {}

  /**
   * Satu-satunya jalan menuju query builder, dan ia menuntut `ctx` disebut ulang
   * pada setiap kueri. Pemeriksaan runtime menutup celah bagi pemanggil yang
   * menembus tipe lewat cast.
   */
  protected query(ctx: AuthContext): QueryExecutor {
    assertAuthContext(ctx);
    return this.executor;
  }
}
