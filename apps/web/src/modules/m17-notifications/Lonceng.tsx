// Lonceng topbar C-04 (UX NAVIGATION §2: penghitung dari server; klik → pratinjau 5 terbaru +
// "Lihat semua"). Pemasang aliran SSE/polling satu-satunya per tab (FR-17.1 A4). Penghitung
// diumumkan lewat live region sopan (COMPONENTS C-04, RESPONSIVE-ACCESSIBILITY).

import * as Menu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Ikon } from "../../shared/ui/icon";
import { daftarNotifikasiQuery } from "./api";
import { useAliranNotifikasi, useKeadaanAliran } from "./aliran";
import { IsiNotifikasi, atributItem, useBukaNotifikasi } from "./item";

const teksHitungan = (n: number) => (n > 99 ? "99+" : String(n));

export function Lonceng() {
    useAliranNotifikasi();
    const { unread, alasan } = useKeadaanAliran();
    const [buka, setBuka] = useState(false);
    const pratinjau = useQuery({ ...daftarNotifikasiQuery({ perPage: 5 }), enabled: buka });
    const ikuti = useBukaNotifikasi();
    const label = unread === null || unread === 0 ? "Notifikasi" : `Notifikasi, ${String(unread)} belum dibaca`;
    return (
        <>
            <span className="sr-only" aria-live="polite">
                {unread === null || unread === 0 ? "" : `${String(unread)} notifikasi belum dibaca`}
            </span>
            <Menu.Root open={buka} onOpenChange={setBuka}>
                <Menu.Trigger aria-label={label} className="relative flex size-touch items-center justify-center rounded-md text-icon-default hover:bg-neutral-50">
                    <Ikon nama="notifikasi" />
                    {unread !== null && unread > 0 && (
                        <span aria-hidden className="absolute right-1 top-1 flex h-icon-md min-w-icon-md items-center justify-center rounded-full bg-error-base px-1 text-xs font-medium text-text-inverse tabular-nums">
                            {teksHitungan(unread)}
                        </span>
                    )}
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Content align="end" sideOffset={4} className="z-40 flex w-screen max-w-sm flex-col rounded-md border border-border-subtle bg-surface-default shadow-1">
                        {alasan !== null && <p className="border-b border-border-subtle p-4 text-sm text-text-secondary">{alasan}</p>}
                        {pratinjau.isPending ? (
                            <p className="p-4 text-sm text-text-secondary">Memuat notifikasi…</p>
                        ) : pratinjau.isError ? (
                            <p className="p-4 text-sm text-text-secondary">Notifikasi belum dapat dimuat.</p>
                        ) : pratinjau.data.data.length === 0 ? (
                            <p className="p-4 text-sm text-text-secondary">Belum ada notifikasi.</p>
                        ) : (
                            pratinjau.data.data.map((n) => (
                                <Menu.Item key={n.id} {...atributItem(n, false)} onSelect={() => void ikuti(n)}>
                                    <IsiNotifikasi n={n} kiniMs={Date.now()} arsip={false} />
                                </Menu.Item>
                            ))
                        )}
                        <Menu.Item asChild>
                            <Link to="/notifikasi" className="flex min-h-touch items-center justify-center p-4 text-base font-medium text-text-link outline-none hover:text-text-link-hover data-highlighted:bg-neutral-50">
                                Lihat semua notifikasi
                            </Link>
                        </Menu.Item>
                    </Menu.Content>
                </Menu.Portal>
            </Menu.Root>
        </>
    );
}
