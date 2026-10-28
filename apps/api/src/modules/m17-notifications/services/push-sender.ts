// Pengirim push FCM (FR-17.2, SDD-NTF-08, SDD-08 §4.4/§4.4a; keputusan 80a, 80e). Target
// = Firebase Installation ID (FID): jalur registration token deprecated di firebase-admin 14. Dipisah
// sebagai antarmuka agar job pengiriman dapat diuji tanpa jaringan Google, dan agar
// ketiadaan `FCM_CREDENTIALS` berarti "push dilewati", bukan proses gagal menyala.

import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import type { App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { KredensialFcm } from "../../../shared/config/index.js";
import type { HealthCheck } from "../../../shared/observability/index.js";

export interface PesanPush {
    readonly kode: string;
    readonly judul: string;
    readonly isi: string;
    readonly deepLink: string | null;
    /** SDD-08 §4.4: `high` untuk notifikasi wajib, `normal` selainnya. */
    readonly prioritasTinggi: boolean;
}

export interface HasilPush {
    /** Jumlah perangkat yang menerima. */
    readonly terkirim: number;
    /** FR-17.2 A2: token tak valid/kedaluwarsa — dihapus pemanggil. */
    readonly tokenMati: readonly string[];
    /** Galat sementara pada perangkat yang TIDAK mati — dasar percobaan ulang (A3). */
    readonly galatSementara: string | null;
}

export interface PengirimPush {
    readonly aktif: boolean;
    kirim(tokens: readonly string[], pesan: PesanPush): Promise<HasilPush>;
    tutup(): Promise<void>;
}

/** Kode FCM yang berarti perangkat tak akan pernah terjangkau lagi (FR-17.2 A2, SDD-08 §4.4). */
const KODE_TOKEN_MATI = new Set(["messaging/installation-id-not-registered", "messaging/registration-token-not-registered"]);

/** Payload ringan tanpa data finansial/identitas pihak lain — tampil di layar terkunci (BR-073). */
export function bentukPesanFcm(tokens: readonly string[], p: PesanPush) {
    return {
        fids: [...tokens],
        notification: { title: p.judul, body: p.isi },
        data: { kode: p.kode, deep_link: p.deepLink ?? "" },
        android: { priority: p.prioritasTinggi ? ("high" as const) : ("normal" as const) },
        apns: { headers: { "apns-priority": p.prioritasTinggi ? "10" : "5" } },
    };
}

export class PengirimFcm implements PengirimPush {
    readonly aktif = true;
    private readonly app: App;

    constructor(kredensial: KredensialFcm, nama = "sigm4-fcm") {
        this.app = initializeApp({ credential: cert({ projectId: kredensial.projectId, clientEmail: kredensial.clientEmail, privateKey: kredensial.privateKey }) }, nama);
    }

    async kirim(tokens: readonly string[], pesan: PesanPush): Promise<HasilPush> {
        if (tokens.length === 0) return { terkirim: 0, tokenMati: [], galatSementara: null };
        const hasil = await getMessaging(this.app).sendEachForMulticast(bentukPesanFcm(tokens, pesan));
        const tokenMati: string[] = [];
        let galatSementara: string | null = null;
        hasil.responses.forEach((r, i) => {
            if (r.success) return;
            const kode = r.error?.code ?? "";
            if (KODE_TOKEN_MATI.has(kode)) tokenMati.push(tokens[i]!);
            else galatSementara ??= kode || "galat FCM tak dikenal";
        });
        return { terkirim: hasil.successCount, tokenMati, galatSementara };
    }

    async tutup(): Promise<void> {
        await deleteApp(this.app);
    }
}

/** Tanpa `FCM_CREDENTIALS`: tidak ada yang dikirim; pengiriman dicatat `DILEWATI`. */
export const PENGIRIM_NONAKTIF: PengirimPush = {
    aktif: false,
    kirim: () => Promise.resolve({ terkirim: 0, tokenMati: [], galatSementara: null }),
    tutup: () => Promise.resolve(),
};

export function buatPengirimPush(kredensial: KredensialFcm | null): PengirimPush {
    return kredensial === null ? PENGIRIM_NONAKTIF : new PengirimFcm(kredensial);
}

/** OBS-06: `fcm` dilaporkan di /health, TIDAK menentukan `ready` (SDD-15 §4.5). */
export function fcmCheck(kredensial: KredensialFcm | null): HealthCheck {
    return {
        name: "fcm",
        probe: () =>
            Promise.resolve(
                kredensial === null
                    ? { status: "degraded" as const, note: "FCM_CREDENTIALS tidak dikonfigurasi — push dilewati" }
                    : { status: "up" as const, note: `terkonfigurasi (${kredensial.projectId})` },
            ),
    };
}
