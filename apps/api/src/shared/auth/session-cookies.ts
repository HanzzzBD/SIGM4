// Cookie sesi web (SDD-SESS-05, NFR-S-09): `httpOnly; Secure; SameSite=Strict`, sehingga
// JavaScript klien tidak pernah membaca token dan peramban tidak mengirimkannya pada
// permintaan lintas-situs. Tanpa dependensi: yang dibutuhkan hanya membaca satu nama
// dan menulis dua cookie bernilai base64url/JWT (tanpa karakter yang perlu di-escape).

/** Cookie access token — dikirim ke seluruh API. */
export const COOKIE_ACCESS = "sigm4_at";
/** Cookie refresh token — dibatasi ke `/api/v1/auth` agar tidak ikut pada permintaan biasa. */
export const COOKIE_REFRESH = "sigm4_rt";

export const PATH_ACCESS = "/api/v1";
export const PATH_REFRESH = "/api/v1/auth";

/** Nilai cookie bernama `nama` dari header `Cookie`, atau `undefined`. */
export function bacaCookie(header: string | undefined, nama: string): string | undefined {
    if (header === undefined) return undefined;
    for (const potong of header.split(";")) {
        const sama = potong.indexOf("=");
        if (sama < 0) continue;
        if (potong.slice(0, sama).trim() === nama) {
            const nilai = potong.slice(sama + 1).trim();
            return nilai === "" ? undefined : nilai;
        }
    }
    return undefined;
}

export function susunCookie(nama: string, nilai: string, path: string, maxAgeDetik: number): string {
    return `${nama}=${nilai}; Max-Age=${String(maxAgeDetik)}; Path=${path}; HttpOnly; Secure; SameSite=Strict`;
}

/** Cookie penghapus: nilai kosong, kedaluwarsa seketika, atribut yang sama. */
export function hapusCookie(nama: string, path: string): string {
    return `${nama}=; Max-Age=0; Path=${path}; HttpOnly; Secure; SameSite=Strict`;
}
