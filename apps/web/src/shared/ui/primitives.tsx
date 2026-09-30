// Komponen inti kerangka (COMPONENTS.md; SDD-FE-12): Button C-01, Input C-08, Select C-09, Alert C-14,
// Badge C-13, Card C-07, Skeleton C-20, Checkbox C-10. Hanya token (DS-P-07); status selalu warna + ikon
// + teks (UX-03, NFR-AC-06); kontrol ≥ 44px (NFR-AC-07).

import * as Centang from "@radix-ui/react-checkbox";
import { useId } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Ikon } from "./icon";
import type { NamaIkon } from "./icon";

export const gabung = (...kelas: readonly (string | false | null | undefined)[]): string => kelas.filter(Boolean).join(" ");

const VARIAN_TOMBOL = {
    primary: "bg-teal-600 text-text-inverse hover:bg-teal-700 active:bg-teal-800",
    secondary: "border border-border-strong text-text-primary hover:bg-neutral-50",
    tertiary: "text-text-link hover:text-text-link-hover",
    danger: "bg-error-base text-text-inverse hover:bg-error-strong",
} as const;

export function Tombol({
    varian = "primary",
    ikon,
    sibuk = false,
    className,
    children,
    ...sisa
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly varian?: keyof typeof VARIAN_TOMBOL; readonly ikon?: NamaIkon; readonly sibuk?: boolean }) {
    return (
        <button
            type="button"
            {...sisa}
            disabled={sisa.disabled === true || sibuk}
            aria-busy={sibuk || undefined}
            className={gabung(
                "inline-flex min-h-control-md items-center justify-center gap-2 rounded-md px-4 py-2 text-base font-medium transisi-cepat",
                "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-text-disabled disabled:border-border-disabled",
                VARIAN_TOMBOL[varian],
                className,
            )}
        >
            {ikon !== undefined && <Ikon nama={ikon} />}
            {children}
        </button>
    );
}

/** C-08: label selalu di atas; galat ditautkan `aria-describedby` (NFR-AC-05). */
export function Isian({ label, galat, bantuan, ...sisa }: InputHTMLAttributes<HTMLInputElement> & { readonly label: string; readonly galat?: string | undefined; readonly bantuan?: string }) {
    const id = useId();
    const idKet = `${id}-ket`;
    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={id} className="text-sm font-medium text-text-primary">
                {label}
                {sisa.required === true && <span className="font-regular text-text-secondary"> (wajib)</span>}
            </label>
            <input
                id={id}
                {...sisa}
                aria-invalid={galat !== undefined || undefined}
                aria-describedby={galat !== undefined || bantuan !== undefined ? idKet : undefined}
                className={gabung(
                    "min-h-control-md rounded-sm bg-surface-default px-4 py-3 text-base text-text-primary placeholder:text-text-tertiary hover:border-neutral-500",
                    galat === undefined ? "border border-border-strong" : "border-2 border-border-error",
                    "disabled:bg-neutral-100 disabled:border-border-disabled disabled:text-text-disabled",
                )}
            />
            {galat !== undefined ? (
                <p id={idKet} className="flex items-center gap-1 text-sm text-error-base">
                    <Ikon nama="galat" ukuran="sm" />
                    {galat}
                </p>
            ) : (
                bantuan !== undefined && (
                    <p id={idKet} className="text-sm text-text-secondary">
                        {bantuan}
                    </p>
                )
            )}
        </div>
    );
}

/**
 * C-09 varian `select` (≤10 opsi, atau daftar yang sudah disempitkan): ukuran & state identik
 * Input. Opsi enum wajib berlabel — kode teknis tidak pernah tampil (SDD-FE-08).
 */
export function Pilihan({
    label,
    galat,
    bantuan,
    opsi,
    kosong,
    ...sisa
}: SelectHTMLAttributes<HTMLSelectElement> & {
    readonly label: string;
    readonly galat?: string | undefined;
    readonly bantuan?: string | undefined;
    readonly opsi: readonly { readonly nilai: string; readonly label: string }[];
    /** Opsi tanpa nilai di urutan pertama (mis. "Pilih role"). */
    readonly kosong?: string;
}) {
    const id = useId();
    const idKet = `${id}-ket`;
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={id} className="text-sm font-medium text-text-primary">
                {label}
                {sisa.required === true && <span className="font-regular text-text-secondary"> (wajib)</span>}
            </label>
            <select
                id={id}
                {...sisa}
                aria-invalid={galat !== undefined || undefined}
                aria-describedby={galat !== undefined || bantuan !== undefined ? idKet : undefined}
                className={gabung(
                    "min-h-control-md min-w-0 rounded-sm bg-surface-default px-4 text-base text-text-primary hover:border-neutral-500",
                    galat === undefined ? "border border-border-strong" : "border-2 border-border-error",
                    "disabled:bg-neutral-100 disabled:border-border-disabled disabled:text-text-disabled",
                )}
            >
                {kosong !== undefined && <option value="">{kosong}</option>}
                {opsi.map((o) => (
                    <option key={o.nilai} value={o.nilai}>
                        {o.label}
                    </option>
                ))}
            </select>
            {galat !== undefined ? (
                <p id={idKet} className="flex items-center gap-1 text-sm text-error-base">
                    <Ikon nama="galat" ukuran="sm" />
                    {galat}
                </p>
            ) : (
                bantuan !== undefined && (
                    <p id={idKet} className="text-sm text-text-secondary">
                        {bantuan}
                    </p>
                )
            )}
        </div>
    );
}

export type Semantik = "success" | "warning" | "error" | "info";
const GAYA_SEMANTIK: Record<Semantik, { readonly kelas: string; readonly ikon: NamaIkon; readonly penanda: string }> = {
    success: { kelas: "bg-success-subtle text-success-strong", ikon: "sukses", penanda: "bg-success-base" },
    warning: { kelas: "bg-warning-subtle text-warning-strong", ikon: "peringatan", penanda: "bg-warning-base" },
    error: { kelas: "bg-error-subtle text-error-strong", ikon: "galat", penanda: "bg-error-base" },
    info: { kelas: "bg-info-subtle text-info-strong", ikon: "info", penanda: "bg-info-base" },
};

/** C-14: galat & peringatan `role="alert"`; sukses & info `role="status"`. */
export function Peringatan({ varian, judul, children, aksi }: { readonly varian: Semantik; readonly judul?: string; readonly children: ReactNode; readonly aksi?: ReactNode }) {
    const g = GAYA_SEMANTIK[varian];
    return (
        <div role={varian === "error" || varian === "warning" ? "alert" : "status"} className={gabung("flex overflow-hidden rounded-md", g.kelas)}>
            <span aria-hidden="true" className={gabung("w-marker shrink-0", g.penanda)} />
            <div className="flex flex-1 items-start gap-3 p-4">
                <Ikon nama={g.ikon} />
                <div className="flex flex-1 flex-col gap-1">
                    {judul !== undefined && <p className="font-semibold">{judul}</p>}
                    <div>{children}</div>
                    {aksi}
                </div>
            </div>
        </div>
    );
}

/** C-13: ikon + teks keduanya wajib; varian `neutral` untuk abu (DSD-07). */
export function Lencana({ varian, children }: { readonly varian: Semantik | "neutral"; readonly children: string }) {
    const g = varian === "neutral" ? { kelas: "bg-neutral-100 text-neutral-700", ikon: "menunggu" as NamaIkon } : GAYA_SEMANTIK[varian];
    return (
        <span className={gabung("inline-flex items-center gap-1 rounded-sm px-2 py-1 text-sm font-medium", g.kelas)}>
            <Ikon nama={g.ikon} ukuran="sm" />
            {children}
        </span>
    );
}

/** C-07: border 1px, tanpa bayangan (DS-P-05). `status` menambah garis kiri 3px semantic. */
export function Kartu({ judul, status, aksi, children, className }: { readonly judul?: ReactNode; readonly status?: Semantik | undefined; readonly aksi?: ReactNode; readonly children: ReactNode; readonly className?: string | undefined }) {
    return (
        <section className={gabung("flex overflow-hidden rounded-md border border-border-subtle bg-surface-default", className)}>
            {status !== undefined && <span aria-hidden="true" className={gabung("w-marker shrink-0", GAYA_SEMANTIK[status].penanda)} />}
            <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
                {(judul !== undefined || aksi !== undefined) && (
                    <header className="flex items-start justify-between gap-2">
                        {judul !== undefined && <h3 className="text-lg font-semibold text-text-heading">{judul}</h3>}
                        {aksi}
                    </header>
                )}
                {children}
            </div>
        </section>
    );
}

/** C-20: skeleton muncul seketika, tanpa transisi masuk (FOUNDATIONS §9). */
export function Kerangka({ baris = 3, label }: { readonly baris?: number; readonly label: string }) {
    return (
        <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-3">
            {Array.from({ length: baris }, (_, i) => (
                <span key={i} className="h-4 rounded-sm bg-neutral-100" />
            ))}
        </div>
    );
}

/**
 * C-10 di atas Radix (SDD-FE-13): kotak 20px dalam area sentuh 44px; seluruh label dapat
 * diklik. Tercentang = fill teal + centang putih; status tidak hanya warna (ikon centang).
 */
export function KotakCentang({ label, checked, onCheckedChange, disabled }: { readonly label: string; readonly checked: boolean; readonly onCheckedChange: (v: boolean) => void; readonly disabled?: boolean }) {
    const id = useId();
    return (
        <div className="flex min-h-touch items-center gap-3">
            <Centang.Root
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(v) => onCheckedChange(v === true)}
                className={gabung(
                    "flex size-icon-md shrink-0 items-center justify-center rounded-sm border transisi-cepat",
                    checked ? "border-teal-600 bg-teal-600 text-text-inverse" : "border-border-strong bg-surface-default hover:border-neutral-500",
                    "disabled:border-border-disabled disabled:bg-neutral-200",
                )}
            >
                <Centang.Indicator>
                    <Ikon nama="centang" ukuran="sm" />
                </Centang.Indicator>
            </Centang.Root>
            <label htmlFor={id} className="cursor-pointer text-base text-text-primary">
                {label}
            </label>
        </div>
    );
}
