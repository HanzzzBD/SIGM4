// Tab antar halaman pengaturan (UX §6: P-71 dan P-72 adalah "Tab pada Parameter Sistem"). Hanya halaman yang
// terdaftar di build ini yang ditautkan (registri navigasi).

import { HALAMAN_TERDAFTAR } from "../../shared/navigasi";
import { gabung } from "../../shared/ui/primitives";

const TAB = [
    { halaman: "P-70", label: "Parameter Sistem" },
    { halaman: "P-71", label: "Kalender Akademik" },
    { halaman: "P-72", label: "Unit Kerja" },
] as const;

export function NavPengaturan({ aktif }: { readonly aktif: (typeof TAB)[number]["halaman"] }) {
    return (
        <nav aria-label="Bagian pengaturan" className="flex flex-wrap gap-2 border-b border-border-subtle">
            {TAB.filter((t) => HALAMAN_TERDAFTAR[t.halaman] !== undefined).map((t) => (
                <a
                    key={t.halaman}
                    href={HALAMAN_TERDAFTAR[t.halaman]}
                    aria-current={t.halaman === aktif ? "page" : undefined}
                    className={gabung("inline-flex min-h-touch items-center border-b-2 px-4 text-base font-medium", t.halaman === aktif ? "border-teal-600 text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}
                >
                    {t.label}
                </a>
            ))}
        </nav>
    );
}
