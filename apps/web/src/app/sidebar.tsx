// Sidebar C-03 (UX §5.3, §10.2; UXD-01, DSD-05). Entri berasal dari registri navigasi,
// tersaring permission `/me` DAN keberadaan route di build (keputusan 83) — bukan role.
// < 768px: overlay drawer dari tombol topbar · MD: ikon-saja · LG: terbuka penuh.

import { Link, useRouterState } from "@tanstack/react-router";
import { useCan } from "../shared/auth";
import { HALAMAN_TERDAFTAR, navigasiTerlihat } from "../shared/navigasi";
import { Ikon } from "../shared/ui/icon";
import { gabung } from "../shared/ui/primitives";

/** `null` = bawaan per titik henti; `true`/`false` = pilihan pengguna (preferensi tampilan, SDD-FE-03). */
export type PreferensiCiut = boolean | null;

const LEBAR = { null: "md:w-sidebar-ciut lg:w-sidebar", true: "md:w-sidebar-ciut lg:w-sidebar-ciut", false: "md:w-sidebar lg:w-sidebar" } as const;
const TEKS = { null: "md:sr-only lg:not-sr-only", true: "md:sr-only", false: "" } as const;

export function Sidebar({ ciut, drawerTerbuka, onTutupDrawer }: { readonly ciut: PreferensiCiut; readonly drawerTerbuka: boolean; readonly onTutupDrawer: () => void }) {
    const can = useCan();
    const path = useRouterState({ select: (s) => s.location.pathname });
    const kunci = String(ciut) as keyof typeof LEBAR;
    const teks = drawerTerbuka ? "" : TEKS[kunci];
    return (
        <>
            {drawerTerbuka && <button type="button" aria-label="Tutup menu" onClick={onTutupDrawer} className="fixed inset-0 z-20 bg-neutral-900 opacity-50 md:hidden" />}
            <aside
                className={gabung(
                    "flex-col overflow-y-auto border-r border-border-subtle bg-surface-default transisi-lebar",
                    drawerTerbuka ? "fixed inset-y-0 left-0 z-30 flex w-sidebar" : "hidden md:flex",
                    LEBAR[kunci],
                )}
            >
                <div className="flex min-h-topbar items-center border-b border-border-subtle px-4">
                    <span className={gabung("text-lg font-semibold text-text-heading", teks)}>SIGM4</span>
                </div>
                <nav aria-label="Navigasi utama" className="flex flex-col gap-4 py-4">
                    {navigasiTerlihat(can).map((grup) => (
                        <div key={grup.label} className="flex flex-col gap-1">
                            <p className="flex items-center gap-2 px-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                                {grup.accent !== null && <span aria-hidden="true" className="h-4 w-marker" style={{ backgroundColor: `var(--color-${grup.accent})` }} />}
                                <span className={teks}>{grup.label}</span>
                            </p>
                            <ul className="flex flex-col gap-1 px-2">
                                {grup.entri.map((x) => {
                                    const tujuan = HALAMAN_TERDAFTAR[x.halaman] ?? "/";
                                    const aktif = path === tujuan;
                                    return (
                                        <li key={x.halaman}>
                                            <Link
                                                to={tujuan}
                                                onClick={onTutupDrawer}
                                                aria-current={aktif ? "page" : undefined}
                                                title={x.label}
                                                className={gabung(
                                                    "flex min-h-touch items-center gap-3 rounded-md px-4 py-3 text-base transisi-cepat",
                                                    aktif ? "bg-surface-selected font-semibold text-teal-800" : "font-medium text-text-primary hover:bg-neutral-50",
                                                )}
                                            >
                                                <span className={aktif ? "text-icon-interactive" : "text-icon-default"}>
                                                    <Ikon nama={x.ikon} />
                                                </span>
                                                <span className={teks}>{x.label}</span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>
            </aside>
        </>
    );
}
