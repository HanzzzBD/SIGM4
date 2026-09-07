// Clock yang di-inject (SDD-SYS-07). `new Date()` langsung dilarang lint di luar
// berkas ini — lihat apps/api/eslint.config.js.
//
// Alasannya bukan kerapian: TD-04 mewajibkan pengujian jatuh tempo, TTL slot, SLA,
// dan eskalasi — seluruhnya bergantung pada waktu. Tanpa Clock yang dapat diganti,
// pengujiannya menjadi menunggu atau memanipulasi jam sistem; keduanya rapuh.

/** Sumber waktu tunggal bagi seluruh aplikasi. */
export interface Clock {
  /** Waktu sekarang. Selalu UTC — konversi ke WIB milik lapisan penyajian (NFR-C-10). */
  now(): Date;
}

/** Implementasi produksi. Satu-satunya tempat `new Date()` boleh dipanggil. */
export class SystemClock implements Clock {
  now(): Date {
    // Pengecualian aturan ada di apps/api/eslint.config.js sebagai POLA BERKAS,
    // bukan komentar sebaris — komentar sebaris dapat disalin ke berkas lain.
    return new Date();
  }
}

/**
 * Clock tetap untuk pengujian. Berada di jalur produksi dengan sengaja: ia bagian
 * dari kontrak `Clock`, bukan data uji — dan menaruhnya di berkas uji berarti tiap
 * modul menulis ulang tiruannya sendiri, lalu berbeda-beda.
 */
export class FixedClock implements Clock {
  constructor(private saat: Date) {}

  now(): Date {
    return new Date(this.saat.getTime());
  }

  /** Memajukan waktu; mengembalikan waktu baru agar dapat dirangkai di dalam uji. */
  advance(milidetik: number): Date {
    this.saat = new Date(this.saat.getTime() + milidetik);
    return this.now();
  }
}
