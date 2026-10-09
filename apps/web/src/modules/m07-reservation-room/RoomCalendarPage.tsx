// P-27 Kalender Ruangan (FR-07.1, UX §7.6.1, C-24; PR-03-09). Baris = ruangan, kolom = slot.
// Keadaan dibedakan warna + pola + teks (CAL-UI-05, NFR-AC-06); WIB selalu (CAL-UI-09); baris
// divirtualisasi (CAL-UI-04); papan ketik penuh (CAL-UI-08); < 768 px menjadi daftar per hari (CAL-UI-07).

import { useQuery } from "@tanstack/react-query";
import { LABEL_JENIS_RUANGAN, LABEL_KEADAAN_SLOT } from "@sigm4/schemas";
import type { RoomAvailability, RuanganKetersediaan } from "@sigm4/schemas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useSesi } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Isian, Lencana, Pilihan, Tombol, gabung } from "../../shared/ui/primitives";
import { ketersediaanQuery } from "./api";
import type { FilterKalender } from "./api";
import {
    TAMPILAN,
    geserHari,
    hariIniWib,
    geserTampilan,
    jamWib,
    keadaanHari,
    keadaanSel,
    kepadatanHari,
    kolomHarian,
    namaBulan,
    rentangTampilan,
    slotBeririsan,
    tanggalPanjang,
    tanggalPendek,
    tengahMalamWib,
} from "./kalender";
import type { KeadaanSel, Sel, Tampilan } from "./kalender";

export interface PencarianKalender extends FilterKalender {
    readonly tampilan: Tampilan;
    readonly tanggal: string;
}

export interface PilihanSlot {
    readonly ruangan: RuanganKetersediaan;
    readonly mulai: Date;
    readonly selesai: Date;
}

const NAMA_TAMPILAN: Record<Tampilan, string> = { harian: "Harian", mingguan: "Mingguan", bulanan: "Bulanan" };

/** C-24: latar + pola per keadaan. */
const GAYA: Record<KeadaanSel, string> = {
    KOSONG: "bg-surface-default hover:bg-teal-50",
    MENUNGGU_PERSETUJUAN: "pola-diagonal",
    DISETUJUI: "bg-teal-50",
    JADWAL_TETAP: "pola-titik",
    PEMELIHARAAN: "pola-silang",
    LIBUR: "pola-silang",
    TUTUP: "bg-neutral-100",
};

/** CAL-UI-06: Siswa/OSIS melihat "Terpakai" pada slot pengajuan, tanpa nama kegiatan. */
function teksSel(sel: Sel, terbatas: boolean): string {
    if (sel.label !== null) return sel.label;
    if (terbatas && (sel.keadaan === "MENUNGGU_PERSETUJUAN" || sel.keadaan === "DISETUJUI")) return LABEL_KEADAAN_SLOT.TERPAKAI;
    return sel.keadaan === "KOSONG" ? "" : LABEL_KEADAAN_SLOT[sel.keadaan];
}

const labelKeadaan = (sel: Sel, terbatas: boolean) => {
    const dasar = LABEL_KEADAAN_SLOT[sel.keadaan];
    if (sel.keadaan === "KOSONG") return dasar;
    const isi = teksSel(sel, terbatas);
    const pemohon = sel.slot?.reservasi === null || sel.slot === null ? "" : `, pemohon ${sel.slot.reservasi.pemohon}`;
    return isi === dasar ? `${dasar}${pemohon}` : `${dasar}: ${isi}${pemohon}`;
};

function useLebarSempit(): boolean {
    // breakpoint.md (FOUNDATIONS): sempit = di bawah 48rem.
    const kueri = "(min-width: 48rem)";
    const cocok = () => typeof window.matchMedia === "function" && !window.matchMedia(kueri).matches;
    const [sempit, setSempit] = useState(cocok);
    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const m = window.matchMedia(kueri);
        const ubah = () => setSempit(!m.matches);
        m.addEventListener("change", ubah);
        return () => m.removeEventListener("change", ubah);
    }, []);
    return sempit;
}

/** CAL-UI-04: hanya baris dalam viewport (+ cadangan) yang dirender. */
function useJendelaBaris(total: number) {
    const wadah = useRef<HTMLDivElement>(null);
    const [gulir, setGulir] = useState({ atas: 0, tinggi: 0 });
    const tinggiBaris = useMemo(() => {
        const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const nilai = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--spacing-row")) || 2.75;
        return nilai * rem;
    }, []);
    useEffect(() => {
        const el = wadah.current;
        if (el === null) return;
        const ukur = () => setGulir({ atas: el.scrollTop, tinggi: el.clientHeight });
        ukur();
        el.addEventListener("scroll", ukur, { passive: true });
        return () => el.removeEventListener("scroll", ukur);
    }, []);
    const CADANGAN = 8;
    // Tanpa ukuran viewport (render pertama, jsdom) — cukup untuk satu layar penuh.
    const terlihat = gulir.tinggi > 0 ? Math.ceil(gulir.tinggi / tinggiBaris) : 16;
    const awal = Math.max(0, Math.floor(gulir.atas / tinggiBaris) - CADANGAN);
    const akhir = Math.min(total, awal + terlihat + CADANGAN * 2);
    const tampakkan = useCallback(
        (baris: number) => {
            const el = wadah.current;
            if (el === null) return;
            const atas = baris * tinggiBaris;
            if (atas < el.scrollTop) el.scrollTop = atas;
            else if (atas + tinggiBaris > el.scrollTop + el.clientHeight) el.scrollTop = atas + tinggiBaris - el.clientHeight;
        },
        [tinggiBaris],
    );
    return { wadah, awal, akhir, tinggiBaris, tampakkan };
}

function Legenda() {
    const butir: [KeadaanSel, string][] = [
        ["KOSONG", LABEL_KEADAAN_SLOT.KOSONG],
        ["MENUNGGU_PERSETUJUAN", LABEL_KEADAAN_SLOT.MENUNGGU_PERSETUJUAN],
        ["DISETUJUI", LABEL_KEADAAN_SLOT.DISETUJUI],
        ["JADWAL_TETAP", LABEL_KEADAAN_SLOT.JADWAL_TETAP],
        ["PEMELIHARAAN", `${LABEL_KEADAAN_SLOT.PEMELIHARAAN} / ${LABEL_KEADAAN_SLOT.LIBUR}`],
        ["TUTUP", LABEL_KEADAAN_SLOT.TUTUP],
    ];
    return (
        <ul aria-label="Keterangan keadaan slot" className="flex flex-wrap gap-4 text-sm text-text-secondary">
            {butir.map(([k, label]) => (
                <li key={k} className="flex items-center gap-2">
                    <span aria-hidden className={gabung("inline-block h-icon-md w-icon-md rounded-sm border border-border-subtle", GAYA[k])} />
                    {label}
                </li>
            ))}
        </ul>
    );
}

interface Seleksi {
    readonly baris: number;
    readonly dari: number;
    readonly sampai: number;
}

/** Tampilan Harian: ruangan × slot, seleksi rentang kosong berdampingan (CAL-UI-03). */
function GridHarian({ data, tanggal, terbatas, onPilih }: { readonly data: RoomAvailability; readonly tanggal: string; readonly terbatas: boolean; readonly onPilih: (p: PilihanSlot | null) => void }) {
    const kolom = useMemo(() => kolomHarian(tanggal, data), [tanggal, data]);
    const sel = useMemo(() => data.ruangan.map((r) => kolom.map((k) => keadaanSel(data, r.id, k))), [data, kolom]);
    const [fokus, setFokus] = useState({ baris: 0, kolom: 0 });
    const [seleksi, setSeleksi] = useState<Seleksi | null>(null);
    const seret = useRef<number | null>(null);
    const { wadah, awal, akhir, tinggiBaris, tampakkan } = useJendelaBaris(data.ruangan.length);

    useEffect(() => setSeleksi(null), [data, tanggal]);
    useEffect(() => {
        if (seleksi === null) return onPilih(null);
        const r = data.ruangan[seleksi.baris];
        const a = kolom[Math.min(seleksi.dari, seleksi.sampai)];
        const b = kolom[Math.max(seleksi.dari, seleksi.sampai)];
        if (r !== undefined && a !== undefined && b !== undefined) onPilih({ ruangan: r, mulai: a.mulai, selesai: b.selesai });
    }, [seleksi, data.ruangan, kolom, onPilih]);

    const kosong = (b: number, k: number) => sel[b]?.[k]?.keadaan === "KOSONG";
    /** Perluasan berhenti pada sel terisi pertama — rentang terpilih selalu utuh kosong. */
    const perluas = (s: Seleksi, ke: number): Seleksi => {
        const arah = ke >= s.dari ? 1 : -1;
        let batas = s.dari;
        while (batas !== ke && kosong(s.baris, batas + arah)) batas += arah;
        return { ...s, sampai: batas };
    };
    const pindahFokus = (baris: number, kol: number) => {
        const b = Math.max(0, Math.min(data.ruangan.length - 1, baris));
        const k = Math.max(0, Math.min(kolom.length - 1, kol));
        setFokus({ baris: b, kolom: k });
        tampakkan(b);
        requestAnimationFrame(() => wadah.current?.querySelector<HTMLElement>(`[data-sel="${b}-${k}"]`)?.focus());
        return { b, k };
    };
    const tekan = (e: KeyboardEvent<HTMLDivElement>) => {
        const langkah: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
        const l = langkah[e.key];
        if (l !== undefined) {
            e.preventDefault();
            if (e.shiftKey && l[0] === 0 && seleksi !== null && seleksi.baris === fokus.baris) {
                const ke = Math.max(0, Math.min(kolom.length - 1, seleksi.sampai + l[1]));
                const baru = perluas(seleksi, ke);
                setSeleksi(baru);
                pindahFokus(fokus.baris, baru.sampai);
                return;
            }
            pindahFokus(fokus.baris + l[0], fokus.kolom + l[1]);
        } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (kosong(fokus.baris, fokus.kolom)) setSeleksi({ baris: fokus.baris, dari: fokus.kolom, sampai: fokus.kolom });
        } else if (e.key === "Escape") {
            setSeleksi(null);
        }
    };
    const terpilih = (b: number, k: number) => seleksi !== null && seleksi.baris === b && k >= Math.min(seleksi.dari, seleksi.sampai) && k <= Math.max(seleksi.dari, seleksi.sampai);

    return (
        <div ref={wadah} className="max-h-screen overflow-auto rounded-md border border-border-subtle" onMouseUp={() => (seret.current = null)} onMouseLeave={() => (seret.current = null)}>
            <div role="grid" aria-label={`Ketersediaan ruangan ${tanggalPanjang(tanggal)}, waktu WIB`} aria-rowcount={data.ruangan.length + 1} aria-colcount={kolom.length + 1} aria-multiselectable onKeyDown={tekan} className="inline-block min-w-full">
                <div role="row" aria-rowindex={1} className="sticky top-0 z-20 flex bg-surface-default">
                    <div role="columnheader" aria-colindex={1} className="sticky left-0 z-30 flex w-sidebar shrink-0 items-center border-b border-r border-border-subtle bg-surface-default px-3 text-sm font-semibold text-text-primary">
                        Ruangan <Lencana varian="neutral">WIB</Lencana>
                    </div>
                    {kolom.map((k, i) => (
                        <div key={k.label} role="columnheader" aria-colindex={i + 2} className={gabung("flex h-row w-12 shrink-0 items-center justify-center border-b border-border-subtle text-xs text-text-secondary", k.awalJam ? "border-l border-l-neutral-300" : "border-l")}>
                            {k.awalJam ? k.label : ""}
                            {!k.awalJam && <span className="sr-only">{k.label}</span>}
                        </div>
                    ))}
                </div>
                <div role="presentation" style={{ height: awal * tinggiBaris }} />
                {data.ruangan.slice(awal, akhir).map((r, i) => {
                    const b = awal + i;
                    return (
                        <div key={r.id} role="row" aria-rowindex={b + 2} className="flex h-row">
                            <div role="rowheader" aria-colindex={1} className="sticky left-0 z-10 flex w-sidebar shrink-0 flex-col justify-center border-b border-r border-border-subtle bg-surface-default px-3">
                                <span className="truncate text-sm font-medium text-text-primary">{r.nama}</span>
                                <span className="truncate text-xs text-text-secondary">
                                    {r.gedung.nama}
                                    {r.kapasitas !== null && ` · ${String(r.kapasitas)} orang`}
                                </span>
                            </div>
                            {kolom.map((k, c) => {
                                const s = sel[b]?.[c] ?? { keadaan: "KOSONG", label: null, slot: null };
                                const sebelumnya = sel[b]?.[c - 1];
                                // Label hanya di sel pertama sebuah blok — tidak diulang tiap 30 menit.
                                const awalBlok = sebelumnya === undefined || sebelumnya.keadaan !== s.keadaan || sebelumnya.slot !== s.slot;
                                const dipilih = terpilih(b, c);
                                return (
                                    <div
                                        key={k.label}
                                        role="gridcell"
                                        aria-colindex={c + 2}
                                        aria-selected={dipilih}
                                        aria-disabled={s.keadaan !== "KOSONG" || undefined}
                                        aria-label={`${r.nama}, ${k.label}–${jamWib(k.selesai.toISOString())} WIB, ${labelKeadaan(s, terbatas)}`}
                                        data-sel={`${String(b)}-${String(c)}`}
                                        tabIndex={fokus.baris === b && fokus.kolom === c ? 0 : -1}
                                        onFocus={() => setFokus({ baris: b, kolom: c })}
                                        onMouseDown={(e) => {
                                            if (s.keadaan !== "KOSONG") return;
                                            e.preventDefault();
                                            seret.current = b;
                                            setFokus({ baris: b, kolom: c });
                                            setSeleksi(e.shiftKey && seleksi?.baris === b ? perluas(seleksi, c) : { baris: b, dari: c, sampai: c });
                                        }}
                                        onMouseEnter={() => {
                                            if (seret.current === b && seleksi !== null) setSeleksi(perluas(seleksi, c));
                                        }}
                                        className={gabung(
                                            "flex h-row w-12 shrink-0 items-center overflow-hidden border-b border-border-subtle px-1 text-xs text-text-primary",
                                            k.awalJam ? "border-l border-l-neutral-300" : "border-l",
                                            dipilih ? "bg-teal-100 ring-2 ring-inset ring-teal-600" : GAYA[s.keadaan],
                                            s.keadaan === "KOSONG" ? "cursor-pointer" : "cursor-default",
                                        )}
                                    >
                                        {awalBlok && <span aria-hidden className="truncate whitespace-nowrap">{teksSel(s, terbatas)}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
                <div role="presentation" style={{ height: (data.ruangan.length - akhir) * tinggiBaris }} />
            </div>
        </div>
    );
}

/** Tampilan Mingguan: hari sebagai kolom; isi sel = daftar slot hari itu. */
function GridMingguan({ data, hari, terbatas, onHari }: { readonly data: RoomAvailability; readonly hari: readonly string[]; readonly terbatas: boolean; readonly onHari: (t: string) => void }) {
    return (
        <div className="overflow-auto rounded-md border border-border-subtle">
            <table className="min-w-full border-collapse text-sm">
                <caption className="sr-only">Ketersediaan ruangan per hari, waktu WIB</caption>
                <thead>
                    <tr>
                        <th scope="col" className="sticky left-0 w-sidebar border-b border-r border-border-subtle bg-surface-default px-3 py-2 text-left text-text-primary">
                            Ruangan <Lencana varian="neutral">WIB</Lencana>
                        </th>
                        {hari.map((t) => (
                            <th key={t} scope="col" className="min-w-control-lg border-b border-l border-border-subtle px-2 py-2 text-left font-medium">
                                <button type="button" className="text-text-link hover:text-text-link-hover" onClick={() => onHari(t)}>
                                    {tanggalPendek(t)}
                                </button>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.ruangan.map((r) => (
                        <tr key={r.id}>
                            <th scope="row" className="sticky left-0 border-b border-r border-border-subtle bg-surface-default px-3 py-2 text-left font-medium text-text-primary">
                                {r.nama}
                            </th>
                            {hari.map((t) => {
                                const h = keadaanHari(t, data);
                                const isi = slotBeririsan(data.slot, r.id, tengahMalamWib(t), tengahMalamWib(geserHari(t, 1)));
                                return (
                                    <td key={t} className={gabung("border-b border-l border-border-subtle px-2 py-1 align-top", h !== null && isi.length === 0 && GAYA[h.keadaan])}>
                                        {isi.length === 0 ? (
                                            <span className="text-text-secondary">{h?.label ?? LABEL_KEADAAN_SLOT.KOSONG}</span>
                                        ) : (
                                            <ul className="flex flex-col gap-1">
                                                {isi.map((s) => {
                                                    const sl: Sel = { keadaan: s.keadaan, label: s.label, slot: s };
                                                    return (
                                                        <li key={`${s.mulai}-${s.keadaan}`} className={gabung("rounded-sm px-1 text-xs text-text-primary", GAYA[s.keadaan])}>
                                                            {jamWib(s.mulai)}–{jamWib(s.selesai)} {teksSel(sl, terbatas)}
                                                            <span className="sr-only">, {LABEL_KEADAAN_SLOT[s.keadaan]}</span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** Tampilan Bulanan: ringkasan kepadatan per hari (CAL-UI-01). */
function GridBulanan({ data, hari, bulan, onHari }: { readonly data: RoomAvailability; readonly hari: readonly string[]; readonly bulan: string; readonly onHari: (t: string) => void }) {
    return (
        <ol aria-label={`Kepadatan ruangan ${namaBulan(bulan)}`} className="grid grid-cols-7 gap-1">
            {hari.map((t) => {
                const h = keadaanHari(t, data);
                const padat = kepadatanHari(data, t);
                const persen = padat === null ? null : Math.round(padat * 100);
                return (
                    <li key={t}>
                        <button
                            type="button"
                            onClick={() => onHari(t)}
                            aria-label={`${tanggalPanjang(t)}: ${h?.label ?? `${String(persen ?? 0)}% terpakai`}`}
                            className={gabung(
                                "flex min-h-control-lg w-full flex-col items-start gap-1 rounded-sm border border-border-subtle p-2 text-left text-xs hover:border-teal-600",
                                h !== null ? GAYA[h.keadaan] : "bg-surface-default",
                                t.slice(0, 7) !== bulan.slice(0, 7) && "text-text-tertiary",
                            )}
                        >
                            <span className="text-sm font-medium">{Number(t.slice(8))}</span>
                            <span aria-hidden className="truncate">{h?.label ?? `${String(persen ?? 0)}% terpakai`}</span>
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}

/** CAL-UI-07: < 768 px — daftar per hari, bukan matriks. */
function DaftarHarian({ data, tanggal, terbatas }: { readonly data: RoomAvailability; readonly tanggal: string; readonly terbatas: boolean }) {
    const h = keadaanHari(tanggal, data);
    const awal = tengahMalamWib(tanggal);
    const akhir = new Date(awal.getTime() + 86_400_000);
    return (
        <section aria-label={`Ketersediaan ${tanggalPanjang(tanggal)}`} className="flex flex-col gap-3">
            {h !== null && <p className={gabung("rounded-sm p-2 text-sm text-text-primary", GAYA[h.keadaan])}>{h.label}</p>}
            <ul className="flex flex-col gap-2">
                {data.ruangan.map((r) => {
                    const isi = slotBeririsan(data.slot, r.id, awal, akhir);
                    return (
                        <li key={r.id} className="rounded-md border border-border-subtle bg-surface-default p-3">
                            <p className="font-medium text-text-primary">{r.nama}</p>
                            <p className="text-sm text-text-secondary">
                                {r.gedung.nama}
                                {r.kapasitas !== null && ` · ${String(r.kapasitas)} orang`}
                            </p>
                            {isi.length === 0 ? (
                                <p className="mt-2 text-sm text-text-secondary">Kosong sepanjang {data.jam_operasional.mulai.replace(":", ".")}–{data.jam_operasional.selesai.replace(":", ".")} WIB</p>
                            ) : (
                                <ul className="mt-2 flex flex-col gap-1">
                                    {isi.map((s) => (
                                        <li key={`${s.mulai}-${s.keadaan}`} className={gabung("rounded-sm px-2 py-1 text-sm text-text-primary", GAYA[s.keadaan])}>
                                            {jamWib(s.mulai)}–{jamWib(s.selesai)} WIB · {LABEL_KEADAAN_SLOT[s.keadaan]}
                                            {teksSel({ keadaan: s.keadaan, label: s.label, slot: s }, terbatas) !== LABEL_KEADAAN_SLOT[s.keadaan] && ` · ${teksSel({ keadaan: s.keadaan, label: s.label, slot: s }, terbatas)}`}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

export default function RoomCalendarPage({
    pencarian,
    onPencarian,
    aksiPilihan,
}: {
    readonly pencarian: PencarianKalender;
    readonly onPencarian: (p: Partial<PencarianKalender>) => void;
    /** Aksi lanjutan atas slot terpilih — wizard P-29 dipasang perakit halaman bila terdaftar. */
    readonly aksiPilihan?: (p: PilihanSlot) => ReactNode;
}) {
    const sesi = useSesi();
    const terbatas = sesi.permissions["reservation.view"] === "restricted";
    const sempit = useLebarSempit();
    const { tampilan, tanggal } = pencarian;
    const rentang = useMemo(() => rentangTampilan(sempit ? "harian" : tampilan, tanggal), [sempit, tampilan, tanggal]);
    const filter: FilterKalender = { gedung: pencarian.gedung, jenis: pencarian.jenis, kapasitas: pencarian.kapasitas };
    const kueri = useQuery(ketersediaanQuery(rentang.dari, rentang.sampai, filter));
    const [pilihan, setPilihan] = useState<PilihanSlot | null>(null);
    // Opsi gedung dikumpulkan dari jawaban sebelumnya — tak menuntut `location.view` (Guru/Siswa).
    const [gedung, setGedung] = useState<ReadonlyMap<string, string>>(new Map());
    useEffect(() => {
        if (kueri.data === undefined) return;
        const baru = kueri.data.ruangan.filter((r) => !gedung.has(r.gedung.id));
        if (baru.length > 0) setGedung(new Map([...gedung, ...baru.map((r) => [r.gedung.id, r.gedung.nama] as const)]));
    }, [kueri.data, gedung]);
    const judulRentang = tampilan === "bulanan" && !sempit ? namaBulan(tanggal) : tampilan === "mingguan" && !sempit ? `${tanggalPendek(rentang.hari[0] ?? tanggal)} – ${tanggalPendek(rentang.hari.at(-1) ?? tanggal)}` : tanggalPanjang(tanggal);
    const keHari = (t: string) => onPencarian({ tampilan: "harian", tanggal: t });

    return (
        <div className="flex w-full flex-col gap-4">
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold text-text-primary">Kalender Ruangan</h1>
                <p className="text-base text-text-secondary">Lihat ruangan yang terpakai dan kosong sebelum mengajukan reservasi. Seluruh waktu dalam WIB.</p>
            </header>

            <section aria-label="Filter ruangan" className="grid grid-cols-1 gap-3 rounded-md border border-border-subtle bg-surface-default p-4 md:grid-cols-3">
                <Pilihan label="Gedung" kosong="Semua gedung" opsi={[...gedung].map(([nilai, label]) => ({ nilai, label }))} value={pencarian.gedung ?? ""} onChange={(e) => onPencarian({ gedung: e.currentTarget.value || undefined })} />
                <Pilihan label="Jenis ruangan" kosong="Semua jenis" opsi={Object.entries(LABEL_JENIS_RUANGAN).map(([nilai, label]) => ({ nilai, label }))} value={pencarian.jenis ?? ""} onChange={(e) => onPencarian({ jenis: e.currentTarget.value || undefined })} />
                <Isian label="Kapasitas minimum" type="number" min={1} inputMode="numeric" value={pencarian.kapasitas ?? ""} onChange={(e) => {
                    const n = Number(e.currentTarget.value);
                    onPencarian({ kapasitas: Number.isInteger(n) && n > 0 ? n : undefined });
                }} />
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Tombol varian="secondary" aria-label="Rentang sebelumnya" onClick={() => onPencarian({ tanggal: geserTampilan(sempit ? "harian" : tampilan, tanggal, -1) })}>Sebelumnya</Tombol>
                    <Tombol varian="secondary" onClick={() => onPencarian({ tanggal: hariIniWib() })}>Hari ini</Tombol>
                    <Tombol varian="secondary" aria-label="Rentang berikutnya" onClick={() => onPencarian({ tanggal: geserTampilan(sempit ? "harian" : tampilan, tanggal, 1) })}>Berikutnya</Tombol>
                    <h2 aria-live="polite" className="text-lg font-semibold text-text-primary">{judulRentang}</h2>
                </div>
                {!sempit && (
                    <div role="group" aria-label="Tampilan kalender" className="flex gap-1">
                        {TAMPILAN.map((t) => (
                            <Tombol key={t} varian={t === tampilan ? "primary" : "secondary"} aria-pressed={t === tampilan} onClick={() => onPencarian({ tampilan: t })}>
                                {NAMA_TAMPILAN[t]}
                            </Tombol>
                        ))}
                    </div>
                )}
            </div>

            <Legenda />

            {kueri.isPending && <KeadaanMemuat label="Memuat kalender ruangan" baris={6} />}
            {kueri.isError && <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />}
            {kueri.data !== undefined && kueri.data.ruangan.length === 0 && (
                <KeadaanKosong
                    judul={pencarian.gedung !== undefined || pencarian.jenis !== undefined || pencarian.kapasitas !== undefined ? "Tidak ada ruangan yang cocok" : "Belum ada ruangan yang dapat direservasi"}
                    pesan={pencarian.gedung !== undefined || pencarian.jenis !== undefined || pencarian.kapasitas !== undefined ? "Ubah filter untuk melihat ruangan lain." : "Ruangan muncul di sini setelah ditandai dapat direservasi."}
                    aksi={pencarian.gedung !== undefined || pencarian.jenis !== undefined || pencarian.kapasitas !== undefined ? <Tombol varian="secondary" onClick={() => onPencarian({ gedung: undefined, jenis: undefined, kapasitas: undefined })}>Hapus filter</Tombol> : undefined}
                />
            )}
            {kueri.data !== undefined && kueri.data.ruangan.length > 0 && (
                <>
                    {sempit ? (
                        <DaftarHarian data={kueri.data} tanggal={tanggal} terbatas={terbatas} />
                    ) : tampilan === "harian" ? (
                        <GridHarian data={kueri.data} tanggal={tanggal} terbatas={terbatas} onPilih={setPilihan} />
                    ) : tampilan === "mingguan" ? (
                        <GridMingguan data={kueri.data} hari={rentang.hari} terbatas={terbatas} onHari={keHari} />
                    ) : (
                        <GridBulanan data={kueri.data} hari={rentang.hari} bulan={tanggal} onHari={keHari} />
                    )}
                    {tampilan === "harian" && !sempit && (
                        <p role="status" aria-live="polite" className="text-sm text-text-primary">
                            {pilihan === null
                                ? "Pilih slot kosong (klik, seret, atau Enter; Shift+Panah memperluas) untuk mengajukan reservasi."
                                : `Terpilih: ${pilihan.ruangan.nama}, ${jamWib(pilihan.mulai.toISOString())}–${jamWib(pilihan.selesai.toISOString())} WIB.`}
                        </p>
                    )}
                    {pilihan !== null && tampilan === "harian" && !sempit && aksiPilihan?.(pilihan)}
                </>
            )}
        </div>
    );
}

