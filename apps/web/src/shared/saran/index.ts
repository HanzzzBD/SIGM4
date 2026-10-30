// Registri aturan saran tindakan (SDD-FE-18, WEB-VIS-02/03, UXD-27). Murni klien: setiap aturan membaca isi
// kartu dashboard yang SUDAH diterima halaman dan merujuk ID business rule sumbernya. Tidak ada endpoint,
// permission, maupun aksi log baru; saran tanpa permission aksinya tidak pernah dihasilkan (PM-04).
// Hanya saran yang mengarah ke aksi berbeda dari drill-down kartunya (keputusan 40 log phase-07).

import type { Saran } from "../ui/visual";

type Isi = Record<string, unknown>;
const angka = new Intl.NumberFormat("id-ID");
const TANGGAL = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", dateStyle: "long" });
const WAKTU = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" });
const tanggal = (iso: string | undefined) => (iso === undefined ? "—" : TANGGAL.format(new Date(`${iso}T00:00:00Z`)));

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

/** Saran halaman detail beserta permission aksinya; penyaringan sama dengan Dashboard (PM-04). */
type SaranBerizin = readonly (readonly [Saran | null, string])[];
const izinkan = (daftar: SaranBerizin, can: (permission: string) => boolean): readonly Saran[] => daftar.flatMap(([s, p]) => (s !== null && can(p) ? [s] : []));

/** P-82 dari `GET /materials/{id}` — FR-22.7 langkah 3, BR-085: sama dengan kartu Dashboard. */
export function saranBahan(m: { readonly nama: string; readonly stok_menipis: boolean; readonly status: string; readonly saldo_total: number | null; readonly stok_minimum: number | null; readonly satuan: { readonly simbol: string } }, can: (permission: string) => boolean): readonly Saran[] {
    // Saldo `null` = scope terbatas (BR-091a): tidak ada angka untuk dijadikan alasan.
    const s: Saran | null =
        !m.stok_menipis || m.status !== "AKTIF" || m.saldo_total === null || m.stok_minimum === null
            ? null
            : { id: "stok-bahan-menipis", judul: `Stok ${m.nama} di bawah minimum`, alasan: `Sisa ${angka.format(m.saldo_total)} ${m.satuan.simbol} · minimum ${angka.format(m.stok_minimum)}`, labelAksi: "Ajukan pengadaan", href: "/pengadaan/baru" };
    return izinkan([[s, "procurement.create"]], can);
}

/**
 * P-18 tab Riwayat dari halaman pertama linimasa (`GET /assets/{id}/timeline`): preventif terakhir dilewati
 * tanpa pemeliharaan sesudahnya (BR-051) → work order manual.
 */
export function saranLinimasaAset(assetId: string, entri: readonly { readonly jenis: string; readonly nama?: string; readonly jatuh_tempo?: string }[], can: (permission: string) => boolean): readonly Saran[] {
    const terakhir = entri.find((e) => e.jenis === "PREVENTIF_DILEWATI" || e.jenis === "PEMELIHARAAN");
    const s: Saran | null =
        terakhir?.jenis !== "PREVENTIF_DILEWATI"
            ? null
            : { id: `preventif-dilewati-${assetId}`, judul: `Pemeliharaan ${terakhir.nama ?? "preventif"} terlewat`, alasan: `Jatuh tempo ${tanggal(terakhir.jatuh_tempo)} · belum ada work order sesudahnya`, labelAksi: "Buat work order", href: `/work-order/baru?aset=${assetId}` };
    return izinkan([[s, "workorder.create"]], can);
}

/** P-18 tab Riwayat dari `GET /assets/{id}/service-history` — BR-053: biaya melewati ambang → penggantian. */
export function saranServisAset(assetId: string, d: { readonly rekomendasi_penggantian: boolean | null; readonly total_biaya: string | null; readonly jumlah_perbaikan: number }, can: (permission: string) => boolean): readonly Saran[] {
    const biaya = d.total_biaya === null ? "" : ` · total Rp ${angka.format(Number(d.total_biaya))}`;
    const s: Saran | null = d.rekomendasi_penggantian !== true ? null : { id: `penggantian-${assetId}`, judul: "Biaya pemeliharaan melewati ambang nilai perolehan", alasan: `${angka.format(d.jumlah_perbaikan)} perbaikan${biaya}`, labelAksi: "Usulkan penggantian", href: `/pengadaan/baru?aset=${assetId}` };
    return izinkan([[s, "procurement.create"]], can);
}

/**
 * P-18 tab Dokumen dari `GET /assets/{id}/documents` — NT-29 (garansi berakhir ≤ 30 hari) dan BR-052:
 * kerusakan dilaporkan selagi garansi aktif. `hariIni` YYYY-MM-DD WIB dari pemanggil.
 */
export function saranGaransiAset(assetId: string, dokumen: readonly { readonly jenis: string; readonly nama_berkas: string; readonly garansi_mulai: string | null; readonly garansi_selesai: string | null }[], hariIni: string, can: (permission: string) => boolean): readonly Saran[] {
    const segera = dokumen
        .filter((d) => d.jenis === "GARANSI" && d.garansi_mulai !== null && d.garansi_selesai !== null && d.garansi_mulai <= hariIni && d.garansi_selesai >= hariIni)
        .map((d) => ({ d, hari: Math.round((Date.parse(d.garansi_selesai ?? "") - Date.parse(hariIni)) / 86_400_000) }))
        .filter((x) => x.hari <= 30)
        .sort((a, b) => a.hari - b.hari)[0];
    const s: Saran | null =
        segera === undefined
            ? null
            : { id: `garansi-${assetId}`, judul: segera.hari === 0 ? "Garansi aset berakhir hari ini" : `Garansi aset berakhir dalam ${angka.format(segera.hari)} hari`, alasan: `${segera.d.nama_berkas} · berakhir ${tanggal(segera.d.garansi_selesai ?? undefined)}`, labelAksi: "Lapor kerusakan", href: `/kerusakan/baru?aset=${assetId}` };
    return izinkan([[s, "damage.create"]], can);
}

const HARI_MS = 86_400_000;

/**
 * P-34 dari `GET /loans/{id}` — FR-09.3 (akan jatuh tempo ≤ 3 hari) dan FR-09.5/BR-034 (perpanjangan sebelum
 * jatuh tempo). Kelayakan perpanjangan diputus server lewat `aksi.perpanjang`; aksinya membuka form di
 * halaman yang sama, sehingga saran tanpa `href` (keputusan 46).
 */
export function saranPeminjaman(l: { readonly id: string; readonly tanggal_jatuh_tempo: string; readonly aksi: { readonly perpanjang?: boolean | undefined } }, sekarang: Date): readonly Saran[] {
    const sisa = Date.parse(l.tanggal_jatuh_tempo) - sekarang.getTime();
    if (l.aksi.perpanjang !== true || sisa <= 0 || sisa > 3 * HARI_MS) return [];
    const hari = Math.ceil(sisa / HARI_MS);
    return [{ id: `jatuh-tempo-${l.id}`, judul: hari === 1 ? "Peminjaman jatuh tempo dalam 1 hari" : `Peminjaman jatuh tempo dalam ${angka.format(hari)} hari`, alasan: `Jatuh tempo ${WAKTU.format(new Date(l.tanggal_jatuh_tempo))} WIB · perpanjangan masih dapat diajukan`, labelAksi: "Ajukan perpanjangan" }];
}

/**
 * P-37 dari `GET /approvals/pending` — FR-10.2 langkah 2: server mengurutkan tenggat SLA terdekat lebih dulu,
 * sehingga butir terlambat pertama adalah yang paling lama menunggu melewati SLA (keputusan 47).
 */
export function saranPersetujuan(butir: readonly { readonly instance_id: number; readonly label: string; readonly sla: { readonly terlambat: boolean } | null }[], can: (permission: string) => boolean): readonly Saran[] {
    const lewat = butir.filter((b) => b.sla?.terlambat === true);
    const pertama = lewat[0];
    const s: Saran | null = pertama === undefined ? null : { id: "persetujuan-lewat-sla", judul: lewat.length === 1 ? "1 pengajuan melewati SLA" : `${angka.format(lewat.length)} pengajuan melewati SLA`, alasan: `Paling lama: ${pertama.label}`, labelAksi: "Putuskan yang paling lama", href: `/persetujuan/${String(pertama.instance_id)}` };
    return izinkan([[s, "approval.decide"]], can);
}

export function saranDashboard(isiKartu: Readonly<Record<string, Isi | undefined>>, can: (permission: string) => boolean): readonly Saran[] {
    return ATURAN_SARAN.flatMap((a) => {
        const isi = isiKartu[a.kartu];
        if (isi === undefined || !can(a.permission)) return [];
        const s = a.turunkan(isi);
        return s === null ? [] : [s];
    });
}
