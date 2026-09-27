// Pemutus sah sebuah langkah — SDD-APR-16 (keputusan 67), RE-10, RE-12, RE-13, BR-039.
// Fungsi MURNI: repository menyediakan pemegang AKTIF langkah dan delegasi yang
// berlaku pada tanggal itu; di sini hanya aturannya.

export interface Pemutus {
    readonly userId: number;
    /** RE-12: approver asli bila `userId` bertindak sebagai penerima delegasi. */
    readonly atasNamaUserId: number | null;
}

export interface DelegasiBerlaku {
    readonly pemberiId: number;
    readonly penerimaId: number;
    /** Penerima nonaktif -> delegasi diabaikan, pemberi tetap pemegangnya. */
    readonly penerimaAktif: boolean;
}

export type SebabKosong = "KONFLIK_KEPENTINGAN" | "APPROVER_NONAKTIF";

export interface HasilResolusi {
    readonly pemutus: readonly Pemutus[];
    /** Terisi hanya bila `pemutus` kosong. */
    readonly sebabKosong: SebabKosong | null;
}

/** Alasan `approval_steps.alasan_dilewati` — literal PRD (BR-039, RE-13). */
export const ALASAN_DILEWATI: Readonly<Record<SebabKosong, string>> = {
    KONFLIK_KEPENTINGAN: "konflik kepentingan",
    APPROVER_NONAKTIF: "approver nonaktif",
};

/**
 * @param pemegangAktif pemegang AKTIF langkah: seluruh pemegang role (langkah role),
 *        atau pengguna target bila AKTIF (langkah user). Pemegang nonaktif tidak ada di sini.
 */
export function resolvePemutus(
    pemegangAktif: readonly number[],
    delegasi: readonly DelegasiBerlaku[],
    pemohonId: number,
): HasilResolusi {
    const penggantiDari = new Map<number, number>();
    for (const d of delegasi) if (d.penerimaAktif) penggantiDari.set(d.pemberiId, d.penerimaId);

    const hasil = new Map<number, Pemutus>();
    let pemohonTersaring = false;
    for (const pemegang of pemegangAktif) {
        const pengganti = penggantiDari.get(pemegang);
        // Satu lompatan (SDD-APR-16): penerima tidak diikuti ke delegasinya sendiri.
        const calon: Pemutus = pengganti === undefined ? { userId: pemegang, atasNamaUserId: null } : { userId: pengganti, atasNamaUserId: pemegang };
        // BR-039: pemohon tidak memutus pengajuannya sendiri — langsung maupun lewat penggantinya.
        if (calon.userId === pemohonId || calon.atasNamaUserId === pemohonId) {
            pemohonTersaring = true;
            continue;
        }
        // Pemegang langsung menang atas jalur delegasi bagi pengguna yang sama.
        const ada = hasil.get(calon.userId);
        if (ada === undefined || (ada.atasNamaUserId !== null && calon.atasNamaUserId === null)) hasil.set(calon.userId, calon);
    }

    const pemutus = [...hasil.values()].sort((a, b) => a.userId - b.userId);
    if (pemutus.length > 0) return { pemutus, sebabKosong: null };
    return { pemutus, sebabKosong: pemohonTersaring ? "KONFLIK_KEPENTINGAN" : "APPROVER_NONAKTIF" };
}
