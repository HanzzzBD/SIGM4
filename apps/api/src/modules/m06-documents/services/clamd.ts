// Klien clamd (SDD-FS-04: ClamAV sebagai proses terpisah) — protokol TCP `zINSTREAM`/`zPING`,
// tanpa pustaka tambahan. Perintah berawalan `z` diakhiri NUL; isi berkas dikirim berpotongan
// `[panjang uint32 BE][data]` dan ditutup potongan berpanjang nol.

import { connect } from "node:net";
import type { KonfigurasiAntivirus } from "../../../shared/config/index.js";

/** Putusan clamd atas satu aliran. */
export type PutusanClamd = { readonly bersih: true } | { readonly bersih: false; readonly tanda: string };

export interface PemindaiVirus {
    pindai(isi: Buffer): Promise<PutusanClamd>;
    ping(): Promise<void>;
}

/** Potongan aliran; jauh di bawah `StreamMaxLength` bawaan clamd (25 MB). */
const UKURAN_POTONGAN = 64 * 1024;

export class KlienClamd implements PemindaiVirus {
    constructor(
        private readonly alamat: KonfigurasiAntivirus,
        /** Batas satu percakapan; berkas terbesar 10 MB (SDD-09 §4.3). */
        private readonly batasMs = 60_000,
    ) {}

    async pindai(isi: Buffer): Promise<PutusanClamd> {
        const potongan: Buffer[] = [Buffer.from("zINSTREAM\0")];
        for (let i = 0; i < isi.length; i += UKURAN_POTONGAN) {
            const bagian = isi.subarray(i, i + UKURAN_POTONGAN);
            const panjang = Buffer.alloc(4);
            panjang.writeUInt32BE(bagian.length);
            potongan.push(panjang, bagian);
        }
        potongan.push(Buffer.alloc(4));
        return uraiJawaban(await this.bicara(Buffer.concat(potongan)));
    }

    async ping(): Promise<void> {
        const jawaban = await this.bicara(Buffer.from("zPING\0"));
        if (jawaban !== "PONG") throw new Error(`clamd menjawab PING dengan "${jawaban}".`);
    }

    /** Satu koneksi per perintah: kirim, lalu baca jawaban sampai NUL. */
    private bicara(perintah: Buffer): Promise<string> {
        return new Promise((selesai, gagal) => {
            const soket = connect(this.alamat.port, this.alamat.host);
            const terima: Buffer[] = [];
            soket.setTimeout(this.batasMs, () => soket.destroy(new Error("clamd tidak menjawab dalam batas waktu.")));
            soket.on("connect", () => soket.end(perintah));
            soket.on("data", (d: Buffer) => terima.push(d));
            soket.on("error", gagal);
            soket.on("close", () => selesai(Buffer.concat(terima).toString("utf8").replace(/\0+$/, "").trim()));
        });
    }
}

/** `stream: OK` · `stream: <tanda> FOUND` · selain itu (mis. `… ERROR`) galat yang dicoba ulang. */
export function uraiJawaban(jawaban: string): PutusanClamd {
    if (jawaban === "stream: OK") return { bersih: true };
    const temuan = /^stream: (.+) FOUND$/.exec(jawaban);
    if (temuan !== null) return { bersih: false, tanda: temuan[1]! };
    throw new Error(`Jawaban clamd tak dikenali: "${jawaban}".`);
}
