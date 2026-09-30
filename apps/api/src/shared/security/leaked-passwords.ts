// Daftar password bocor (NFR-S-03a, FR-01.4 langkah 3; SDD-SESS-18, keputusan 84a). Berkas
// LURING `apps/api/data/password-bocor.txt` dibundel di image — tanpa layanan pihak ketiga.
// Dimuat sekali per proses ke `Set`; pencocokan tanpa membedakan huruf besar-kecil.

import { readFileSync } from "node:fs";

/** src/shared/security dan dist/shared/security sama-sama tiga tingkat di bawah apps/api. */
const BERKAS = new URL("../../../data/password-bocor.txt", import.meta.url);

let daftar: ReadonlySet<string> | undefined;

/** Isi daftar; baris kosong dan komentar `#` diabaikan. Berkas hilang = galat saat pertama dipakai. */
export function muatDaftarBocor(isi: string = readFileSync(BERKAS, "utf8")): ReadonlySet<string> {
    return new Set(
        isi
            .split(/\r?\n/)
            .map((b) => b.trim().toLowerCase())
            .filter((b) => b !== "" && !b.startsWith("#")),
    );
}

export function isLeakedPassword(password: string): boolean {
    daftar ??= muatDaftarBocor();
    return daftar.has(password.toLowerCase());
}
