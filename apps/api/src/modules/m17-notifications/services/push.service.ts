// Pengiriman push satu notifikasi (FR-17.2 langkah 2, A2–A4; SDD-NTF-08; SDD-08 §4.4a;
// keputusan 80c). Dijalankan job worker `notification-push` (percobaan ulang 3×, JOB-06)
// berpelaku SYSTEM — di luar transaksi bisnis mana pun, sehingga kegagalan FCM tidak
// pernah menggagalkan transaksi pemicunya (FR-17.2 AC 4, NFR-A-06).

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { createDeliveryRepository } from "../repositories/delivery.repository.js";
import { createDeviceTokenRepository } from "../repositories/device-token.repository.js";
import { createPreferenceRepository } from "../repositories/preference.repository.js";
import type { PengirimPush } from "./push-sender.js";
import { TEMPLAT } from "./templates.js";

export interface PushDeps {
    readonly db: Kysely<Database>;
    readonly clock: Clock;
    readonly ctx: AuthContext;
    readonly pengirim: PengirimPush;
}

export type HasilKirimPush = "TERKIRIM" | "DILEWATI" | "GAGAL" | "DIULANG";

/** Dilempar agar antrean mencoba lagi (FR-17.2 A3); status `MENUNGGU` sudah tercatat. */
export class PushPerluDiulang extends Error {
    constructor(sebab: string) {
        super(`Push perlu diulang: ${sebab}`);
        this.name = "PushPerluDiulang";
    }
}

/**
 * @param percobaan  percobaan ke-n (1-based) — dicatat pada `attempts`.
 * @param terakhir   percobaan terakhir: galat sementara dicatat `GAGAL`, bukan diulang.
 */
export async function kirimPushNotifikasi(deps: PushDeps, notifikasiId: number, percobaan: number, terakhir: boolean): Promise<HasilKirimPush> {
    const jalankan = <T>(kerja: Parameters<typeof withTransaction<T>>[1]) => withTransaction(deps.ctx, kerja, deps.db);
    const n = await jalankan((s) => createDeliveryRepository(s.tx).notifikasi(s.ctx, notifikasiId));
    if (n === undefined) return "DILEWATI"; // sudah diarsipkan/dihapus — tak ada yang dikirim
    const tokens = await jalankan((s) => createDeviceTokenRepository(s.tx).milikPengguna(s.ctx, n.userId));

    const catat = (status: "TERKIRIM" | "DILEWATI" | "GAGAL" | "MENUNGGU", galat: string | null) =>
        jalankan((s) => createDeliveryRepository(s.tx).catat(s.ctx, notifikasiId, status, percobaan, galat, status === "TERKIRIM" ? deps.clock.now() : null));

    // SDD-NTF-06 (keputusan 81b): push non-wajib yang dimatikan pengguna — diperiksa saat kirim.
    if (!n.wajib && (await jalankan((s) => createPreferenceRepository(s.tx).pushDimatikan(s.ctx, n.userId, n.jenis)))) {
        await catat("DILEWATI", "dimatikan preferensi pengguna");
        return "DILEWATI";
    }

    // FR-17.2 A1: tanpa perangkat (atau FCM tak dikonfigurasi) notifikasi tetap ada in-app.
    if (!deps.pengirim.aktif || tokens.length === 0) {
        await catat("DILEWATI", deps.pengirim.aktif ? "pengguna tanpa perangkat terdaftar" : "FCM_CREDENTIALS tidak dikonfigurasi");
        return "DILEWATI";
    }

    let hasil;
    try {
        // SDD-08 §4.2 (keputusan 87c): isi push tidak menyebut identitas pengguna lain — layar terkunci.
        hasil = await deps.pengirim.kirim(tokens, { kode: n.kode, judul: n.judul, isi: TEMPLAT[n.kode]?.isiPush ?? n.isi, deepLink: n.deepLink, prioritasTinggi: n.wajib });
    } catch (galat) {
        // Kegagalan total (jaringan, kredensial) — sama dengan galat sementara.
        hasil = { terkirim: 0, tokenMati: [], galatSementara: galat instanceof Error ? galat.message : String(galat) };
    }
    // FR-17.2 A2: token mati dihapus apa pun hasil perangkat lain.
    if (hasil.tokenMati.length > 0) await jalankan((s) => createDeviceTokenRepository(s.tx).hapus(s.ctx, hasil.tokenMati));

    if (hasil.terkirim > 0) {
        await catat("TERKIRIM", hasil.galatSementara);
        return "TERKIRIM";
    }
    if (hasil.galatSementara === null) {
        await catat("DILEWATI", "seluruh perangkat tidak valid — token dihapus");
        return "DILEWATI";
    }
    if (terakhir) {
        await catat("GAGAL", hasil.galatSementara);
        return "GAGAL";
    }
    await catat("MENUNGGU", hasil.galatSementara);
    throw new PushPerluDiulang(hasil.galatSementara);
}
