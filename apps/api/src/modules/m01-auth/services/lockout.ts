// Aritmetika penguncian akun (FR-01.1 A2, SDD-SESS-06/07, NFR-S-07). Fungsi murni: waktu
// datang dari pemanggil (`Clock`, SDD-SYS-07), sehingga seluruh cabangnya dapat diuji tanpa
// basis data.
//
// Jendela TETAP: kegagalan pertama memulai jendela 15 menit; kegagalan berikutnya di dalam
// jendela menambah hitungan; jendela yang lewat memulai hitungan baru. Sebuah akun terkunci
// bila mencapai `BATAS_GAGAL` di dalam satu jendela, selama `DURASI_KUNCI_MS`.

import { KELAS_LIMIT } from "../../../shared/http/index.js";

/** Batas dan jendela sama dengan sumbu IP (`SDD-13 §4.3`): satu angka, dua sumbu. */
export const BATAS_GAGAL = KELAS_LIMIT.login.batas;
export const JENDELA_MS = KELAS_LIMIT.login.jendelaMs;
/** `FR-01.1 A2`: dikunci sementara 15 menit. */
export const DURASI_KUNCI_MS = 15 * 60_000;

export interface StatusGagal {
    readonly hitungan: number;
    readonly awalJendela: Date | null;
    readonly terkunciSampai: Date | null;
}

export type HasilKegagalan =
    | { readonly dihitung: false }
    | {
          readonly dihitung: true;
          readonly status: StatusGagal;
          /** true tepat pada kegagalan yang menyebabkan penguncian, tidak pada kegagalan sesudahnya. */
          readonly terkunciBaru: boolean;
      };

/** Akun sedang terkunci bila `terkunciSampai` masih di depan `sekarang`. */
export function sedangTerkunci(terkunciSampai: Date | null, sekarang: Date): boolean {
    return terkunciSampai !== null && terkunciSampai.getTime() > sekarang.getTime();
}

/**
 * Menerapkan SATU kegagalan password. Percobaan yang datang selagi akun terkunci TIDAK
 * dihitung — kalau dihitung, siapa pun dapat memperpanjang penguncian akun orang lain
 * tanpa batas.
 */
export function terapkanKegagalan(status: StatusGagal, sekarang: Date): HasilKegagalan {
    if (sedangTerkunci(status.terkunciSampai, sekarang)) return { dihitung: false };

    const jendelaLewat =
        status.awalJendela === null || status.awalJendela.getTime() + JENDELA_MS <= sekarang.getTime();
    const hitungan = jendelaLewat ? 1 : status.hitungan + 1;
    const awalJendela = jendelaLewat ? sekarang : status.awalJendela;
    const terkunci = hitungan >= BATAS_GAGAL;

    return {
        dihitung: true,
        status: {
            hitungan,
            awalJendela,
            // Jendela baru menghapus sisa kunci yang sudah lewat; kunci yang aktif tidak pernah sampai sini.
            terkunciSampai: terkunci ? new Date(sekarang.getTime() + DURASI_KUNCI_MS) : jendelaLewat ? null : status.terkunciSampai,
        },
        terkunciBaru: terkunci,
    };
}
