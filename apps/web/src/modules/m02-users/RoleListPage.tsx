// P-65 Role & Permission (UX §6 `/role`; FR-02.2 langkah 1–2, A2; PR-01-20). Daftar role + jumlah pengguna &
// permission aktif; "Salin sebagai templat" (`role.update`) membuat role kustom lewat `POST /roles` lalu membuka
// matriksnya. R-01/R-03/R-07 tidak menawarkan salin (BR-069a) — server tetap menolak bila dipaksa.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useCan } from "../../shared/auth";
import { jalurDrilldown } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Isian, Lencana, Peringatan, Tombol } from "../../shared/ui/primitives";
import type { Role } from "./roles-api";
import { BUKAN_TEMPLATE, daftarRoleQuery, pesanGalat, salinRole } from "./roles-api";

const TH = "sticky top-0 h-header-table bg-surface-subtle px-4 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-3 text-base text-text-primary";

function DialogSalin({ sumber, onTutup, onDibuat }: { readonly sumber: Role; readonly onTutup: () => void; readonly onDibuat: (r: Role) => void }) {
    const [nama, setNama] = useState("");
    const [deskripsi, setDeskripsi] = useState("");
    const [kurang, setKurang] = useState(false);
    const salin = useMutation({ mutationFn: salinRole, onSuccess: onDibuat });
    return (
        <Dialog.Root open onOpenChange={(o) => { if (!o && !salin.isPending) onTutup(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-overlay" />
                <Dialog.Content className="fixed top-1/2 left-1/2 flex w-full max-w-modal-sm -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border-subtle bg-surface-default p-6 shadow-2">
                    <Dialog.Title className="text-lg font-semibold text-text-heading">Salin {sumber.nama} sebagai role baru</Dialog.Title>
                    <Dialog.Description className="text-base text-text-secondary">
                        Role baru memperoleh seluruh permission beserta cakupan datanya dari {sumber.nama}; sesuaikan matriksnya setelah dibuat.
                    </Dialog.Description>
                    <Isian label="Nama role" required maxLength={100} value={nama} galat={kurang ? "Nama role wajib diisi." : undefined} onChange={(e) => { setNama(e.target.value); setKurang(false); }} />
                    <Isian label="Deskripsi" maxLength={500} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} />
                    {salin.isError && <p role="alert" className="text-sm text-error-base">{pesanGalat(salin.error)}</p>}
                    <footer className="flex flex-wrap justify-end gap-3 border-t border-border-subtle pt-4">
                        <Dialog.Close asChild>
                            <Tombol varian="secondary" disabled={salin.isPending}>Batal</Tombol>
                        </Dialog.Close>
                        <Tombol
                            sibuk={salin.isPending}
                            onClick={() => {
                                if (nama.trim() === "") return setKurang(true);
                                salin.mutate({ sumber_role_id: Number(sumber.id), nama: nama.trim(), deskripsi: deskripsi.trim() === "" ? null : deskripsi.trim() });
                            }}
                        >
                            Buat role
                        </Tombol>
                    </footer>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

export default function RoleListPage({ disimpan, onBuka }: { readonly disimpan?: string | undefined; readonly onBuka: (id: string) => void }) {
    const can = useCan();
    const queryClient = useQueryClient();
    const kueri = useQuery(daftarRoleQuery);
    const [sumber, setSumber] = useState<Role | null>(null);
    const bolehSalin = can("role.update");
    const pengguna = can("user.view") ? jalurDrilldown("P-60") : null;
    const tersimpan = disimpan === undefined ? undefined : kueri.data?.find((r) => r.id === disimpan);

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-text-heading">Role &amp; Permission</h1>
                    <p className="text-base text-text-secondary">Role beserta jumlah pengguna dan permission aktifnya. Perubahan matriks berlaku pada permintaan berikutnya.</p>
                </div>
                {pengguna !== null && <a href={pengguna} className="inline-flex min-h-control-md items-center rounded-md border border-border-strong px-4 text-base font-medium text-text-primary hover:bg-neutral-50">Pengguna</a>}
            </header>
            {tersimpan !== undefined && <Peringatan varian="success">Matriks permission {tersimpan.nama} tersimpan.</Peringatan>}
            {kueri.isPending ? (
                <KeadaanMemuat baris={6} label="Memuat role" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : (
                <div className="overflow-auto border border-border-subtle bg-surface-default">
                    <table className="w-full border-collapse">
                        <caption className="sr-only">Daftar role</caption>
                        <thead>
                            <tr>
                                {["Role", "Kode", "Jenis", "Jumlah pengguna", "Permission aktif", ...(bolehSalin ? ["Aksi"] : [])].map((k) => (
                                    <th key={k} scope="col" className={TH}>{k}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {kueri.data.map((r) => (
                                <tr key={r.id}>
                                    <th scope="row" className={`${TD} text-left font-medium`}>
                                        <a href={`/role/${r.id}`} className="text-text-link hover:text-text-link-hover">{r.nama}</a>
                                        {r.deskripsi !== null && <span className="block text-sm font-regular text-text-secondary">{r.deskripsi}</span>}
                                    </th>
                                    <td className={`${TD} font-mono`}>{r.kode}</td>
                                    <td className={TD}><Lencana varian="neutral">{r.is_system ? "Bawaan" : "Kustom"}</Lencana></td>
                                    <td className={`${TD} tabular-nums`}>{r.jumlah_pengguna}</td>
                                    <td className={`${TD} tabular-nums`}>{r.permissions.length}</td>
                                    {bolehSalin && (
                                        <td className={TD}>
                                            {BUKAN_TEMPLATE.has(r.kode) ? <span className="text-sm text-text-secondary">Tidak dapat disalin</span> : <Tombol varian="secondary" onClick={() => setSumber(r)}>Salin sebagai templat</Tombol>}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {sumber !== null && (
                <DialogSalin
                    sumber={sumber}
                    onTutup={() => setSumber(null)}
                    onDibuat={(r) => {
                        void queryClient.invalidateQueries({ queryKey: ["roles"] });
                        setSumber(null);
                        onBuka(r.id);
                    }}
                />
            )}
        </div>
    );
}
