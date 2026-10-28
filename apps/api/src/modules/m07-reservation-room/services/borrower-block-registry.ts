// Titik ekstensi BR-030 (FR-07.2 A5, FR-08.2 A3; keputusan 14d log phase-03): pemohon yang
// diblokir — peminjaman terlambat atau denda melewati ambang — tidak dapat mengajukan reservasi.
//
// Modul reservasi TIDAK mendefinisikan apa itu blokir: peminjaman dan denda lahir di Phase 04–05
// dan mendaftarkan pemeriksanya ke sini (pola `studentObligations`, SL-04). Registri KOSONG berarti
// "belum ada yang mendefinisikan blokir", bukan jaminan pemohon bebas kewajiban.

import type { TransactionScope } from "../../../shared/db/index.js";

export interface AlasanBlokir {
    /** Jenis yang dapat dibaca mesin, mis. `DENDA_BELUM_LUNAS`. */
    readonly jenis: string;
    /** Penjelasan Bahasa Indonesia yang ditampilkan kepada pemohon (UX P-29 `422 BORROWER_BLOCKED`). */
    readonly keterangan: string;
}

export interface PemeriksaBlokir {
    /** Nama unik pemeriksa — mis. `m09-loans`. */
    readonly nama: string;
    /** Dibaca di dalam transaksi pengajuan agar konsisten dengannya. */
    alasanBlokir(scope: TransactionScope, pemohonId: number): Promise<readonly AlasanBlokir[]>;
}

export class RegistriBlokirPemohon {
    private readonly pemeriksa = new Map<string, PemeriksaBlokir>();

    daftar(...pemeriksa: readonly PemeriksaBlokir[]): this {
        for (const p of pemeriksa) {
            if (this.pemeriksa.has(p.nama)) throw new Error(`Pemeriksa blokir "${p.nama}" didaftarkan dua kali.`);
            this.pemeriksa.set(p.nama, p);
        }
        return this;
    }

    /** Seluruh alasan dari seluruh pemeriksa; kosong bila tidak diblokir (atau belum ada pemeriksa). */
    async periksa(scope: TransactionScope, pemohonId: number): Promise<readonly AlasanBlokir[]> {
        const hasil: AlasanBlokir[] = [];
        for (const p of this.pemeriksa.values()) hasil.push(...(await p.alasanBlokir(scope, pemohonId)));
        return hasil;
    }
}

/** Registri proses ini — pendaftar: modul peminjaman & denda (Phase 04–05). */
export const blokirPemohon = new RegistriBlokirPemohon();
