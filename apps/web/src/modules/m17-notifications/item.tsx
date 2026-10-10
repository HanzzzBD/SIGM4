// Item C-29 (COMPONENTS C-29): satu target tekan ber-`aria-label` lengkap. Mengetuk = tandai
// terbaca + ikuti deep link (UX F-23, SDD-NTF-09). Objek yang hilang ditangani halaman tujuan
// (→ P-09, FR-17.1 A1); tujuan yang route-nya belum ada di build ini tidak dijadikan tautan.

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LABEL_KELOMPOK_NOTIFIKASI } from "@sigm4/schemas";
import { jalurTerdaftar } from "../../shared/navigasi";
import { Ikon } from "../../shared/ui/icon";
import type { NamaIkon } from "../../shared/ui/icon";
import { Lencana, gabung } from "../../shared/ui/primitives";
import type { Kelompok, Notifikasi } from "./api";
import { KUNCI_NOTIFIKASI, tandaiTerbaca } from "./api";
import { aturPenghitung } from "./aliran";

const IKON: Record<Kelompok, NamaIkon> = {
    PERSETUJUAN: "persetujuan",
    RESERVASI_PEMINJAMAN: "reservasi",
    DENDA_KEWAJIBAN: "denda",
    KERUSAKAN_PERAWATAN: "kerusakan",
    OPNAME_PENGADAAN: "opname",
    AKUN_SISTEM: "kunci",
};

const ABSOLUT = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
const RELATIF = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

/** Waktu relatif; judul absolut berpenanda WIB (C-29, CAL-UI-09). */
export function waktuRelatif(iso: string, kiniMs: number): string {
    const detik = Math.round((new Date(iso).getTime() - kiniMs) / 1000);
    const satuan: readonly [Intl.RelativeTimeFormatUnit, number][] = [
        ["day", 86_400],
        ["hour", 3_600],
        ["minute", 60],
    ];
    for (const [u, s] of satuan) if (Math.abs(detik) >= s) return RELATIF.format(Math.round(detik / s), u);
    return "baru saja";
}
export const waktuAbsolut = (iso: string) => `${ABSOLUT.format(new Date(iso))} WIB`;

/** Tandai terbaca (bila belum) lalu ikuti deep link yang route-nya ada. */
export function useBukaNotifikasi(): (n: Notifikasi) => Promise<void> {
    const qc = useQueryClient();
    const navigate = useNavigate();
    return async (n) => {
        if (n.dibaca_pada === null) {
            try {
                aturPenghitung(qc, await tandaiTerbaca(n.id));
                void qc.invalidateQueries({ queryKey: [...KUNCI_NOTIFIKASI, "list"] });
            } catch {
                /* tujuan tetap dibuka; status baca disinkronkan pada pembaruan berikutnya */
            }
        }
        if (n.deep_link !== null && jalurTerdaftar(n.deep_link)) await navigate({ href: n.deep_link });
    };
}

/** UXD-10: arsip tidak menampilkan penanda belum dibaca. */
const belumDibaca = (n: Notifikasi, arsip: boolean) => !arsip && n.dibaca_pada === null;

/** Label & kelas pembungkus — dipakai tombol P-13 dan item menu pratinjau lonceng. */
export function atributItem(n: Notifikasi, arsip: boolean) {
    const belum = belumDibaca(n, arsip);
    return {
        "aria-label": [belum ? "Belum dibaca" : null, LABEL_KELOMPOK_NOTIFIKASI[n.jenis], n.judul, n.isi, waktuAbsolut(n.created_at), n.wajib ? "Wajib" : null].filter(Boolean).join(", "),
        className: gabung("flex min-h-touch w-full cursor-pointer items-start gap-3 border-b border-border-subtle p-4 text-left outline-none hover:bg-neutral-50 data-highlighted:bg-neutral-50", belum ? "bg-teal-50" : "bg-surface-default"),
    };
}

export function ItemNotifikasi({ n, kiniMs, arsip, onBuka }: { readonly n: Notifikasi; readonly kiniMs: number; readonly arsip: boolean; readonly onBuka: (n: Notifikasi) => void }) {
    return (
        <button type="button" {...atributItem(n, arsip)} onClick={() => onBuka(n)}>
            <IsiNotifikasi n={n} kiniMs={kiniMs} arsip={arsip} />
        </button>
    );
}

export function IsiNotifikasi({ n, kiniMs, arsip }: { readonly n: Notifikasi; readonly kiniMs: number; readonly arsip: boolean }) {
    const belum = belumDibaca(n, arsip);
    return (
        <>
            <span aria-hidden className={gabung("mt-2 size-2 shrink-0 rounded-full", belum ? "bg-teal-600" : "bg-transparent")} />
            <span aria-hidden className="mt-1 text-icon-default">
                <Ikon nama={IKON[n.jenis]} />
            </span>
            <span aria-hidden className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium text-text-primary">{n.judul}</span>
                    {n.wajib && <Lencana varian="neutral">Wajib</Lencana>}
                </span>
                <span className="line-clamp-2 text-sm text-text-secondary">{n.isi}</span>
                <span className="text-sm text-text-tertiary" title={waktuAbsolut(n.created_at)}>
                    {waktuRelatif(n.created_at, kiniMs)}
                </span>
            </span>
        </>
    );
}
