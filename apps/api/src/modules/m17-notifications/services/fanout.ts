// Siaran in-app & SSE (FR-17.1, NTF-01…NTF-05, SDD-NTF-01/02/05, SDD-08 §4.3/§4.3a;
// keputusan 79). Redis Pub/Sub kanal per pengguna `ntf:user:{id}`: instance API mana pun
// yang memegang koneksi SSE pengguna menerima siaran dari worker atau instance lain.
// Kebenaran tetap di basis data — siaran yang hilang saat Redis putus dapat ditoleransi.

import type { Redis } from "ioredis";
import type { Logger } from "../../../shared/observability/index.js";

export type PesanSiaran =
    | {
          readonly jenis: "notifikasi";
          readonly notifikasi: { readonly id: number; readonly kode: string; readonly judul: string; readonly isi: string; readonly deep_link: string | null; readonly created_at: string };
          readonly unread_count: number;
      }
    | { readonly jenis: "hitungan"; readonly unread_count: number }
    /** NTF-03: perintah menutup koneksi tertentu, di instance mana pun ia berada. */
    | { readonly jenis: "putus"; readonly koneksi: string };

export const kanalPengguna = (userId: number): string => `ntf:user:${String(userId)}`;
/** NTF-03: sorted set koneksi aktif pengguna (skor = waktu sambung, ms). */
const kunciKoneksi = (userId: number): string => `ntf:conn:${String(userId)}`;

/** SDD-08 §4.3: batas koneksi, heartbeat 25 detik, petunjuk retry 5000 ms. */
export const BATAS_KONEKSI = 2;
export const HEARTBEAT_MS = 25_000;
export const RETRY_MS = 5_000;
/** Registri koneksi kedaluwarsa bila instance mati tanpa sempat membersihkan. */
const TTL_REGISTRI_DETIK = Math.ceil((HEARTBEAT_MS * 3) / 1000);

/** Penerbit siaran — dipakai konsumen worker (setelah commit) dan endpoint tandai baca. */
export class PenyiarNotifikasi {
    constructor(
        private readonly redis: Redis,
        private readonly logger: Logger,
    ) {}

    /** Gagal siar hanya dicatat (SDD-NTF-02): notifikasi sudah tersimpan, klien memuat ulang. */
    async siarkan(userId: number, pesan: PesanSiaran): Promise<void> {
        try {
            await this.redis.publish(kanalPengguna(userId), JSON.stringify(pesan));
        } catch (galat) {
            this.logger.error("Siaran notifikasi gagal", galat, { user_id: userId });
        }
    }
}

/** Satu koneksi SSE — dipisah dari Express agar hub dapat diuji tanpa HTTP. */
export interface KlienSse {
    readonly id: string;
    kirim(teks: string): void;
    tutup(): void;
}

export interface OpsiHub {
    /** Koneksi Redis KHUSUS pelanggan — ioredis dalam mode subscribe tak dapat menjalankan perintah lain. */
    readonly pelanggan: Redis;
    readonly redis: Redis;
    readonly logger: Logger;
    /** Jam dinding ms — skor sorted set (urutan sambung), bukan logika bisnis. */
    readonly sekarangMs: () => number;
    readonly batas?: number;
    readonly heartbeatMs?: number;
}

/** Hub SSE satu instance API (SDD-08 §4.3a). */
export class HubSse {
    private readonly lokal = new Map<number, Map<string, KlienSse>>();
    private readonly batas: number;
    private readonly detak: NodeJS.Timeout;

    constructor(private readonly opsi: OpsiHub) {
        this.batas = opsi.batas ?? BATAS_KONEKSI;
        opsi.pelanggan.on("message", (kanal: string, isi: string) => {
            this.terima(kanal, isi);
        });
        // Heartbeat: komentar SSE menahan timeout proxy; registri koneksi disegarkan.
        this.detak = setInterval(() => void this.berdetak(), opsi.heartbeatMs ?? HEARTBEAT_MS);
        this.detak.unref();
    }

    /** Mendaftarkan koneksi; bila melebihi batas global, yang TERLAMA diputus (NTF-03). */
    async sambung(userId: number, klien: KlienSse): Promise<void> {
        let milik = this.lokal.get(userId);
        if (milik === undefined) {
            milik = new Map();
            this.lokal.set(userId, milik);
            await this.opsi.pelanggan.subscribe(kanalPengguna(userId));
        }
        milik.set(klien.id, klien);
        const kunci = kunciKoneksi(userId);
        await this.opsi.redis.zadd(kunci, this.opsi.sekarangMs(), klien.id);
        await this.opsi.redis.expire(kunci, TTL_REGISTRI_DETIK);
        const lebih = (await this.opsi.redis.zcard(kunci)) - this.batas;
        if (lebih > 0) {
            for (const tua of await this.opsi.redis.zrange(kunci, "0", String(lebih - 1))) {
                await this.opsi.redis.zrem(kunci, tua);
                await this.opsi.redis.publish(kanalPengguna(userId), JSON.stringify({ jenis: "putus", koneksi: tua } satisfies PesanSiaran));
            }
        }
    }

    async lepas(userId: number, id: string): Promise<void> {
        const milik = this.lokal.get(userId);
        if (milik?.delete(id) !== true) return;
        await this.opsi.redis.zrem(kunciKoneksi(userId), id);
        if (milik.size === 0) {
            this.lokal.delete(userId);
            await this.opsi.pelanggan.unsubscribe(kanalPengguna(userId));
        }
    }

    /** Jumlah koneksi lokal — untuk uji & pemantauan. */
    jumlahLokal(userId: number): number {
        return this.lokal.get(userId)?.size ?? 0;
    }

    /** Graceful shutdown (SDD-INF-05): tutup seluruh aliran agar server dapat berhenti. */
    async tutup(): Promise<void> {
        clearInterval(this.detak);
        for (const milik of this.lokal.values()) for (const k of milik.values()) k.tutup();
        this.lokal.clear();
        await this.opsi.pelanggan.quit().catch(() => undefined);
    }

    private terima(kanal: string, isi: string): void {
        const userId = Number(kanal.slice("ntf:user:".length));
        const milik = this.lokal.get(userId);
        if (milik === undefined) return;
        let pesan: PesanSiaran;
        try {
            pesan = JSON.parse(isi) as PesanSiaran;
        } catch {
            return;
        }
        if (pesan.jenis === "putus") {
            const k = milik.get(pesan.koneksi);
            if (k !== undefined) {
                k.kirim(`event: putus\ndata: ${JSON.stringify({ alasan: "Koneksi notifikasi dibuka di tempat lain." })}\n\n`);
                k.tutup();
            }
            return;
        }
        const baris = `data: ${JSON.stringify(pesan)}\n\n`;
        for (const k of milik.values()) k.kirim(baris);
    }

    private async berdetak(): Promise<void> {
        for (const [userId, milik] of this.lokal) {
            for (const k of milik.values()) k.kirim(": detak\n\n");
            await this.opsi.redis.expire(kunciKoneksi(userId), TTL_REGISTRI_DETIK).catch((galat: unknown) => {
                this.opsi.logger.error("Penyegaran registri koneksi SSE gagal", galat, { user_id: userId });
            });
        }
    }
}
