// Kerangka layar web (UX §5.1): topbar, sidebar, banner, konten. Preferensi ciut sidebar
// adalah preferensi tampilan klien (SDD-FE-03) — disimpan lokal, bukan data server.
// Auto-logout idle web (FR-01.2 A2) hidup di sini: hanya halaman terautentikasi yang dihitung.

import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { BannerSesiIdle, logout, useSesiIdle } from "../modules/m01-auth";
import { BannerLuring } from "../shared/states";
import { Sidebar } from "./sidebar";
import type { PreferensiCiut } from "./sidebar";
import { Topbar } from "./topbar";

const KUNCI_PREF = "sigm4.sidebar.ciut";

function bacaPreferensi(): PreferensiCiut {
    try {
        const v = window.localStorage.getItem(KUNCI_PREF);
        return v === "true" ? true : v === "false" ? false : null;
    } catch {
        return null;
    }
}

const lebar = (): boolean => window.matchMedia?.("(min-width: 48rem)").matches !== false;

export function Shell() {
    const [ciut, setCiut] = useState<PreferensiCiut>(bacaPreferensi);
    const [drawer, setDrawer] = useState(false);
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const href = useRouterState({ select: (s) => s.location.href });
    const idle = useSesiIdle(() => {
        void (async () => {
            try {
                await logout();
            } catch {
                // Sesi mungkin sudah berakhir di tab lain; keluar lokal tetap dijalankan.
            }
            queryClient.clear();
            await navigate({ to: "/login", search: { tujuan: href, alasan: "idle" } });
        })();
    });
    const toggle = () => {
        if (!lebar()) {
            setDrawer((d) => !d);
            return;
        }
        // Dari keadaan bawaan, arah togel mengikuti tampilan kini: LG terbuka → ciutkan, MD ciut → bentangkan.
        const lg = window.matchMedia?.("(min-width: 85.375rem)").matches === true;
        const baru = !(ciut ?? !lg);
        setCiut(baru);
        try {
            window.localStorage.setItem(KUNCI_PREF, String(baru));
        } catch {
            /* penyimpanan dinonaktifkan: preferensi berlaku sesi ini saja */
        }
    };
    return (
        <div className="flex min-h-full">
            <a href="#konten" className="sr-only focus:not-sr-only">
                Lompat ke konten
            </a>
            <Sidebar ciut={ciut} drawerTerbuka={drawer} onTutupDrawer={() => setDrawer(false)} />
            <div className="flex min-w-0 flex-1 flex-col">
                <Topbar onMenu={toggle} menuLabel={drawer ? "Tutup menu" : "Buka atau ciutkan menu"} />
                <BannerLuring />
                {idle.peringatan && <BannerSesiIdle onLanjutkan={idle.lanjutkan} />}
                <main id="konten" className="mx-auto w-full max-w-xl flex-1 p-4 md:p-10 lg:p-12">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
