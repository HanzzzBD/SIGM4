// Topbar C-04 (UX §5.2; keputusan 83): ciutkan sidebar, identitas, penanda WIB, menu
// pengguna (Keluar · Keluar dari semua perangkat, FR-01.2/A1). Pencarian global lahir
// bersama P-15 (PR-02-45: kotak cari menuju Inventaris `?q=`); lonceng + pratinjau notifikasi milik P-13 (PR-02-43); banner sesi berakhir ada di shell (FR-01.2 A2).

import * as Menu from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { logout, logoutSemua } from "../modules/m01-auth";
import { Lonceng } from "../modules/m17-notifications";
import { useCan, useSesi, leaveAuthenticatedSession } from "../shared/auth";
import { ApiError } from "../shared/api";
import { DialogKonfirmasi } from "../shared/ui/dialog";
import { jalurTerdaftar } from "../shared/navigasi";
import { Ikon } from "../shared/ui/icon";
import { Logo } from "../shared/ui/logo";
import { useTour } from "../shared/tour";

/** Jam dinding WIB (CAL-UI-09, NFR-C-10) — tidak mengikuti zona waktu perangkat. */
function JamWib() {
    const format = () => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(Date.now());
    const [jam, setJam] = useState(format);
    useEffect(() => {
        const t = setInterval(() => setJam(format()), 30_000);
        return () => clearInterval(t);
    }, []);
    return <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-text-secondary">WIB <span className="hidden sm:inline">{jam}</span></span>;
}

const ITEM = "flex min-h-touch cursor-pointer items-center gap-3 rounded-sm px-4 text-base text-text-primary outline-none data-highlighted:bg-neutral-50";

/** Pencarian global C-04 (UX NAVIGATION §2): kode aset, nomor seri, nama → P-15 terfilter (FR-04.2). */
function PencarianGlobal() {
    const navigate = useNavigate();
    const [kata, setKata] = useState("");
    return (
        <form
            role="search"
            data-tour="cari"
            className="hidden w-full max-w-sm items-center gap-2 rounded-sm border border-border-strong bg-surface-default px-3 md:flex"
            onSubmit={(e) => {
                e.preventDefault();
                if (kata.trim() === "") return;
                void navigate({ to: "/aset", search: { q: kata.trim() } });
            }}
        >
            <span aria-hidden className="text-icon-muted">
                <Ikon nama="cari" />
            </span>
            <input type="search" aria-label="Cari aset: kode, nomor seri, atau nama" placeholder="Cari kode aset, nomor seri, nama…" value={kata} onChange={(e) => setKata(e.target.value)} className="min-h-control-md w-full bg-transparent text-base text-text-primary outline-none" />
        </form>
    );
}

export function Topbar({ onMenu, menuLabel }: { readonly onMenu: () => void; readonly menuLabel: string }) {
    const [confirmAll, setConfirmAll] = useState(false);
    const [sibuk, setSibuk] = useState(false);
    const [galat, setGalat] = useState<string | undefined>();
    const sesi = useSesi();
    const can = useCan();
    const tur = useTour();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const keluar = async (semua: boolean) => {
        try {
            await (semua ? logoutSemua() : logout());
        } catch (error) {
            if (semua && !(error instanceof ApiError && error.status === 401)) throw error;
            // Kegagalan tersering: sesi sudah berakhir (401) — keluar lokal tetap dijalankan agar
            // pengguna tidak terjebak di shell; server menolak sesi yang tak sah pada permintaan berikutnya.
        }
        // Cache klien dikosongkan agar data sesi lama tak tertinggal di tab ini.
        await leaveAuthenticatedSession(queryClient,()=>navigate({ to: "/login", replace:true, ignoreBlocker:true }));
    };
    return (
        <header role="banner" className="flex min-h-topbar items-center gap-2 border-b border-border-subtle bg-surface-default px-4 sm:gap-4">
            <button type="button" data-menu-trigger onClick={onMenu} aria-label={menuLabel} className="flex size-touch items-center justify-center rounded-md text-icon-default hover:bg-neutral-50">
                <Ikon nama="menu" />
            </button>
            <Logo ukuran="sm" className="md:hidden" />
            {can("asset.view") && jalurTerdaftar("/aset") && <PencarianGlobal />}
            <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
                <JamWib />
                {tur.adaTurHalaman && (
                    <button type="button" data-tour="bantuan-halaman" onClick={tur.mulaiHalaman} aria-label="Panduan halaman ini" title="Panduan halaman ini" className="flex size-touch items-center justify-center rounded-md text-icon-default hover:bg-neutral-50">
                        <Ikon nama="bantuan" />
                    </button>
                )}
                {can("notification.manage_own") && <span data-tour="lonceng" className="flex"><Lonceng /></span>}
                <Menu.Root>
                    <Menu.Trigger data-tour="menu-pengguna" className="flex min-h-touch min-w-0 items-center gap-2 rounded-md px-2 text-base font-medium text-text-primary hover:bg-neutral-50">
                        <span className="truncate">{sesi.user.nama}</span>
                        <Ikon nama="chevron" ukuran="sm" />
                    </Menu.Trigger>
                    <Menu.Portal>
                        <Menu.Content align="end" sideOffset={4} className="z-40 flex min-w-sidebar flex-col rounded-md border border-border-subtle bg-surface-default p-1 shadow-1">
                            <Menu.Label className="px-4 py-2 text-sm text-text-secondary">{sesi.user.email}</Menu.Label>
                            <Menu.Separator className="my-1 h-px bg-border-subtle" />
                            <Menu.Item className={ITEM} onSelect={() => void navigate({ to: "/profil" })}>Profil</Menu.Item>
                            <Menu.Item className={ITEM} onSelect={() => void navigate({ to: "/profil/keamanan" })}>Keamanan &amp; 2FA</Menu.Item>
                            {can("user.reset_password") && <Menu.Item className={ITEM} onSelect={() => void navigate({ to: "/permintaan-reset-password" })}>Permintaan Reset Password</Menu.Item>}
                            <Menu.Item className={ITEM} onSelect={() => void navigate({ to: "/profil/keamanan", hash: "perangkat" })}>Perangkat Terhubung</Menu.Item>
                            {can("notification.manage_own") && (
                                <Menu.Item className={ITEM} onSelect={() => void navigate({ to: "/profil/notifikasi" })}>
                                    <Ikon nama="notifikasi" />
                                    Preferensi Notifikasi
                                </Menu.Item>
                            )}
                            <Menu.Item className={ITEM} onSelect={tur.mulaiUtama}>
                                <Ikon nama="bantuan" />
                                Tur Aplikasi
                            </Menu.Item>
                            <Menu.Item className={ITEM} onSelect={() => void keluar(false)}>
                                <Ikon nama="keluar" />
                                Keluar
                            </Menu.Item>
                            <Menu.Item className={ITEM} onSelect={() => { setGalat(undefined); setConfirmAll(true); }}>
                                <Ikon nama="keluar" />
                                Keluar dari semua perangkat
                            </Menu.Item>
                        </Menu.Content>
                    </Menu.Portal>
                </Menu.Root>
            </div>
            <DialogKonfirmasi buka={confirmAll} onTutup={() => setConfirmAll(false)} judul="Keluar dari semua perangkat?" labelAksi="Keluar semua" sibuk={sibuk} galat={galat} onKonfirmasi={async () => { setSibuk(true); setGalat(undefined); try { await keluar(true); } catch { setGalat("Belum dapat mencabut semua perangkat. Coba lagi."); } finally { setSibuk(false); } }}><p>Anda akan keluar dari perangkat ini dan semua perangkat lain.</p></DialogKonfirmasi>
        </header>
    );
}
