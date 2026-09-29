// NotificationService.emit (SDD-08 §4.2 langkah 1–3, §4.2a; keputusan 75c, 78): render
// templat SAAT terbit lalu simpan — satu baris per penerima unik. Dipanggil konsumen
// outbox di worker, di dalam transaksi konsumen itu (notifikasi hanya lahir dari event
// yang sudah commit). Pengiriman SSE/FCM milik PR-02-26/27.

import type { Clock } from "../../../shared/clock/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { NotifikasiBaru } from "../repositories/notification.repository.js";
import { createNotificationRepository } from "../repositories/notification.repository.js";
import { templatUntuk } from "./templates.js";

export interface Terbitan {
    readonly kode: string;
    readonly penerima: readonly number[];
    readonly params: Readonly<Record<string, unknown>>;
    readonly referensi: { readonly jenis: string; readonly id: number } | null;
    readonly deepLink: string | null;
    /**
     * SDD-08 §4.1: `event` = kejadian tunggal (`{kode}:{user}:evt:{event_id}`);
     * `harian` = anti-spam 1×/hari per objek (`{kode}:{user}:{ref_jenis}:{ref_id}:{YYYY-MM-DD}`).
     */
    readonly dedupe: { readonly event: string } | { readonly harian: string };
}

export class NotificationService {
    constructor(private readonly clock: Clock) {}

    /** Mengembalikan notifikasi yang BENAR-BENAR baru (duplikat ditelan) — bahan siaran setelah commit. */
    async emit(scope: TransactionScope, t: Terbitan): Promise<readonly NotifikasiBaru[]> {
        const templat = templatUntuk(t.kode);
        const isi = templat.render(t.params);
        const sekarang = this.clock.now();
        const kunci = (userId: number): string =>
            "event" in t.dedupe
                ? `${t.kode}:${String(userId)}:evt:${t.dedupe.event}`
                : `${t.kode}:${String(userId)}:${t.referensi?.jenis ?? "-"}:${String(t.referensi?.id ?? "-")}:${t.dedupe.harian}`;
        return createNotificationRepository(scope.tx).sisip(
            scope.ctx,
            [...new Set(t.penerima)].map((userId) => ({
                userId,
                kode: t.kode,
                jenis: templat.jenis,
                judul: templat.judul,
                isi,
                params: t.params,
                referensiJenis: t.referensi?.jenis ?? null,
                referensiId: t.referensi?.id ?? null,
                deepLink: t.deepLink,
                wajib: templat.wajib,
                createdAt: sekarang,
                dedupeKey: kunci(userId),
            })),
        );
    }
}
