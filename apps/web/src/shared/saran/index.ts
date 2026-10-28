// Registri aturan saran tindakan (SDD-FE-18, WEB-VIS-02/03, UXD-27). Murni klien: setiap aturan membaca isi
// kartu dashboard yang SUDAH diterima halaman dan merujuk ID business rule sumbernya. Tidak ada endpoint,
// permission, maupun aksi log baru; saran tanpa permission aksinya tidak pernah dihasilkan (PM-04).
// Hanya saran yang mengarah ke aksi berbeda dari drill-down kartunya (keputusan 40 log phase-07).

import type { Saran } from "../ui/visual";

type Isi = Record<string, unknown>;
const angka = new Intl.NumberFormat("id-ID");

interface AturanSaran {
    /** id kartu manifes dashboard yang isinya dibaca. */
    readonly kartu: string;
    /** Permission aksi tujuan — gerbang yang sama dengan aksinya (SDD-FE-04). */
    readonly permission: string;
    readonly turunkan: (isi: Isi) => Saran | null;
}

export const ATURAN_SARAN: readonly AturanSaran[] = [
    {
        // FR-22.7 langkah 3, BR-085: bahan di bawah stok minimum menjadi dasar usulan pengadaan.
        kartu: "stok-bahan-menipis",
        permission: "procurement.create",
        turunkan: (i) => {
            const jumlah = Number(i["jumlah"] ?? 0);
            if (jumlah <= 0) return null;
            const pertama = ((i["daftar"] as Isi[] | undefined) ?? [])[0];
            return {
                id: "stok-bahan-menipis",
                judul: jumlah === 1 && pertama !== undefined ? `Stok ${String(pertama["nama"])} di bawah minimum` : `${angka.format(jumlah)} bahan di bawah stok minimum`,
                alasan: pertama === undefined ? `${angka.format(jumlah)} jenis bahan menipis` : `Sisa ${angka.format(Number(pertama["saldo"]))} ${String(pertama["satuan"])} · minimum ${angka.format(Number(pertama["minimum"]))}`,
                labelAksi: "Ajukan pengadaan",
                href: "/pengadaan/baru",
            };
        },
    },
    {
        // NT-23: work order melewati target selesai.
        kartu: "pekerjaan-teknisi",
        permission: "workorder.view",
        turunkan: (i) => {
            const terlambat = Number(i["terlambat"] ?? 0);
            return terlambat <= 0 ? null : { id: "wo-terlambat", judul: `${angka.format(terlambat)} work order melewati target selesai`, alasan: `${angka.format(Number(i["aktif"] ?? 0))} pekerjaan aktif`, labelAksi: "Buka work order saya", href: "/work-order" };
        },
    },
    {
        // FR-15.1 A1, Bab 19.2: parameter sistem yang belum diisi.
        kartu: "status-konfigurasi",
        permission: "setting.manage",
        turunkan: (i) => {
            const kurang = (i["kekurangan"] as Isi[] | undefined) ?? [];
            return kurang.length === 0 ? null : { id: "konfigurasi-belum-lengkap", judul: "Konfigurasi sistem belum lengkap", alasan: `${angka.format(kurang.length)} butir belum diisi · ${String(kurang[0]?.["pesan"] ?? "")}`, labelAksi: "Lengkapi parameter", href: "/pengaturan" };
        },
    },
];

/** id kartu yang dibaca registri — halaman memuatnya lewat kueri kartu yang sama (cache bersama). */
export const KARTU_SARAN: readonly string[] = ATURAN_SARAN.map((a) => a.kartu);

export function saranDashboard(isiKartu: Readonly<Record<string, Isi | undefined>>, can: (permission: string) => boolean): readonly Saran[] {
    return ATURAN_SARAN.flatMap((a) => {
        const isi = isiKartu[a.kartu];
        if (isi === undefined || !can(a.permission)) return [];
        const s = a.turunkan(isi);
        return s === null ? [] : [s];
    });
}
