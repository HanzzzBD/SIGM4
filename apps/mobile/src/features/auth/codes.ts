/** Isi pesan kode cadangan untuk disimpan pengguna — tanpa identitas akun (sama dengan web P-03; BR-070c). */
export function backupCodesMessage(codes: readonly string[]): string { return ["Kode cadangan SIGM4", "Setiap kode hanya dapat dipakai satu kali.", "", ...codes, ""].join("\n"); }
