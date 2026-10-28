// TOTP RFC 6238 (SHA-1, 6 digit, langkah 30 detik) di atas `node:crypto` — FR-01.5, SDD-04 §4.4.
//
// Sama seperti JWT (`jwt.ts`), permukaannya kecil dan tunggal-bentuk: satu algoritma, satu panjang
// kode, satu periode — semua yang dipahami aplikasi authenticator umum — sehingga tidak perlu
// dependensi baru pada jalur autentikasi (SCA, rantai pasok). Kebenarannya dijaga uji terhadap
// vektor uji RFC 6238 Lampiran B.
//
// Waktu selalu dari `Clock` yang di-inject (SDD-SYS-07): fungsi di sini menerima `Date`.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOTP_DIGIT = 6;
/** Periode langkah TOTP (RFC 6238 §4.1): 30 detik. */
export const TOTP_PERIODE_DETIK = 30;
/** Toleransi jam ±1 langkah = ±30 detik (SDD-04 §4.4). */
export const TOTP_TOLERANSI_LANGKAH = 1;
/** 160 bit, panjang secret yang dianjurkan RFC 4226 §4. */
const PANJANG_SECRET_BYTE = 20;

const ALFABET_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 RFC 4648 tanpa padding — bentuk yang diminta aplikasi authenticator. */
export function base32Encode(data: Buffer): string {
    let bit = 0;
    let nilai = 0;
    let hasil = "";
    for (const byte of data) {
        nilai = (nilai << 8) | byte;
        bit += 8;
        while (bit >= 5) {
            hasil += ALFABET_BASE32[(nilai >>> (bit - 5)) & 31];
            bit -= 5;
        }
        nilai &= (1 << bit) - 1;
    }
    if (bit > 0) hasil += ALFABET_BASE32[(nilai << (5 - bit)) & 31];
    return hasil;
}

/** Kebalikan `base32Encode`; karakter di luar alfabet ditolak, bukan diabaikan. */
export function base32Decode(teks: string): Buffer {
    let bit = 0;
    let nilai = 0;
    const keluaran: number[] = [];
    for (const huruf of teks.toUpperCase()) {
        const indeks = ALFABET_BASE32.indexOf(huruf);
        if (indeks < 0) throw new Error("Karakter base32 tidak sah.");
        nilai = (nilai << 5) | indeks;
        bit += 5;
        if (bit >= 8) {
            keluaran.push((nilai >>> (bit - 8)) & 255);
            bit -= 8;
        }
        nilai &= (1 << bit) - 1;
    }
    return Buffer.from(keluaran);
}

/** Secret acak baru (FR-01.5 langkah 2). */
export function bangkitkanSecretTotp(): Buffer {
    return randomBytes(PANJANG_SECRET_BYTE);
}

/** Nomor langkah TOTP pada `waktu` (RFC 6238 §4.2: `floor(T / X)`). */
export function langkahTotp(waktu: Date): number {
    return Math.floor(waktu.getTime() / 1000 / TOTP_PERIODE_DETIK);
}

/** Kode 6 digit untuk satu langkah (RFC 4226 §5.3 — pemotongan dinamis HMAC-SHA-1). */
export function kodeTotp(secret: Buffer, langkah: number): string {
    const penghitung = Buffer.alloc(8);
    penghitung.writeBigUInt64BE(BigInt(langkah));
    const hmac = createHmac("sha1", secret).update(penghitung).digest();
    const geser = hmac.readUInt8(hmac.length - 1) & 0x0f;
    const biner = hmac.readUInt32BE(geser) & 0x7fffffff;
    return String(biner % 10 ** TOTP_DIGIT).padStart(TOTP_DIGIT, "0");
}

/** Bentuk kode yang diterima; yang lain tidak perlu menghitung HMAC sama sekali. */
export function bentukKodeTotpSah(kode: string): boolean {
    return /^\d{6}$/.test(kode);
}

/**
 * Langkah yang cocok dengan `kode`, atau `undefined`. Ketiga langkah di jendela dihitung dan
 * dibandingkan tanpa pintasan (perbandingan waktu-tetap), lalu langkah yang cocok DITOLAK bila
 * tidak lebih baru dari `langkahTerakhir`: satu kode hanya berlaku sekali (RFC 6238 §5.2).
 */
export function cocokkanTotp(
    secret: Buffer,
    kode: string,
    sekarang: Date,
    langkahTerakhir: number | null,
): number | undefined {
    if (!bentukKodeTotpSah(kode)) return undefined;
    const masukan = Buffer.from(kode);
    const pusat = langkahTotp(sekarang);
    let cocok: number | undefined;
    for (let langkah = pusat - TOTP_TOLERANSI_LANGKAH; langkah <= pusat + TOTP_TOLERANSI_LANGKAH; langkah++) {
        if (timingSafeEqual(masukan, Buffer.from(kodeTotp(secret, langkah)))) cocok = langkah;
    }
    if (cocok === undefined) return undefined;
    return langkahTerakhir !== null && cocok <= langkahTerakhir ? undefined : cocok;
}

/** URI `otpauth://` yang dipindai aplikasi authenticator (QR dirender klien, FR-01.5 langkah 2). */
export function urlOtpauth(secret: Buffer, akun: string, penerbit: string): string {
    const label = `${encodeURIComponent(penerbit)}:${encodeURIComponent(akun)}`;
    const query = new URLSearchParams({
        secret: base32Encode(secret),
        issuer: penerbit,
        algorithm: "SHA1",
        digits: String(TOTP_DIGIT),
        period: String(TOTP_PERIODE_DETIK),
    });
    return `otpauth://totp/${label}?${query.toString()}`;
}
