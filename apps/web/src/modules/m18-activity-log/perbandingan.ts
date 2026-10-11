// Perbandingan nilai sebelum/sesudah P-74 (FR-18.2 AC: dua kolom berlabel Bahasa Indonesia, sorotan pada field yang
// berubah, bukan JSON mentah; keputusan pemilik produk 11 Okt: label = humanize kunci + label enum bersama).
// Bentuk akar yang dikenali: objek (per kunci), larik objek berkunci `kode` (per kode — mis. ROLE_PERMISSION_UPDATED),
// larik/skalar lain (satu baris "Nilai"). Fungsi murni — diuji tanpa DOM.

import { LABEL_ALASAN_PENGHAPUSAN, LABEL_JENIS_PENGAJUAN, LABEL_JENIS_RUANGAN, LABEL_KONDISI_ASET, LABEL_PRIORITAS, LABEL_STATUS_ASET, LABEL_STATUS_INSTANCE_APPROVAL } from "@sigm4/schemas";

/** Singkatan yang tidak di-humanize kata per kata. */
const SINGKATAN: Readonly<Record<string, string>> = { id: "ID", ip: "IP", npsn: "NPSN", nip_nis: "NIP/NIS", url: "URL", uuid: "UUID", qr: "QR", sla: "SLA" };

/** `tanggal_jatuh_tempo` → "Tanggal jatuh tempo"; `role_id` → "Role (ID)"; `nip_nis` → "NIP/NIS". */
export function labelField(kunci: string): string {
    const k = kunci.trim();
    if (SINGKATAN[k] !== undefined) return SINGKATAN[k];
    if (k.endsWith("_id") && k.length > 3) return `${labelField(k.slice(0, -3))} (ID)`;
    const kata = k.split(/[_\s]+/).filter(Boolean).map((w) => SINGKATAN[w] ?? w.toLowerCase());
    const teks = kata.join(" ");
    return teks === "" ? kunci : teks.charAt(0).toUpperCase() + teks.slice(1);
}

type PetaLabel = Readonly<Record<string, string>>;

/** Label enum bersama bila kuncinya dikenali (kode teknis tidak pernah tampil bila labelnya ada — SDD-FE-08). */
function petaEnum(kunci: string, entitas: string | null): PetaLabel | undefined {
    if (/(^|_)kondisi($|_)/.test(kunci)) return LABEL_KONDISI_ASET;
    if (kunci === "jenis_pengajuan") return LABEL_JENIS_PENGAJUAN;
    if (kunci === "prioritas") return LABEL_PRIORITAS;
    if (kunci === "alasan_penghapusan") return LABEL_ALASAN_PENGHAPUSAN;
    if (kunci === "status" && entitas === "assets") return LABEL_STATUS_ASET;
    if (kunci === "status" && entitas === "approval_instances") return LABEL_STATUS_INSTANCE_APPROVAL;
    if (kunci === "jenis" && entitas === "rooms") return LABEL_JENIS_RUANGAN;
    return undefined;
}

/** Nilai skalar untuk tampilan. Objek/larik ditangani komponen tampilan (daftar berlabel). */
export function labelNilai(kunci: string, nilai: unknown, entitas: string | null): string {
    if (nilai === null || nilai === undefined || nilai === "") return "—";
    if (typeof nilai === "boolean") return nilai ? "Ya" : "Tidak";
    if (typeof nilai === "string") return petaEnum(kunci, entitas)?.[nilai] ?? nilai;
    if (typeof nilai === "number" || typeof nilai === "bigint") return String(nilai);
    return JSON.stringify(nilai);
}

/** Kesetaraan struktural, urutan kunci objek diabaikan. */
export function sama(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return (a ?? null) === (b ?? null);
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sama(x, b[i]));
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    // Himpunan kunci harus sama: {a: null} ≠ {b: null} walau kedua nilai kosong.
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b as object, k) && sama((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const objekBiasa = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const larikBerkode = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every((x) => objekBiasa(x) && typeof x["kode"] === "string");

export type StatusKode = "DITAMBAHKAN" | "DICABUT" | "DIUBAH" | "TETAP";
export const LABEL_STATUS_KODE: Record<StatusKode, string> = { DITAMBAHKAN: "Ditambahkan", DICABUT: "Dicabut", DIUBAH: "Diubah", TETAP: "Tetap" };

export type Perbandingan =
    | { readonly jenis: "kosong" }
    | { readonly jenis: "objek"; readonly baris: readonly { readonly kunci: string; readonly label: string; readonly sebelum: unknown; readonly sesudah: unknown; readonly berubah: boolean }[] }
    | { readonly jenis: "kode"; readonly baris: readonly { readonly kode: string; readonly sebelum: Record<string, unknown> | undefined; readonly sesudah: Record<string, unknown> | undefined; readonly status: StatusKode }[] }
    | { readonly jenis: "nilai"; readonly sebelum: unknown; readonly sesudah: unknown; readonly berubah: boolean };

export function bandingkan(sebelum: unknown, sesudah: unknown): Perbandingan {
    const ada = (v: unknown) => v !== null && v !== undefined;
    if (!ada(sebelum) && !ada(sesudah)) return { jenis: "kosong" };
    if ((objekBiasa(sebelum) || !ada(sebelum)) && (objekBiasa(sesudah) || !ada(sesudah))) {
        const a = objekBiasa(sebelum) ? sebelum : {};
        const b = objekBiasa(sesudah) ? sesudah : {};
        const kunci = [...Object.keys(a), ...Object.keys(b).filter((k) => !(k in a))];
        return { jenis: "objek", baris: kunci.map((k) => ({ kunci: k, label: labelField(k), sebelum: a[k], sesudah: b[k], berubah: !sama(a[k], b[k]) })) };
    }
    if ((larikBerkode(sebelum) || !ada(sebelum)) && (larikBerkode(sesudah) || !ada(sesudah))) {
        const a = new Map((larikBerkode(sebelum) ? sebelum : []).map((x) => [x["kode"] as string, x]));
        const b = new Map((larikBerkode(sesudah) ? sesudah : []).map((x) => [x["kode"] as string, x]));
        const kode = [...new Set([...a.keys(), ...b.keys()])].sort();
        return {
            jenis: "kode",
            baris: kode.map((k) => {
                const x = a.get(k);
                const y = b.get(k);
                const status: StatusKode = x === undefined ? "DITAMBAHKAN" : y === undefined ? "DICABUT" : sama(x, y) ? "TETAP" : "DIUBAH";
                return { kode: k, sebelum: x, sesudah: y, status };
            }),
        };
    }
    return { jenis: "nilai", sebelum, sesudah, berubah: !sama(sebelum, sesudah) };
}
