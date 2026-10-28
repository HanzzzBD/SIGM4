// Pekerjaan infrastruktur activity log (SDD-01 §4.6, SDD-05 §4.4): `activity-log-partition`
// (00:20 WIB) dan `activity-log-verify` (00:40 WIB). Keduanya kini berpelaku SYSTEM dan
// meninggalkan ringkasan JOB-05 `SCHEDULED_JOB_EXECUTED` (AL-06, keputusan 72 — utang §10
// log phase-02), sama dengan pekerjaan lain sejak `PR-02-32`.

import type { Kysely } from "kysely";
import { AuditLogger, ensurePartitions, verifyChain } from "../shared/audit/index.js";
import type { Clock } from "../shared/clock/index.js";
import type { Database } from "../shared/db/index.js";
import { Logger } from "../shared/observability/index.js";
import type { RingkasanPekerjaan } from "./system-job.js";
import { jalankanPekerjaanSistem } from "./system-job.js";

export const PEKERJAAN_PARTISI_LOG = "activity-log-partition";
export const PEKERJAAN_VERIFIKASI_LOG = "activity-log-verify";

const auditUntuk = (clock: Clock, nama: string) => new AuditLogger({ clock, logger: new Logger({ clock, modulBawaan: nama }) });

/** Partisi bulan berjalan + 3 ke depan (idempoten, JOB-03); `diproses` = partisi yang dipastikan. */
export async function jalankanPartisiLog(db: Kysely<Database>, clock: Clock): Promise<RingkasanPekerjaan> {
    return jalankanPekerjaanSistem({ nama: PEKERJAAN_PARTISI_LOG, db, audit: auditUntuk(clock, PEKERJAAN_PARTISI_LOG), clock }, async () => {
        const partisi = await ensurePartitions(db, clock);
        return { diproses: partisi.length, galat: 0, rincian: { partisi } };
    });
}

/**
 * Hanya bulan berjalan: rantai diperiksa maju setiap hari, dan bulan lama sudah diperiksa
 * pada harinya; rentang penuh adalah pekerjaan runbook (`SDD-OBS-07`). Rantai rusak =
 * galat (alarm OBS-05) — dicatat GAGAL lalu dilempar ulang; rantai TIDAK diperbaiki,
 * sebab memperbaikinya berarti menghapus buktinya (AL-03a).
 */
export async function jalankanVerifikasiLog(db: Kysely<Database>, clock: Clock): Promise<RingkasanPekerjaan> {
    return jalankanPekerjaanSistem({ nama: PEKERJAAN_VERIFIKASI_LOG, db, audit: auditUntuk(clock, PEKERJAAN_VERIFIKASI_LOG), clock }, async () => {
        const sekarang = clock.now();
        const dari = new Date(Date.UTC(sekarang.getUTCFullYear(), sekarang.getUTCMonth(), 1));
        const sampai = new Date(Date.UTC(sekarang.getUTCFullYear(), sekarang.getUTCMonth() + 1, 1));
        const hasil = await verifyChain(db, dari, sampai);
        if (hasil.kerusakan.length > 0) {
            throw new Error(`Rantai activity log rusak pada ${String(hasil.kerusakan.length)} entri (AL-03a).`);
        }
        return { diproses: hasil.diperiksa, galat: 0 };
    });
}
