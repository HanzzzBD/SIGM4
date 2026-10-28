// Pembungkus pekerjaan terjadwal berpelaku SYSTEM (SDD-03 §5, AL-06, JOB-05).
//
// Satu-satunya tempat `SystemAuthContext` dibentuk — pabriknya tertutup bagi
// lapisan HTTP oleh lint (SDD-03 §6). Setiap eksekusi, berhasil maupun gagal,
// meninggalkan satu entri ringkasan `SCHEDULED_JOB_EXECUTED` (JOB-05; aksi milik
// M-18, keputusan 70 log phase-02).

import type { Kysely } from "kysely";
import type { AuditLogger } from "../shared/audit/index.js";
import { createSystemAuthContext } from "../shared/auth/system-context.js";
import type { SystemAuthContext } from "../shared/auth/system-context.js";
import type { Clock } from "../shared/clock/index.js";
import type { Database } from "../shared/db/index.js";

export const AKSI_RINGKASAN = "SCHEDULED_JOB_EXECUTED";
const MODUL_RINGKASAN = "m18-activity-log";

export interface RingkasanPekerjaan {
    /** Jumlah record yang diproses (JOB-05). */
    readonly diproses: number;
    /** Jumlah galat per record yang ditangani tanpa menggagalkan pekerjaan (JOB-05). */
    readonly galat: number;
    /** Rincian khusus pekerjaan, mis. jumlah yang terblokir. */
    readonly rincian?: Readonly<Record<string, unknown>>;
}

export interface OpsiPekerjaanSistem {
    readonly nama: string;
    readonly db: Kysely<Database>;
    readonly audit: AuditLogger;
    readonly clock: Clock;
}

/**
 * Menjalankan `kerja` sebagai pelaku SYSTEM lalu mencatat ringkasannya. Galat yang
 * lolos dari `kerja` dicatat `GAGAL` (AL-07) lalu DILEMPAR ULANG agar BullMQ
 * mencoba lagi (JOB-06) — ringkasan tidak boleh menelannya.
 */
export async function jalankanPekerjaanSistem(
    opsi: OpsiPekerjaanSistem,
    kerja: (ctx: SystemAuthContext) => Promise<RingkasanPekerjaan>,
): Promise<RingkasanPekerjaan> {
    const mulai = opsi.clock.now();
    let ringkasan: RingkasanPekerjaan | undefined;
    let galat: unknown;
    try {
        ringkasan = await kerja(createSystemAuthContext(opsi.nama));
        return ringkasan;
    } catch (e) {
        galat = e;
        throw e;
    } finally {
        const gagal = ringkasan === undefined;
        await opsi.db.transaction().execute((tx) =>
            opsi.audit.writeSystem(tx, opsi.nama, {
                modul: MODUL_RINGKASAN,
                aksi: AKSI_RINGKASAN,
                nilaiSesudah: {
                    pekerjaan: opsi.nama,
                    mulai: mulai.toISOString(),
                    selesai: opsi.clock.now().toISOString(),
                    diproses: ringkasan?.diproses ?? 0,
                    galat: ringkasan?.galat ?? 1,
                    ...(ringkasan?.rincian ?? {}),
                    ...(gagal ? { pesan_galat: galat instanceof Error ? galat.message : String(galat) } : {}),
                },
                // Galat per record tercatat pada jumlahnya; GAGAL = pekerjaan itu sendiri gagal (AL-07).
                hasil: gagal ? "GAGAL" : "SUKSES",
            }),
        );
    }
}
