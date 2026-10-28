// Siklus hidup berkas (SDD-FS-09, SDD-09 §4.6; PR-03-07): berkas yatim — terunggah tetapi tak pernah
// ditautkan, atau dilepas pemiliknya (foto profil lama, keputusan 7b) — dibersihkan setelah 24 jam
// beserta objek dan turunannya. Baris INFECTED dipertahankan sebagai jejak (keputusan 10d).

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import type { Logger } from "../../../shared/observability/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { createStoredFileRepository } from "../repositories/stored-file.repository.js";

/** Nama pekerjaan terjadwal harian (SDD-01 §4.6). */
export const PEKERJAAN_BERSIH_YATIM = "orphan-file-cleanup";
/** SDD-FS-09. */
export const BATAS_YATIM_MS = 24 * 60 * 60 * 1000;
const UKURAN_BATCH = 200;

export interface HasilBersih {
    readonly diproses: number;
    readonly galat: number;
}

export class FileLifecycleService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly penyimpanan: PenyimpananObjek,
        private readonly logger: Logger,
        private readonly clock: Clock,
    ) {}

    /**
     * Baris dihapus LEBIH DULU (bersyarat masih yatim), baru objeknya: berkas yang ditautkan tepat
     * saat pembersihan tidak pernah kehilangan objeknya. Objek yang gagal dihapus tercatat galat
     * dan tertinggal di storage — lebih ringan daripada dokumen yang menunjuk objek hilang.
     */
    async bersihkanYatim(ctx: AuthContext): Promise<HasilBersih> {
        const batas = new Date(this.clock.now().getTime() - BATAS_YATIM_MS);
        const repo = createStoredFileRepository(this.db);
        const dilewati = new Set<string>();
        let diproses = 0;
        let galat = 0;
        for (;;) {
            const kandidat = (await repo.yatimSebelum(ctx, batas, UKURAN_BATCH + dilewati.size)).filter((b) => !dilewati.has(b.id));
            if (kandidat.length === 0) return { diproses, galat };
            for (const b of kandidat) {
                dilewati.add(b.id);
                try {
                    if (!(await repo.hapusYatim(ctx, b.id))) continue;
                    for (const kunci of [b.object_key, b.thumb_key, b.medium_key]) if (kunci !== null) await this.penyimpanan.hapus(kunci);
                    diproses += 1;
                } catch (e) {
                    galat += 1;
                    this.logger.error("Berkas yatim gagal dibersihkan", e, { file_id: b.id });
                }
            }
        }
    }
}
