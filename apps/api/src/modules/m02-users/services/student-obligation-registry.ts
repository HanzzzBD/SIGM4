// Titik ekstensi SL-04 (Lampiran E.4, SDD-05 §4.7d): "penonaktifan diblokir bila
// siswa masih memiliki peminjaman aktif atau kewajiban belum lunas".
//
// Modul pengguna TIDAK mendefinisikan apa itu kewajiban — peminjaman dan denda
// baru ada di Phase 05 (`PR-05-09`). Yang ia sediakan hanya tempat pemeriksa
// mendaftar. Registri KOSONG berarti "belum ada yang mendefinisikan kewajiban",
// bukan "siswa tidak berkewajiban": jangan menafsirkannya sebagai jaminan.

import type { TransactionScope } from "../../../shared/db/index.js";

export interface StudentObligation {
    /** Jenis kewajiban yang dapat dibaca mesin, mis. `PEMINJAMAN_AKTIF`. */
    readonly jenis: string;
    /** Penjelasan Bahasa Indonesia yang ditampilkan kepada Administrator (SL-04). */
    readonly keterangan: string;
}

export interface StudentObligationChecker {
    /** Nama unik pemeriksa — mis. `m09-loans`. */
    readonly nama: string;
    /** Dibaca di dalam transaksi pemanggil agar konsisten dengan penonaktifannya. */
    daftarKewajiban(scope: TransactionScope, userId: number): Promise<readonly StudentObligation[]>;
}

export class StudentObligationRegistry {
    private readonly checkers = new Map<string, StudentObligationChecker>();

    register(...checkers: readonly StudentObligationChecker[]): this {
        for (const checker of checkers) {
            if (this.checkers.has(checker.nama)) {
                throw new Error(`Pemeriksa kewajiban "${checker.nama}" didaftarkan dua kali.`);
            }
            this.checkers.set(checker.nama, checker);
        }
        return this;
    }

    /** Seluruh kewajiban dari seluruh pemeriksa; kosong bila tidak ada. */
    async cek(scope: TransactionScope, userId: number): Promise<readonly StudentObligation[]> {
        const hasil: StudentObligation[] = [];
        for (const checker of this.checkers.values()) {
            hasil.push(...(await checker.daftarKewajiban(scope, userId)));
        }
        return hasil;
    }
}

/** Registri proses ini. API dan worker masing-masing mendaftarkan pemeriksanya saat menyala. */
export const studentObligations = new StudentObligationRegistry();
