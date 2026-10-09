// Validasi nilai parameter terhadap barisnya sendiri (FR-20.1 A1, SDD-DB-17).
// Fungsi murni: tidak menyentuh basis data, sehingga dapat diuji tanpa satu pun.

export interface DefinisiSetting {
    readonly key?: string;
    readonly tipe: "BILANGAN_BULAT" | "DESIMAL" | "BOOLEAN" | "TEKS";
    /** Batas dari kolom `numeric` — string dari driver `pg`, atau null. */
    readonly nilai_min: string | null;
    readonly nilai_maks: string | null;
}

/**
 * Parameter yang nilainya himpunan tertutup, bukan rentang — tidak dapat dinyatakan kolom
 * `nilai_min`/`nilai_maks`. Granularitas harus membagi satu jam habis agar kolom kalender
 * sejajar batas jam (CAL-UI-02, keputusan 12c log phase-03).
 */
const NILAI_TERBATAS: Readonly<Record<string, readonly number[]>> = {
    "reservasi.granularitas_menit": [15, 30, 60],
};

/** Panjang maksimum parameter bertipe teks — pagar kewajaran teknis, bukan business rule. */
const PANJANG_TEKS_MAKS = 500;

function penjelasanRentang(min: number | null, maks: number | null): string {
    if (min !== null && maks !== null) return `Nilai harus antara ${min} dan ${maks}.`;
    if (min !== null) return `Nilai tidak boleh kurang dari ${min}.`;
    if (maks !== null) return `Nilai tidak boleh lebih dari ${maks}.`;
    return "";
}

/**
 * Mengembalikan penjelasan Bahasa Indonesia bila `nilai` tidak sah, atau
 * `undefined` bila sah. Penjelasan menyebut batas yang diizinkan (`FR-20.1 A1`),
 * bukan sekadar "tidak valid".
 */
export function validasiNilai(definisi: DefinisiSetting, nilai: unknown): string | undefined {
    switch (definisi.tipe) {
        case "BILANGAN_BULAT":
        case "DESIMAL": {
            if (typeof nilai !== "number" || !Number.isFinite(nilai)) return "Nilai harus berupa angka.";
            if (definisi.tipe === "BILANGAN_BULAT" && !Number.isInteger(nilai)) {
                return "Nilai harus berupa bilangan bulat.";
            }
            const min = definisi.nilai_min === null ? null : Number(definisi.nilai_min);
            const maks = definisi.nilai_maks === null ? null : Number(definisi.nilai_maks);
            if ((min !== null && nilai < min) || (maks !== null && nilai > maks)) {
                return penjelasanRentang(min, maks);
            }
            const pilihan = definisi.key === undefined ? undefined : NILAI_TERBATAS[definisi.key];
            if (pilihan !== undefined && !pilihan.includes(nilai)) return `Nilai harus salah satu dari ${pilihan.join(", ")}.`;
            return undefined;
        }
        case "BOOLEAN":
            return typeof nilai === "boolean" ? undefined : "Nilai harus berupa true atau false.";
        case "TEKS":
            if (typeof nilai !== "string" || nilai.trim().length === 0) return "Nilai harus berupa teks yang tidak kosong.";
            return nilai.length > PANJANG_TEKS_MAKS
                ? `Teks tidak boleh lebih dari ${PANJANG_TEKS_MAKS} karakter.`
                : undefined;
    }
}
