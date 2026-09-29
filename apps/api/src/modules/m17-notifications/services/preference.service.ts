// Preferensi notifikasi (FR-17.3, SDD-08 §4.5; UXD-05, keputusan 81). M-17 §11: tanpa aksi
// activity log khusus. Relevansi kelompok per role disaring klien web (keputusan 81d).

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database, KelompokNotifikasi } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { Preferensi } from "../repositories/preference.repository.js";
import { createPreferenceRepository } from "../repositories/preference.repository.js";

/** Urutan Bab 11.3 "Kelompok Notifikasi". */
export const KELOMPOK_NOTIFIKASI: readonly KelompokNotifikasi[] = [
    "PERSETUJUAN",
    "RESERVASI_PEMINJAMAN",
    "DENDA_KEWAJIBAN",
    "KERUSAKAN_PERAWATAN",
    "OPNAME_PENGADAAN",
    "AKUN_SISTEM",
];

/** SDD-08 §4.5 kolom "Ya — seluruhnya": setiap kodenya wajib → tidak dapat dimatikan (FR-17.3 A1). */
export const KELOMPOK_TERKUNCI: ReadonlySet<KelompokNotifikasi> = new Set(["PERSETUJUAN"]);

export interface PreferensiTampil {
    readonly jenis: KelompokNotifikasi;
    readonly in_app: boolean;
    readonly push: boolean;
    readonly terkunci: boolean;
}

export class PreferenceService {
    constructor(private readonly db: Kysely<Database>) {}

    async baca(ctx: AuthContext): Promise<readonly PreferensiTampil[]> {
        const tersimpan = await withTransaction(ctx, (s) => createPreferenceRepository(s.tx).milik(s.ctx), this.db);
        const peta = new Map(tersimpan.map((p) => [p.jenis, p]));
        return KELOMPOK_NOTIFIKASI.map((jenis) => ({
            jenis,
            in_app: peta.get(jenis)?.inApp ?? true,
            push: peta.get(jenis)?.push ?? true,
            terkunci: KELOMPOK_TERKUNCI.has(jenis),
        }));
    }

    /** FR-17.3 langkah 3 — berlaku seketika (AC 1): dibaca konsumen & job saat kirim. */
    async simpan(ctx: AuthContext, daftar: readonly Preferensi[]): Promise<readonly PreferensiTampil[]> {
        daftar.forEach((p, i) => {
            if (KELOMPOK_TERKUNCI.has(p.jenis) && (!p.inApp || !p.push)) {
                throw new DomainError("VALIDATION_ERROR", "Notifikasi persetujuan wajib dan tidak dapat dinonaktifkan.", { field: `preferensi.${String(i)}.jenis` });
            }
            // Keputusan 81c: push membaca notifikasi tersimpan — tanpa in-app tak ada push.
            if (!p.inApp && p.push) {
                throw new DomainError("VALIDATION_ERROR", "Push hanya dapat aktif bila notifikasi dalam aplikasi aktif.", { field: `preferensi.${String(i)}.push` });
            }
        });
        await withTransaction(ctx, (s) => createPreferenceRepository(s.tx).simpan(s.ctx, daftar), this.db);
        return this.baca(ctx);
    }
}
