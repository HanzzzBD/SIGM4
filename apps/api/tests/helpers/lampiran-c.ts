// Pembacaan sumber kebenaran RBAC untuk uji pembanding seed PR-00-16 (SDD-DB-10).
//
// Harapan uji diturunkan dari TIGA berkas dokumen, bukan disalin ke dalam uji:
//   - Lampiran C.2 — katalog kode permission, penanda 🔒, dan pemilik bawaannya
//   - Bab 5        — tujuh role bawaan
//   - SDD-03 §4.8  — nama singkat role dan tafsir pemilik yang bukan daftar role
// Salinan akan ikut disunting bersama migration-nya dan berhenti menguji apa pun.

import { readFileSync } from "node:fs";
import { AKAR } from "./bab113.js";

export type Scope = "ALL" | "OWN" | "ASSIGNED" | "RESTRICTED";

export interface PermissionDoc {
    kode: string;
    modul: string;
    aksi: string;
    deskripsi: string;
    inti: boolean;
    /** Kolom "Role bawaan pemilik" apa adanya. */
    pemilik: string;
}

export interface RoleDoc {
    kode: string;
    nama: string;
    deskripsi: string;
}

export interface Grant {
    role: string;
    permission: string;
    scope: Scope;
}

function baca(path: string): string {
    return readFileSync(new URL(path, AKAR), "utf8");
}

/** Potongan teks di antara dua penanda; melempar bila salah satunya hilang. */
function potong(teks: string, awal: string, akhir: string): string {
    const sesudah = teks.split(awal)[1];
    const isi = sesudah?.split(akhir)[0];
    if (sesudah === undefined || isi === undefined || isi === sesudah)
        throw new Error(`Bagian "${awal}" … "${akhir}" tidak ditemukan`);
    return isi;
}

/** Sel-sel satu baris tabel markdown, tanpa pipa tepi. */
function sel(baris: string): string[] {
    return baris
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((s) => s.trim());
}

/** Backtick hanya penanda kode bagi pembaca dokumen, bukan bagian teks tersimpan. */
const tanpaBacktick = (s: string): string => s.replace(/`/g, "");

/** Lampiran C.2 — satu entri per kode, dalam urutan dokumen. */
export function bacaLampiranC(): PermissionDoc[] {
    const bagian = potong(
        baca("docs/PRD/00-foundation/roles-permissions.md"),
        "### C.2 Katalog",
        "### C.3",
    );
    const hasil: PermissionDoc[] = [];
    for (const baris of bagian.split("\n")) {
        const [kodeSel, modul, deskripsi, pemilik] = sel(baris);
        const cocok = /^`([a-z0-9_]+)\.([a-z0-9_]+)`\s*(🔒)?$/u.exec(
            kodeSel ?? "",
        );
        if (
            cocok === null ||
            modul === undefined ||
            deskripsi === undefined ||
            pemilik === undefined
        )
            continue;
        const [, domain, aksi, gembok] = cocok;
        hasil.push({
            kode: `${domain}.${aksi}`,
            modul,
            aksi: aksi ?? "",
            deskripsi: tanpaBacktick(deskripsi),
            inti: gembok !== undefined,
            pemilik,
        });
    }
    return hasil;
}

/** Bab 5 — tabel User Roles. */
export function bacaRoleBab5(): RoleDoc[] {
    const bagian = potong(
        baca("docs/PRD/00-foundation/roles-permissions.md"),
        "# 5. User Roles",
        "**Aturan role tambahan",
    );
    const hasil: RoleDoc[] = [];
    for (const baris of bagian.split("\n")) {
        const [kode, nama, deskripsi] = sel(baris);
        if (!/^R-\d{2}$/.test(kode ?? "")) continue;
        hasil.push({
            kode: kode ?? "",
            nama: (nama ?? "").replace(/\*\*/g, ""),
            deskripsi: deskripsi ?? "",
        });
    }
    return hasil;
}

export interface Tafsir {
    /** Nama singkat Lampiran C -> kode role Bab 5. */
    namaSingkat: ReadonlyMap<string, string>;
    /** Kode permission -> teks Lampiran C yang ditafsirkan dan hasil tafsirnya. */
    baris: ReadonlyMap<string, { tertulis: string; pemilik: string }>;
}

/** SDD-03 §4.8 — nama singkat role dan tafsir pemilik bawaan. */
export function bacaTafsir(): Tafsir {
    const bagian = potong(
        baca("docs/SDD/03-authorization.md"),
        "### 4.8 Matriks bawaan",
        "\n---",
    );
    const namaSingkat = new Map<string, string>();
    const baris = new Map<string, { tertulis: string; pemilik: string }>();
    for (const b of bagian.split("\n")) {
        const s = sel(b);
        const role = /^`(R-\d{2})`$/.exec(s[1] ?? "");
        if (s.length === 2 && role !== null) {
            namaSingkat.set(s[0] ?? "", role[1] ?? "");
            continue;
        }
        const kode = /^`([a-z0-9_]+\.[a-z0-9_]+)`$/.exec(s[0] ?? "");
        if (s.length === 4 && kode !== null)
            baris.set(kode[1] ?? "", {
                tertulis: s[1] ?? "",
                pemilik: s[2] ?? "",
            });
    }
    return { namaSingkat, baris };
}

const SCOPE_ANOTASI: Readonly<Record<string, Scope>> = {
    view: "ALL", // "Petugas(view)" = hak baca, bukan pembatas cakupan data
    own: "OWN",
    assigned: "ASSIGNED",
    restricted: "RESTRICTED",
};

/**
 * Daftar role ber-anotasi -> role -> scope. Token yang bukan nama role
 * ("Semua", "Sesuai approval rules", …) MELEMPAR: deskriptor tanpa tafsir tidak
 * boleh diam-diam menjadi "tidak diberikan ke siapa pun".
 */
export function uraiPemilik(
    teks: string,
    namaSingkat: ReadonlyMap<string, string>,
): Map<string, Scope> {
    const hasil = new Map<string, Scope>();
    for (const token of teks.split(",").map((t) => t.trim())) {
        const cocok = /^([A-Za-z]+)(?:\((`?)([a-z]+)\2\))?$/.exec(token);
        const role = namaSingkat.get(cocok?.[1] ?? "");
        const scope = SCOPE_ANOTASI[cocok?.[3] ?? "view"];
        if (cocok === null || role === undefined || scope === undefined)
            throw new Error(`"${token}" pada "${teks}" bukan role Lampiran C`);
        hasil.set(role, scope);
    }
    return hasil;
}

/** Matriks role × permission × scope yang wajib dihasilkan seed, terurut. */
export function matriksBawaan(): Grant[] {
    const { namaSingkat, baris } = bacaTafsir();
    const hasil: Grant[] = [];
    for (const p of bacaLampiranC()) {
        const tafsir = baris.get(p.kode);
        if (tafsir !== undefined && tafsir.tertulis !== p.pemilik)
            throw new Error(
                `Tafsir ${p.kode} kedaluwarsa: SDD-03 §4.8 menafsirkan "${tafsir.tertulis}", ` +
                    `Lampiran C kini menulis "${p.pemilik}"`,
            );
        const pemilik = uraiPemilik(tafsir?.pemilik ?? p.pemilik, namaSingkat);
        for (const [role, scope] of pemilik)
            hasil.push({ role, permission: p.kode, scope });
    }
    return urutkanGrant(hasil);
}

export function urutkanGrant(grants: Grant[]): Grant[] {
    return [...grants].sort(
        (a, b) =>
            a.permission.localeCompare(b.permission) ||
            a.role.localeCompare(b.role),
    );
}
