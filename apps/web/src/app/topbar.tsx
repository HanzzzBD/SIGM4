// Topbar C-04 (UX §5.2; keputusan 83): ciutkan sidebar, identitas, penanda WIB, menu
// pengguna (Keluar · Keluar dari semua perangkat, FR-01.2/A1). Pencarian global lahir
// bersama P-15, lonceng bersama P-13, banner sesi berakhir bersama PR-02-36.

import * as Menu from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { logout, logoutSemua } from "../modules/m01-auth";
import { useSesi } from "../shared/auth";
import { Ikon } from "../shared/ui/icon";
import { Logo } from "../shared/ui/logo";

/** Jam dinding WIB (CAL-UI-09, NFR-C-10) — tidak mengikuti zona waktu perangkat. */
function JamWib() {
    const format = () => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(Date.now());
    const [jam, setJam] = useState(format);
    useEffect(() => {
        const t = setInterval(() => setJam(format()), 30_000);
        return () => clearInterval(t);
    }, []);
    return <span className="text-sm tabular-nums text-text-secondary">WIB {jam}</span>;
}

const ITEM = "flex min-h-touch cursor-pointer items-center gap-3 rounded-sm px-4 text-base text-text-primary outline-none data-highlighted:bg-neutral-50";

export function Topbar({ onMenu, menuLabel }: { readonly onMenu: () => void; readonly menuLabel: string }) {
    const sesi = useSesi();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const keluar = async (semua: boolean) => {
        try {
            await (semua ? logoutSemua() : logout());
        } catch {
            // Kegagalan tersering: sesi sudah berakhir (401) — keluar lokal tetap dijalankan agar
            // pengguna tidak terjebak di shell; server menolak sesi yang tak sah pada permintaan berikutnya.
        }
        // Cache klien dikosongkan agar data sesi lama tak tertinggal di tab ini.
        queryClient.clear();
        await navigate({ to: "/login" });
    };
    return (
        <header role="banner" className="flex min-h-topbar items-center gap-4 border-b border-border-subtle bg-surface-default px-4">
            <button type="button" onClick={onMenu} aria-label={menuLabel} className="flex size-touch items-center justify-center rounded-md text-icon-default hover:bg-neutral-50">
                <Ikon nama="menu" />
            </button>
            <Logo ukuran="sm" className="md:hidden" />
            <div className="ml-auto flex items-center gap-4">
                <JamWib />
                <Menu.Root>
                    <Menu.Trigger className="flex min-h-touch items-center gap-2 rounded-md px-2 text-base font-medium text-text-primary hover:bg-neutral-50">
                        {sesi.user.nama}
                        <Ikon nama="chevron" ukuran="sm" />
                    </Menu.Trigger>
                    <Menu.Portal>
                        <Menu.Content align="end" sideOffset={4} className="z-40 flex min-w-sidebar flex-col rounded-md border border-border-subtle bg-surface-default p-1 shadow-1">
                            <Menu.Label className="px-4 py-2 text-sm text-text-secondary">{sesi.user.email}</Menu.Label>
                            <Menu.Separator className="my-1 h-px bg-border-subtle" />
                            <Menu.Item className={ITEM} onSelect={() => void keluar(false)}>
                                <Ikon nama="keluar" />
                                Keluar
                            </Menu.Item>
                            <Menu.Item className={ITEM} onSelect={() => void keluar(true)}>
                                <Ikon nama="keluar" />
                                Keluar dari semua perangkat
                            </Menu.Item>
                        </Menu.Content>
                    </Menu.Portal>
                </Menu.Root>
            </div>
        </header>
    );
}
