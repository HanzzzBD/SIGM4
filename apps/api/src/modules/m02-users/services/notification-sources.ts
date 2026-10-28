// Sumber notifikasi milik M-02 (SDD-08 §4.2a, keputusan 78): nama event dan fungsi
// baca yang dipanggil konsumen M-17 setelah commit — M-17 tidak menyentuh
// repository modul ini (SDD-SYS-03).

import type { TransactionScope } from "../../../shared/db/index.js";
import { createUserImportRepository } from "../repositories/user-import.repository.js";
import { createUserRepository } from "../repositories/user.repository.js";

/** `NT-40`: role atau status akun berubah (SDD-07 §4.3). */
export const EVENT_AKUN_BERUBAH = "UserAccountChanged";
/** `NT-48`: akun siswa ditolak karena `consent_guardian_at` kosong (DP-02, SDD-07 §4.3). */
export const EVENT_KONSEN_WALI_HILANG = "GuardianConsentMissing";

/** `NT-52`: ringkasan pekerjaan impor untuk isi notifikasi (IMPT-04). */
export async function ringkasanImpor(scope: TransactionScope, jobId: number): Promise<{ total: number; sukses: number; gagal: number } | undefined> {
    const job = await createUserImportRepository(scope.tx).findById(scope.ctx, jobId);
    return job === undefined ? undefined : { total: job.total_baris, sukses: job.sukses, gagal: job.gagal };
}

/** Nama tampilan sebuah kode role — `{role}` NT-40. */
export async function namaRole(scope: TransactionScope, kode: string): Promise<string> {
    return (await createUserRepository(scope.tx).namaRoleByKode(scope.ctx, kode)) ?? kode;
}

/** Penerima berbasis role (mis. `NT-47`, `NT-48`): pengguna AKTIF pemegang kode role itu. */
export async function penggunaAktifBerperan(scope: TransactionScope, kodeRole: readonly string[]): Promise<readonly number[]> {
    return createUserRepository(scope.tx).idAktifBerperan(scope.ctx, kodeRole);
}

/** `{pengguna}`/`{email}` notifikasi modul lain (mis. M-01 `NT-37`, `NT-53`) — tanpa membuka repository ini (SDD-SYS-03). */
export async function identitasPengguna(scope: TransactionScope, id: number): Promise<{ readonly nama: string; readonly email: string } | undefined> {
    const u = await createUserRepository(scope.tx).findById(scope.ctx, id);
    return u === undefined ? undefined : { nama: u.nama, email: u.email };
}
