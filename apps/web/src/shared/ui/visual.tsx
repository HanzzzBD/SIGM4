// Komponen web visual-first (COMPONENTS.md; DSD-13, UXD-24…27, WEB-VIS-01…05): Kepala Halaman (PATTERNS §1.2),
// Tile Modul C-31, Kartu Entitas C-32, Grafik Mini C-33, Cincin Progres C-34, Ilustrasi Keadaan C-37,
// Popover Info C-39, Pengalih Tampilan C-40, Kartu Saran Tindakan C-41, Tooltip C-18. Accent hanya sebagai
// FILL kotak ikon, bidang ilustrasi, dan seri grafik — tidak pernah teks, ikon, atau border (DSD-07).

import * as Popover from "@radix-ui/react-popover";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Ikon } from "./icon";
import type { NamaIkon } from "./icon";
import { Lencana, Tombol, gabung } from "./primitives";
import type { Semantik } from "./primitives";
import { SERI_GRAFIK } from "./tokens/tokens";

/** Accent grup domain (DSD-03) — sama dengan penanda sidebar `GrupNav.accent`. */
export type AccentGrup = "accent-blue" | "accent-green" | "accent-yellow" | "accent-purple" | "accent-gray";

const FILL: Readonly<Record<AccentGrup, string>> = {
    "accent-blue": "bg-accent-blue text-icon-inverse",
    "accent-green": "bg-accent-green text-icon-inverse",
    // Kontras ikon putih di atas kuning 1,84 — ikon memakai icon.default (C-31).
    "accent-yellow": "bg-accent-yellow text-icon-default",
    "accent-purple": "bg-accent-purple text-icon-inverse",
    "accent-gray": "bg-accent-gray text-icon-inverse",
};

/** Kotak ikon modul 40px berisi accent grup (DSD-12/13) — dipakai C-31 dan kepala halaman. */
export function KotakIkon({ ikon, accent }: { readonly ikon: NamaIkon; readonly accent: AccentGrup }) {
    return (
        <span aria-hidden="true" className={gabung("flex size-10 shrink-0 items-center justify-center rounded-md", FILL[accent])}>
            <Ikon nama={ikon} />
        </span>
    );
}

/** Anchor native (buka tab baru tetap bisa); klik biasa lewat router tanpa memuat ulang aplikasi. */
function TautanAplikasi({ href, className, children }: { readonly href: string; readonly className: string; readonly children: ReactNode }) {
    const navigate = useNavigate();
    const klik = (e: MouseEvent<HTMLAnchorElement>) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        void navigate({ href });
    };
    return (
        <a href={href} onClick={klik} className={className}>
            {children}
        </a>
    );
}

/** C-18: muncul setelah 400ms hover atau seketika saat fokus papan ketik — satu penyedia per wilayah. */
export function PenyediaPetunjuk({ children }: { readonly children: ReactNode }) {
    return <Tooltip.Provider delayDuration={400}>{children}</Tooltip.Provider>;
}

/** C-18 Tooltip di atas Radix (SDD-FE-13): nama entri tetap terbaca saat sidebar ciut (UXD-25). Wajib di dalam PenyediaPetunjuk. */
export function Petunjuk({ isi, aktif = true, children }: { readonly isi: string; readonly aktif?: boolean; readonly children: ReactNode }) {
    if (!aktif) return children;
    return (
        <Tooltip.Root>
            <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
            <Tooltip.Portal>
                <Tooltip.Content side="right" sideOffset={8} className="z-50 max-w-tooltip rounded-sm bg-neutral-800 px-3 py-2 text-sm text-text-inverse shadow-1">
                    {isi}
                </Tooltip.Content>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}

/** C-39: keterangan halaman/seksi yang dulu berupa paragraf sub-judul (UXD-24) — ≤ 3 kalimat + ≤ 1 tautan. */
export function PopoverInfo({ judul, children, tautan }: { readonly judul: string; readonly children: ReactNode; readonly tautan?: ReactNode }) {
    return (
        <Popover.Root>
            <Popover.Trigger aria-label="Tentang halaman ini" className="flex size-touch shrink-0 items-center justify-center rounded-full text-icon-muted transisi-cepat hover:text-icon-interactive">
                <Ikon nama="info" ukuran="sm" />
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content sideOffset={8} align="start" className="z-50 flex max-w-popover flex-col gap-2 rounded-md border border-border-subtle bg-surface-default p-4 shadow-1 masuk-sedang">
                    <p className="text-sm font-semibold text-text-primary">{judul}</p>
                    <div className="text-sm text-text-secondary">{children}</div>
                    {tautan}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

/**
 * Kepala halaman (PATTERNS §1.2, DSD-13): kotak ikon modul hanya pada halaman bergrup domain — halaman
 * tanpa grup (Beranda, akun, publik) tanpa kotak (keputusan 41 log phase-07); keterangan di C-39.
 */
export function KepalaHalaman({
    judul,
    ikon,
    accent,
    info,
    identitas,
    status,
    aksi,
}: {
    readonly judul: string;
    readonly ikon?: NamaIkon;
    readonly accent?: AccentGrup;
    readonly info?: { readonly judul: string; readonly isi: ReactNode; readonly tautan?: ReactNode };
    readonly identitas?: readonly string[];
    readonly status?: ReactNode;
    readonly aksi?: ReactNode;
}) {
    return (
        <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
                {ikon !== undefined && accent !== undefined && <KotakIkon ikon={ikon} accent={accent} />}
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                        <h1 className="text-2xl font-semibold text-text-heading">{judul}</h1>
                        {info !== undefined && (
                            <PopoverInfo judul={info.judul} tautan={info.tautan}>
                                {info.isi}
                            </PopoverInfo>
                        )}
                        {status !== undefined && <span className="ml-2 flex items-center gap-3">{status}</span>}
                    </div>
                    {identitas !== undefined && identitas.length > 0 && <p className="text-sm text-text-secondary">{identitas.slice(0, 3).join(" · ")}</p>}
                </div>
            </div>
            {aksi !== undefined && <div className="flex flex-wrap items-center gap-3">{aksi}</div>}
        </header>
    );
}

/** C-31: pintu masuk modul; label wajib (NFR-AC-04); hanya untuk modul yang diizinkan permission. */
export function TileModul({ label, ikon, accent, href }: { readonly label: string; readonly ikon: NamaIkon; readonly accent: AccentGrup; readonly href: string }) {
    return (
        <TautanAplikasi href={href} className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-default p-3 kartu-interaktif hover:bg-neutral-50">
            <KotakIkon ikon={ikon} accent={accent} />
            <span className="line-clamp-2 text-sm font-medium text-text-primary">{label}</span>
        </TautanAplikasi>
    );
}

/** C-32: media · judul 1 baris · ≤ 2 meta · ≤ 2 badge berikon · angka opsional; seluruh kartu dapat ditekan. */
export function KartuEntitas({
    judul,
    href,
    meta = [],
    status = [],
    angka,
    ikon = "aset",
    foto,
}: {
    readonly judul: string;
    readonly href: string;
    readonly meta?: readonly (string | null | undefined)[];
    readonly status?: readonly { readonly label: string; readonly varian: Semantik | "neutral" }[];
    readonly angka?: string | undefined;
    readonly ikon?: NamaIkon;
    readonly foto?: string | null;
}) {
    const baris = meta.filter((m): m is string => m !== null && m !== undefined && m !== "").slice(0, 2);
    return (
        <TautanAplikasi href={href} className="flex min-h-row-mobile min-w-0 items-center gap-3 rounded-md border border-border-subtle bg-surface-default p-3 kartu-interaktif hover:bg-neutral-50">
            {foto !== undefined && foto !== null ? (
                <img src={foto} alt="" className="size-12 shrink-0 rounded-md object-cover" />
            ) : (
                <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-icon-default">
                    <Ikon nama={ikon} />
                </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-base font-semibold text-text-primary">{judul}</span>
                {baris.length > 0 && <span className="truncate text-sm text-text-secondary">{baris.join(" · ")}</span>}
                {status.length > 0 && (
                    <span className="flex flex-wrap gap-2">
                        {status.slice(0, 2).map((s) => (
                            <Lencana key={s.label} varian={s.varian}>
                                {s.label}
                            </Lencana>
                        ))}
                    </span>
                )}
            </span>
            {angka !== undefined && <span className="shrink-0 text-lg font-bold tabular-nums text-text-heading">{angka}</span>}
        </TautanAplikasi>
    );
}

/** C-33: SVG milik sendiri (DSD-10), tanpa sumbu; ringkasan satu kalimat menjadi label aksesibel. */
export function GrafikMini({ jenis, nilai, ringkasan }: { readonly jenis: "batang" | "garis" | "donat"; readonly nilai: readonly number[]; readonly ringkasan: string }) {
    const data = nilai.slice(0, SERI_GRAFIK.length);
    const maks = Math.max(1, ...data);
    const warna = (i: number) => `var(--color-${SERI_GRAFIK[i] ?? "accent-gray"})`;
    let isi: ReactNode;
    if (jenis === "donat") {
        const total = data.reduce((n, v) => n + v, 0);
        const keliling = 2 * Math.PI * 16;
        let sudah = 0;
        isi = (
            <svg viewBox="0 0 40 40" className="h-grafik-mini">
                <circle cx="20" cy="20" r="16" fill="none" stroke="var(--color-neutral-200)" strokeWidth="6" />
                {total > 0 &&
                    data.map((v, i) => {
                        const panjang = (v / total) * keliling;
                        const busur = <circle key={i} cx="20" cy="20" r="16" fill="none" stroke={warna(i)} strokeWidth="6" strokeDasharray={`${String(panjang)} ${String(keliling)}`} strokeDashoffset={-sudah} transform="rotate(-90 20 20)" />;
                        sudah += panjang;
                        return busur;
                    })}
            </svg>
        );
    } else if (jenis === "garis") {
        const langkah = data.length > 1 ? 100 / (data.length - 1) : 0;
        isi = (
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-grafik-mini w-full">
                <polyline points={data.map((v, i) => `${String(i * langkah)},${String(38 - (v / maks) * 36)}`).join(" ")} fill="none" stroke={warna(0)} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
        );
    } else {
        const lebar = 100 / Math.max(1, data.length);
        isi = (
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-grafik-mini w-full">
                {data.map((v, i) => (
                    <rect key={i} x={i * lebar + lebar * 0.15} width={lebar * 0.7} y={40 - (v / maks) * 40} height={(v / maks) * 40} fill={warna(i)} />
                ))}
            </svg>
        );
    }
    return (
        <figure role="img" aria-label={ringkasan} className="flex justify-center">
            {isi}
        </figure>
    );
}

/** C-34: isi `color.secondary`; warna status hanya bila maknanya status (SLA hampir lewat / terlampaui). */
export function CincinProgres({ nilai, maks, label, besar = false, nada = "bawaan", format = "persen" }: { readonly nilai: number; readonly maks: number; readonly label: string; readonly besar?: boolean; readonly nada?: "bawaan" | "warning" | "error"; readonly format?: "persen" | "pecahan" }) {
    const rasio = maks > 0 ? Math.min(1, Math.max(0, nilai / maks)) : 0;
    const keliling = 2 * Math.PI * 16;
    const teks = format === "persen" ? `${String(Math.round(rasio * 100))}%` : `${String(nilai)}/${String(maks)}`;
    const isi = nada === "warning" ? "var(--color-warning-base)" : nada === "error" ? "var(--color-error-base)" : "var(--color-teal-600)";
    return (
        <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={maks} aria-valuenow={nilai} aria-valuetext={teks} className={gabung("relative inline-flex shrink-0 items-center justify-center", besar ? "size-cincin-besar" : "size-cincin")}>
            <svg aria-hidden="true" viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90">
                <circle cx="20" cy="20" r="16" fill="none" stroke="var(--color-neutral-200)" strokeWidth="4" />
                <circle cx="20" cy="20" r="16" fill="none" stroke={isi} strokeWidth="4" strokeLinecap="round" strokeDasharray={String(keliling)} strokeDashoffset={keliling * (1 - rasio)} className="transisi-cincin" />
            </svg>
            <span aria-hidden="true" className={gabung("relative font-bold tabular-nums text-text-heading masuk-lambat", besar ? "text-xl" : "text-xs")}>
                {teks}
            </span>
        </span>
    );
}

export type JenisKeadaan = "kosong" | "galat" | "tanpaAkses" | "luring" | "sukses";
const TANDA: Readonly<Record<JenisKeadaan, string>> = {
    kosong: "M44 62h32M44 72h20",
    galat: "M50 56l20 20M70 56 50 76",
    tanpaAkses: "M50 64h20v16H50zM54 64v-6a6 6 0 0 1 12 0v6",
    luring: "M42 60a26 26 0 0 1 36 0M48 68a16 16 0 0 1 24 0M58 76h4",
    sukses: "m48 66 8 8 16-16",
};

/** C-37: bidang datar netral + satu bidang accent grup; dekoratif — maknanya di judul C-21. Sama dengan mobile. */
export function IlustrasiKeadaan({ jenis, accent = "accent-gray" }: { readonly jenis: JenisKeadaan; readonly accent?: AccentGrup }) {
    return (
        <svg aria-hidden="true" viewBox="0 0 120 120" className="size-ilustrasi shrink-0">
            <circle cx="60" cy="64" r="44" fill="var(--color-neutral-100)" />
            <rect x="30" y="34" width="60" height="62" rx="8" fill="var(--color-surface-default)" stroke="var(--color-neutral-300)" strokeWidth="1.5" />
            <rect x="30" y="34" width="60" height="12" rx="6" fill={`var(--color-${accent})`} />
            <path d={TANDA[jenis]} stroke="var(--color-icon-default)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    );
}

export type Tampilan = "tabel" | "kartu";

/** C-40: Radix Toggle Group tunggal; pergantian tidak memindahkan fokus dan tidak mengubah URL (SDD-FE-17). */
export function PengalihTampilan({ nilai, onUbah }: { readonly nilai: Tampilan; readonly onUbah: (t: Tampilan) => void }) {
    const segmen = [
        { nilai: "tabel" as const, label: "Tabel", ikon: "tampilanTabel" as const },
        { nilai: "kartu" as const, label: "Kartu", ikon: "tampilanKartu" as const },
    ];
    return (
        <ToggleGroup.Root type="single" value={nilai} onValueChange={(v) => { if (v === "tabel" || v === "kartu") onUbah(v); }} aria-label="Tampilan daftar" className="inline-flex overflow-hidden rounded-sm border border-border-strong">
            {segmen.map((s) => (
                <ToggleGroup.Item
                    key={s.nilai}
                    value={s.nilai}
                    aria-label={s.label}
                    className={gabung("inline-flex min-h-control-sm items-center gap-2 px-3 text-sm transisi-cepat", nilai === s.nilai ? "bg-surface-selected font-semibold text-teal-800" : "text-text-secondary hover:bg-neutral-50")}
                >
                    <Ikon nama={s.ikon} ukuran="sm" />
                    <span className="hidden lg:inline">{s.label}</span>
                </ToggleGroup.Item>
            ))}
        </ToggleGroup.Root>
    );
}

const kunciTampilan = (halaman: string) => `sigm4.tampilan.${halaman}`;

/**
 * Preferensi Tabel ⇄ Kartu per halaman daftar (SDD-FE-17, UXD-26): `localStorage`, tidak masuk URL.
 * Bawaan Tabel pada ≥ 768px dan Kartu di bawahnya.
 */
export function useTampilanDaftar(halaman: string): readonly [Tampilan, (t: Tampilan) => void] {
    const [tampilan, setTampilan] = useState<Tampilan>(() => {
        try {
            const v = window.localStorage.getItem(kunciTampilan(halaman));
            if (v === "tabel" || v === "kartu") return v;
        } catch {
            /* penyimpanan dinonaktifkan: pakai bawaan titik henti */
        }
        return window.matchMedia?.("(min-width: 48rem)").matches === false ? "kartu" : "tabel";
    });
    const ubah = (t: Tampilan) => {
        setTampilan(t);
        try {
            window.localStorage.setItem(kunciTampilan(halaman), t);
        } catch {
            /* preferensi berlaku sesi ini saja */
        }
    };
    return [tampilan, ubah] as const;
}

export interface Saran {
    readonly id: string;
    readonly judul: string;
    readonly alasan: string;
    readonly labelAksi: string;
    /** Tujuan halaman yang sudah ada; tanpa `href`, `onAksi` menjalankan aksi di halaman yang sama (keputusan 46). */
    readonly href?: string;
    readonly onAksi?: () => void;
}

const kunciTutup = (id: string) => `sigm4.saran.tutup.${id}`;
const sudahDitutup = (id: string): boolean => {
    try {
        return window.sessionStorage.getItem(kunciTutup(id)) === "1";
    } catch {
        return false;
    }
};

/** C-41: satu saran — permukaan info, ikon lampu, judul, alasan berangka, satu tombol sekunder, tutup sesi ini. */
export function KartuSaran({ saran, onTutup }: { readonly saran: Saran; readonly onTutup: () => void }) {
    return (
        <div role="note" aria-label={saran.judul} className="flex overflow-hidden rounded-md bg-info-subtle">
            <span aria-hidden="true" className="w-marker shrink-0 bg-info-base" />
            <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3 p-4">
                <span className="text-info-base">
                    <Ikon nama="saran" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-base font-semibold text-info-strong">{saran.judul}</p>
                    <p className="text-sm text-text-secondary">{saran.alasan}</p>
                </div>
                {saran.href === undefined ? (
                    <Tombol varian="secondary" className="shrink-0" onClick={saran.onAksi}>
                        {saran.labelAksi}
                    </Tombol>
                ) : (
                    <TautanAplikasi href={saran.href} className="inline-flex min-h-control-md shrink-0 items-center rounded-md border border-border-strong bg-surface-default px-4 text-base font-medium text-text-primary transisi-cepat hover:bg-neutral-50">
                        {saran.labelAksi}
                    </TautanAplikasi>
                )}
                <button type="button" onClick={onTutup} aria-label={`Sembunyikan saran: ${saran.judul}`} className="flex size-touch shrink-0 items-center justify-center rounded-md text-icon-muted hover:bg-neutral-50">
                    <Ikon nama="tutup" ukuran="sm" />
                </button>
            </div>
        </div>
    );
}

/** Kumpulan C-41: paling banyak tiga terlihat, sisanya dilipat ke "Lihat N saran lain"; tutup berlaku sesi ini. */
export function DaftarSaran({ saran }: { readonly saran: readonly Saran[] }) {
    const [tertutup, setTertutup] = useState<readonly string[]>(() => saran.filter((s) => sudahDitutup(s.id)).map((s) => s.id));
    const [semua, setSemua] = useState(false);
    const tampil = saran.filter((s) => !tertutup.includes(s.id) && !sudahDitutup(s.id));
    if (tampil.length === 0) return null;
    const terlihat = semua ? tampil : tampil.slice(0, 3);
    const tutup = (id: string) => {
        try {
            window.sessionStorage.setItem(kunciTutup(id), "1");
        } catch {
            /* tetap disembunyikan selama halaman terbuka */
        }
        setTertutup((t) => [...t, id]);
    };
    return (
        <section aria-label="Saran tindakan" className="flex flex-col gap-3">
            {terlihat.map((s) => (
                <KartuSaran key={s.id} saran={s} onTutup={() => tutup(s.id)} />
            ))}
            {!semua && tampil.length > 3 && (
                <Tombol varian="tertiary" className="self-start" onClick={() => setSemua(true)}>
                    {`Lihat ${String(tampil.length - 3)} saran lain`}
                </Tombol>
            )}
        </section>
    );
}
