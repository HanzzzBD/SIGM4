// Sumber notifikasi milik M-10 (SDD-08 §4.2a, keputusan 78): penerima dan rincian
// pengajuan untuk NT-02 … NT-07, NT-47, dihitung di sini dan dipanggil konsumen M-17
// setelah commit. Penerima langkah memakai aturan pemutus sah yang SAMA dengan kotak
// masuk dan keputusan (SDD-APR-16); M-17 tidak menyentuh repository modul ini.

import type { Clock } from "../../../shared/clock/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { createApprovalRepository } from "../repositories/approval.repository.js";
import { createDecisionRepository } from "../repositories/decision.repository.js";
import { tanggalWib } from "./approval.service.js";
import { resolvePemutus } from "./approver-resolver.js";
import type { JenisPengajuan } from "./dsl.js";

/** Isi `{nomor}`/`{objek}`/`{tanggal}` templat + deep link objek (SDD-NTF-09). */
export interface RincianPengajuan {
    /** Penyebut pengajuan, mis. `Reservasi RSV-2026-0012`. */
    readonly label: string;
    readonly objek: string | null;
    readonly tanggal: string | null;
    readonly deepLink: string;
}

/** Didaftarkan modul pengaju per jenis (pola `penanganHasil`, SDD-APR-17). */
export interface PenyediaRincian {
    readonly jenis: JenisPengajuan;
    rincian(scope: TransactionScope, referensiId: number): Promise<RincianPengajuan>;
}

export class RegistriPenyediaRincian {
    private readonly peta = new Map<JenisPengajuan, PenyediaRincian>();

    daftar(...penyedia: readonly PenyediaRincian[]): this {
        for (const p of penyedia) {
            if (this.peta.has(p.jenis)) throw new Error(`Penyedia rincian ganda untuk ${p.jenis}.`);
            this.peta.set(p.jenis, p);
        }
        return this;
    }

    cari(jenis: JenisPengajuan): PenyediaRincian | undefined {
        return this.peta.get(jenis);
    }
}

/** Registri proses ini — pendaftar: modul pengaju (PR-03-10 dst.). */
export const penyediaRincian = new RegistriPenyediaRincian();

/** Label jenis pengajuan (FR-10.1 langkah 2) — dipakai render generik. */
const LABEL_JENIS: Readonly<Record<JenisPengajuan, string>> = {
    RESERVASI_RUANGAN: "Reservasi Ruangan",
    RESERVASI_ASET: "Reservasi Aset",
    PERPANJANGAN_PEMINJAMAN: "Perpanjangan Peminjaman",
    PENGADAAN_BARANG: "Pengadaan Barang",
    PENGHAPUSAN_ASET: "Penghapusan Aset",
    PERMINTAAN_BAHAN: "Permintaan Bahan",
};

export interface SumberNotifikasiApproval {
    readonly jenis: JenisPengajuan;
    readonly referensiId: number;
    readonly pemohonId: number;
    readonly rincian: RincianPengajuan;
}

/**
 * Rincian pengajuan sebuah instance: dari penyedia jenisnya, atau generik
 * `"{jenis} #{referensi_id}"` + deep link ke linimasa bila belum ada penyedia.
 */
export async function sumberNotifikasiApproval(
    scope: TransactionScope,
    instanceId: number,
    registri: RegistriPenyediaRincian = penyediaRincian,
): Promise<SumberNotifikasiApproval | undefined> {
    const inst = await createDecisionRepository(scope.tx).instance(scope.ctx, instanceId);
    if (inst === undefined) return undefined;
    const penyedia = registri.cari(inst.jenis);
    const rincian =
        penyedia === undefined
            ? { label: `Pengajuan ${LABEL_JENIS[inst.jenis]} #${String(inst.referensiId)}`, objek: null, tanggal: null, deepLink: `/persetujuan/${String(instanceId)}` }
            : await penyedia.rincian(scope, inst.referensiId);
    return { jenis: inst.jenis, referensiId: inst.referensiId, pemohonId: inst.pemohonId, rincian };
}

/** Pemutus sah langkah `urutan` HARI INI (SDD-APR-16): pemegang aktif, delegasi, pemohon dikeluarkan. */
export async function pemutusLangkah(scope: TransactionScope, clock: Clock, instanceId: number, urutan: number): Promise<readonly number[]> {
    const keputusan = createDecisionRepository(scope.tx);
    const inst = await keputusan.instance(scope.ctx, instanceId);
    const target = inst === undefined ? undefined : await keputusan.target(scope.ctx, instanceId, urutan);
    if (inst === undefined || target === undefined) return [];
    const repo = createApprovalRepository(scope.tx);
    const pemegang = await repo.pemegangAktif(scope.ctx, target);
    const delegasi = await repo.delegasiBerlaku(scope.ctx, pemegang, tanggalWib(clock.now()));
    return resolvePemutus(pemegang, delegasi, inst.pemohonId).pemutus.map((p) => p.userId);
}

/** Catatan keputusan langkah `urutan` — `{alasan}` NT-03 / `{catatan}` NT-04. */
export async function catatanLangkah(scope: TransactionScope, instanceId: number, urutan: number): Promise<string | null> {
    return createDecisionRepository(scope.tx).catatan(scope.ctx, instanceId, urutan);
}
