// Enkripsi secret TOTP saat disimpan (SDD-SESS-08): AES-256-GCM dengan kunci aplikasi
// `TOTP_ENCRYPTION_KEY` yang TERPISAH dari kunci JWT — keduanya berbeda siklus rotasinya
// (SDD-04 §5), dan bocornya satu tidak boleh membuka yang lain.
//
// Bentuk tersimpan (`bytea`): `versi(1) || iv(12) || tag(16) || ciphertext`. Byte versi memberi
// ruang rotasi kunci kelak tanpa menebak bentuk baris lama. `aad` mengikat ciphertext pada
// pemiliknya: baris `users` yang secret-nya ditukar ke akun lain gagal didekripsi.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSI = 1;
const PANJANG_KUNCI = 32;
const PANJANG_IV = 12;
const PANJANG_TAG = 16;

export class KotakRahasia {
    private constructor(private readonly kunci: Buffer) {}

    /**
     * Kunci berformat base64 tepat 32 byte (`openssl rand -base64 32`). Galatnya TIDAK memuat
     * nilai masukan — startup mencetak nama variabel, tidak pernah isinya (SDD-16 §4.7).
     */
    static dariBase64(nilai: string): KotakRahasia {
        const teks = nilai.trim();
        const kunci = Buffer.from(teks, "base64");
        if (kunci.toString("base64") !== teks) throw new Error("bukan base64 yang sah");
        if (kunci.length !== PANJANG_KUNCI) {
            throw new Error(`harus tepat ${String(PANJANG_KUNCI)} byte setelah didekode`);
        }
        return new KotakRahasia(kunci);
    }

    enkripsi(isi: Buffer, aad: string): Buffer {
        const iv = randomBytes(PANJANG_IV);
        const cipher = createCipheriv("aes-256-gcm", this.kunci, iv);
        cipher.setAAD(Buffer.from(aad));
        const ciphertext = Buffer.concat([cipher.update(isi), cipher.final()]);
        return Buffer.concat([Buffer.from([VERSI]), iv, cipher.getAuthTag(), ciphertext]);
    }

    /** Melempar bila bentuk, kunci, `aad`, atau isinya tidak cocok — tidak pernah mengembalikan data rusak. */
    dekripsi(kotak: Buffer, aad: string): Buffer {
        if (kotak.length < 1 + PANJANG_IV + PANJANG_TAG || kotak.readUInt8(0) !== VERSI) {
            throw new Error("Bentuk rahasia tersimpan tidak dikenal.");
        }
        const iv = kotak.subarray(1, 1 + PANJANG_IV);
        const tag = kotak.subarray(1 + PANJANG_IV, 1 + PANJANG_IV + PANJANG_TAG);
        const ciphertext = kotak.subarray(1 + PANJANG_IV + PANJANG_TAG);
        const decipher = createDecipheriv("aes-256-gcm", this.kunci, iv);
        decipher.setAAD(Buffer.from(aad));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    }
}
