// Titik perluasan linimasa aset (FR-04.2 langkah 5; keputusan 4b log phase-03, PR-03-24). Setiap modul
// pemilik riwayat mendaftarkan SUMBER-nya — fragmen SQL atas tabel miliknya sendiri — sehingga M-04 tak
// pernah membaca tabel modul lain (SDD-SYS-03) dan satu linimasa tetap terpaginasi di basis data
// (SDD-API-05). Pendaftar: M-04 (KONDISI, MUTASI), M-06 (DOKUMEN), M-11 (KERUSAKAN); kelak M-12, M-09.

import type { RawBuilder } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";

export interface SumberLinimasaAset {
    /** Nilai `jenis` entri — unik per sumber (`EntriLinimasaAsetSchema`). */
    readonly jenis: string;
    /**
     * Fragmen `SELECT id::text AS id, <timestamptz> AS waktu, <jsonb> AS data` atas riwayat satu aset.
     * `null` = jenis ini tidak boleh dilihat pemanggil (mis. DOKUMEN bagi Siswa/OSIS, FR-04.2 A1).
     */
    fragmen(ctx: AuthContext, assetId: number): RawBuilder<unknown> | null;
}

export class RegistriSumberLinimasa {
    private readonly sumber = new Map<string, SumberLinimasaAset>();

    daftar(...sumber: readonly SumberLinimasaAset[]): this {
        for (const s of sumber) {
            if (this.sumber.has(s.jenis)) throw new Error(`Sumber linimasa "${s.jenis}" didaftarkan dua kali.`);
            this.sumber.set(s.jenis, s);
        }
        return this;
    }

    cari(jenis: string): SumberLinimasaAset | undefined {
        return this.sumber.get(jenis);
    }

    semua(): readonly SumberLinimasaAset[] {
        return [...this.sumber.values()];
    }
}

/** Registri proses ini — API memasang pendaftar saat menyala (`registration.ts` tiap modul). */
export const sumberLinimasaAset = new RegistriSumberLinimasa();
