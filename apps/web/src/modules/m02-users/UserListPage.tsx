// P-60 Pengguna (UX §6 `/pengguna`; FR-02.1; PR-01-19). Saringan role/status/unit kerja di URL (SDD-FE-10).
// Nama role & unit kerja hanya terbaca bila `role.view`/`setting.view` dipegang (rencana §1a); tanpa itu
// saringan terkait disembunyikan dan kolomnya tidak dirender — halaman tetap berjalan.

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCan } from "../../shared/auth";
import { jalurDrilldown } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { Lencana, Pilihan, Tombol } from "../../shared/ui/primitives";
import type { SaringanPengguna, StatusPengguna } from "./api";
import { LABEL_STATUS, STATUS_PENGGUNA, aktif, daftarPenggunaQuery, roleQuery, unitQuery, waktuWib } from "./api";

const TH = "sticky top-0 h-header-table bg-surface-subtle px-4 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-3 text-base text-text-primary";
const TAUTAN = "inline-flex min-h-control-md items-center rounded-md px-4 text-base font-medium";

export default function UserListPage({ saringan, onSaringan }: { readonly saringan: SaringanPengguna; readonly onSaringan: (s: Partial<SaringanPengguna>) => void }) {
    const can = useCan();
    const navigate = useNavigate();
    const page = saringan.page ?? 1;
    const kueri = useQuery(daftarPenggunaQuery(saringan));
    const roles = useQuery({ ...roleQuery, enabled: can("role.view") });
    const units = useQuery({ ...unitQuery(), enabled: can("setting.view") });
    const namaRole = new Map((roles.data ?? []).map((r) => [r.id, r.nama]));
    const namaUnit = new Map((units.data ?? []).map((u) => [u.id, u.nama]));
    const ubah = (s: Partial<SaringanPengguna>) => onSaringan({ ...s, page: undefined });
    const tersaring = saringan.role !== undefined || saringan.status !== undefined || saringan.unit !== undefined;
    const keRole = can("role.view") ? jalurDrilldown("P-65") : null;
    const tambah = can("user.create") ? jalurDrilldown("P-61") : null;
    const impor = can("user.create") ? jalurDrilldown("P-62") : null;
    const kenaikan = can("user.update") ? jalurDrilldown("P-64") : null;

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-text-heading">Pengguna</h1>
                    <p className="text-base text-text-secondary">Akun pengguna sekolah beserta role, unit kerja, dan statusnya.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {keRole !== null && <a href={keRole} className={`${TAUTAN} border border-border-strong text-text-primary hover:bg-neutral-50`}>Role &amp; Permission</a>}
                    {kenaikan !== null && <a href={kenaikan} className={`${TAUTAN} border border-border-strong text-text-primary hover:bg-neutral-50`}>Kenaikan Kelas Massal</a>}
                    {impor !== null && <a href={impor} className={`${TAUTAN} border border-border-strong text-text-primary hover:bg-neutral-50`}>Impor Pengguna</a>}
                    {tambah !== null && <a href={tambah} className={`${TAUTAN} bg-teal-600 text-text-inverse hover:bg-teal-700`}>Tambah Pengguna</a>}
                </div>
            </header>

            <section aria-label="Saringan pengguna" className="grid grid-cols-1 gap-3 rounded-md border border-border-subtle bg-surface-default p-4 md:grid-cols-3">
                {can("role.view") && <Pilihan label="Role" kosong="Semua role" value={saringan.role ?? ""} opsi={(roles.data ?? []).map((r) => ({ nilai: r.id, label: r.nama }))} onChange={(e) => ubah({ role: e.target.value === "" ? undefined : e.target.value })} />}
                <Pilihan label="Status" kosong="Semua status" value={saringan.status ?? ""} opsi={STATUS_PENGGUNA.map((s) => ({ nilai: s, label: LABEL_STATUS[s] }))} onChange={(e) => ubah({ status: e.target.value === "" ? undefined : (e.target.value as StatusPengguna) })} />
                {can("setting.view") && <Pilihan label="Unit kerja" kosong="Semua unit kerja" value={saringan.unit ?? ""} opsi={(units.data ?? []).map((u) => ({ nilai: u.id, label: aktif(u) ? u.nama : `${u.nama} (nonaktif)` }))} onChange={(e) => ubah({ unit: e.target.value === "" ? undefined : e.target.value })} />}
            </section>

            {kueri.isPending ? (
                <KeadaanMemuat baris={6} label="Memuat pengguna" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : kueri.data.data.length === 0 ? (
                <KeadaanKosong
                    judul={tersaring ? "Tidak ada pengguna yang cocok" : "Belum ada pengguna"}
                    pesan={tersaring ? "Ubah atau hapus saringan untuk melihat pengguna lain." : "Pengguna yang ditambahkan atau diimpor akan muncul di sini."}
                    aksi={tersaring ? <Tombol varian="secondary" onClick={() => onSaringan({ role: undefined, status: undefined, unit: undefined, page: undefined })}>Hapus saringan</Tombol> : undefined}
                />
            ) : (
                <>
                    <div className="overflow-auto border border-border-subtle bg-surface-default">
                        <table className="w-full border-collapse">
                            <caption className="sr-only">Daftar pengguna</caption>
                            <thead>
                                <tr>
                                    {["Nama", "Email", "NIP/NIS", ...(can("role.view") ? ["Role"] : []), ...(can("setting.view") ? ["Unit kerja"] : []), "Status", "Login terakhir"].map((k) => (
                                        <th key={k} scope="col" className={TH}>
                                            {k}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {kueri.data.data.map((u) => (
                                    <tr key={u.id} className="h-row cursor-pointer hover:bg-neutral-50" onClick={() => void navigate({ href: `/pengguna/${u.id}` })}>
                                        <th scope="row" className={`${TD} text-left font-medium`}>
                                            <a href={`/pengguna/${u.id}`} className="text-text-link hover:text-text-link-hover" onClick={(e) => e.stopPropagation()}>
                                                {u.nama}
                                            </a>
                                        </th>
                                        <td className={`${TD} break-all`}>{u.email}</td>
                                        <td className={`${TD} font-mono`}>{u.nip_nis}</td>
                                        {can("role.view") && <td className={TD}>{namaRole.get(u.role_id) ?? "—"}</td>}
                                        {can("setting.view") && <td className={TD}>{u.work_unit_id === null ? "—" : (namaUnit.get(u.work_unit_id) ?? "—")}</td>}
                                        <td className={TD}>
                                            <Lencana varian={u.status === "AKTIF" ? "success" : "neutral"}>{LABEL_STATUS[u.status]}</Lencana>
                                        </td>
                                        <td className={TD}>{u.login_terakhir_pada === null ? "Belum pernah" : waktuWib(u.login_terakhir_pada)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {kueri.data.meta.total_pages > 1 && (
                        <nav aria-label="Halaman pengguna" className="flex items-center justify-between gap-3 text-sm text-text-secondary tabular-nums">
                            <Tombol varian="secondary" disabled={page <= 1} onClick={() => onSaringan({ page: page - 1 === 1 ? undefined : page - 1 })}>
                                Sebelumnya
                            </Tombol>
                            <span>
                                Halaman {page} dari {kueri.data.meta.total_pages}
                            </span>
                            <Tombol varian="secondary" disabled={page >= kueri.data.meta.total_pages} onClick={() => onSaringan({ page: page + 1 })}>
                                Berikutnya
                            </Tombol>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}
