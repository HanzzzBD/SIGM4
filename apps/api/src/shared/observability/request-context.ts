// Konteks permintaan (SDD-OBS-03).
//
// `request_id` dibangkitkan di edge, dipropagasi lewat SELURUH lapisan termasuk
// worker dan job, muncul di respons sebagai `X-Request-Id`, dan ikut pada entri
// activity log. Karena itu ia tidak dapat dititipkan sebagai argumen di setiap
// pemanggilan: jalurnya melewati service, repository, EventBus, sampai worker
// yang memungut pekerjaan dari antrean.
//
// AsyncLocalStorage adalah satu-satunya cara membawanya tanpa mengubah tanda
// tangan setiap fungsi. Ia sengaja TIDAK dipakai untuk AuthContext: SDD-AUTH-02
// mewajibkan ctx sebagai parameter, justru agar kelalaian gagal saat kompilasi.

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  readonly requestId: string;
  /** Modul yang sedang menangani — mengisi field wajib `modul` pada log. */
  readonly modul: string;
  readonly userId?: number;
  readonly role?: string;
}

const penyimpanan = new AsyncLocalStorage<RequestContext>();

/** Membangkitkan `request_id` baru. Prefiks membuatnya dikenali di agregator. */
export function requestIdBaru(): string {
  return `req_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
}

/** Menjalankan `fn` dengan konteks terpasang; seluruh await di dalamnya mewarisinya. */
export function denganKonteks<T>(ctx: RequestContext, fn: () => T): T {
  return penyimpanan.run(ctx, fn);
}

/** Konteks yang sedang berlaku, atau `undefined` di luar permintaan/job. */
export function konteksSaatIni(): RequestContext | undefined {
  return penyimpanan.getStore();
}

/**
 * Menurunkan konteks anak — dipakai worker saat memungut pekerjaan yang lahir
 * dari sebuah permintaan, agar `request_id` asalnya tidak putus (`SDD-OBS-03`).
 */
export function konteksTurunan(induk: RequestContext, modul: string): RequestContext {
  return { ...induk, modul };
}
