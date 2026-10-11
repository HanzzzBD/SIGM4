// P-66 Matriks Permission (UX §6 `/role/{id}`; FR-02.2 langkah 3–5, A1; PM-01; PR-01-20). Katalog Lampiran C
// (`GET /permissions`) dikelompokkan per modul; tiap permission: dipegang + cakupan data. Terbaca dengan
// `role.view`; diubah hanya dengan `role.update` — tanpanya seluruh kontrol nonaktif dan tak ada Simpan.
// Permission inti 🔒 Administrator terkunci (A1); penolakan server tetap ditampilkan apa adanya.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KUNCI_ME, useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { KotakCentang, Lencana, Peringatan, Tombol } from "../../shared/ui/primitives";
import type { Permission, Role, Scope } from "./roles-api";
import { KODE_ADMINISTRATOR, LABEL_SCOPE, SCOPE, daftarRoleQuery, katalogQuery, pesanGalat, simpanMatriks } from "./roles-api";

/** FR-02.2 langkah 3: matriks modul × aksi — aksi baku lebih dulu, aksi lain menyusul menurut abjad. */
const AKSI_BAKU = ["view", "create", "update", "delete", "approve", "export"];
const urutanAksi = (a: string) => { const i = AKSI_BAKU.indexOf(a); return i === -1 ? AKSI_BAKU.length : i; };

const TH = "bg-surface-subtle px-4 py-2 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-4 py-2 text-base text-text-primary";

/**
 * Draf matriks dipegang terpisah dari kueri: refetch latar (fokus, stale 30 detik) tidak menghapus suntingan.
 * Bila versi role di server berubah selagi disunting, pengguna memilih memuat versi terbaru secara eksplisit.
 */
function Matriks({ role: terkini, katalog, bolehUbah, onSimpan, onBatal }: { readonly role: Role; readonly katalog: readonly Permission[]; readonly bolehUbah: boolean; readonly onSimpan: () => void; readonly onBatal: () => void }) {
    const queryClient = useQueryClient();
    const [role, setRole] = useState(terkini);
    const [pegang, setPegang] = useState<Record<string, Scope | null>>(() => Object.fromEntries(terkini.permissions.map((p) => [p.kode, p.scope])));
    const awal = new Map(role.permissions.map((p) => [p.kode, p.scope]));
    const usang = terkini.role_version !== role.role_version;
    const muatTerbaru = () => {
        setRole(terkini);
        setPegang(Object.fromEntries(terkini.permissions.map((p) => [p.kode, p.scope])));
    };
    const simpan = useMutation({
        mutationFn: () => simpanMatriks(role.id, Object.entries(pegang).flatMap(([kode, scope]) => (scope === null ? [] : [{ kode, scope }]))),
        onSuccess: async () => {
            void queryClient.invalidateQueries({ queryKey: ["roles"] });
            // FR-02.2 pasca-kondisi: bila role ini milik sesi sendiri, menu & gerbang route memakai izin baru
            // seketika — `/me` dimuat ulang SEBELUM navigasi berikutnya dievaluasi.
            await queryClient.refetchQueries({ queryKey: KUNCI_ME });
            onSimpan();
        },
    });
    // FR-02.2 A1: permission inti yang kini dipegang Administrator tidak dapat dicabut.
    const terkunci = (p: Permission) => role.kode === KODE_ADMINISTRATOR && p.inti && awal.has(p.kode);
    const modul = [...new Set(katalog.map((p) => p.modul))];
    const berubah = katalog.some((p) => (pegang[p.kode] ?? null) !== (awal.get(p.kode) ?? null));

    return (
        <div className="flex flex-col gap-6">
            {usang && (
                <Peringatan varian="warning" judul="Role ini baru saja diubah di tempat lain" aksi={<Tombol varian="secondary" onClick={muatTerbaru}>Muat versi terbaru</Tombol>}>
                    Suntingan Anda belum disimpan. Menyimpan sekarang menimpa perubahan tersebut; muat versi terbaru untuk membuang suntingan Anda.
                </Peringatan>
            )}
            {!bolehUbah && <Peringatan varian="info">Anda dapat melihat matriks ini, tetapi tidak dapat mengubahnya (butuh izin role.update).</Peringatan>}
            {role.kode === KODE_ADMINISTRATOR && <Peringatan varian="info" judul="Permission inti terkunci">Permission bertanda kunci tidak dapat dicabut dari Administrator (FR-02.2 A1).</Peringatan>}
            {modul.map((m) => (
                <section key={m} aria-labelledby={`modul-${m}`} className="overflow-auto border border-border-subtle bg-surface-default">
                    <table className="w-full border-collapse">
                        <caption id={`modul-${m}`} className="bg-surface-default px-4 py-3 text-left text-lg font-semibold text-text-heading">{m}</caption>
                        <thead>
                            <tr>
                                <th scope="col" className={TH}>Permission</th>
                                <th scope="col" className={TH}>Aksi</th>
                                <th scope="col" className={TH}>Cakupan data</th>
                            </tr>
                        </thead>
                        <tbody>
                            {katalog.filter((p) => p.modul === m).sort((a, b) => urutanAksi(a.aksi) - urutanAksi(b.aksi) || a.kode.localeCompare(b.kode)).map((p) => {
                                const scope = pegang[p.kode] ?? null;
                                const kunci = terkunci(p);
                                return (
                                    <tr key={p.kode}>
                                        <td className={TD}>
                                            <span className="flex flex-wrap items-center gap-2">
                                                <KotakCentang label={p.deskripsi} checked={scope !== null} disabled={!bolehUbah || kunci} onCheckedChange={(v) => setPegang((x) => ({ ...x, [p.kode]: v ? (awal.get(p.kode) ?? "ALL") : null }))} />
                                                {p.inti && <Lencana varian="neutral">Inti</Lencana>}
                                            </span>
                                        </td>
                                        <td className={`${TD} font-mono text-sm`}>{p.aksi}</td>
                                        <td className={TD}>
                                            <select
                                                aria-label={`Cakupan data: ${p.deskripsi}`}
                                                value={scope ?? ""}
                                                disabled={!bolehUbah || scope === null}
                                                onChange={(e) => setPegang((x) => ({ ...x, [p.kode]: e.target.value as Scope }))}
                                                className="min-h-control-md rounded-sm border border-border-strong bg-surface-default px-4 text-base text-text-primary disabled:bg-neutral-100 disabled:text-text-disabled"
                                            >
                                                {scope === null && <option value="">—</option>}
                                                {SCOPE.map((s) => <option key={s} value={s}>{LABEL_SCOPE[s]}</option>)}
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>
            ))}
            {simpan.isError && <Peringatan varian="error" judul="Matriks belum tersimpan">{pesanGalat(simpan.error)}</Peringatan>}
            {bolehUbah && (
                <div className="flex flex-wrap gap-3">
                    <Tombol disabled={!berubah} sibuk={simpan.isPending} onClick={() => simpan.mutate()}>Simpan matriks</Tombol>
                    <Tombol varian="secondary" disabled={simpan.isPending} onClick={onBatal}>Batal</Tombol>
                </div>
            )}
        </div>
    );
}

export default function RolePermissionPage({ id, onSimpan, onBatal }: { readonly id: string; readonly onSimpan: (id: string) => void; readonly onBatal: () => void }) {
    const can = useCan();
    const roles = useQuery(daftarRoleQuery);
    const katalog = useQuery(katalogQuery);
    if (roles.isPending || katalog.isPending) return <KeadaanMemuat baris={8} label="Memuat matriks permission" />;
    // Galat refetch LATAR tidak menggantikan editor: data terakhir yang termuat tetap dipakai.
    if (roles.data === undefined || katalog.data === undefined) return <KeadaanGalat galat={roles.error ?? katalog.error} onCobaLagi={() => { void roles.refetch(); void katalog.refetch(); }} />;
    const role = roles.data.find((r) => r.id === id);
    if (role === undefined) return <KeadaanKosong judul="Role tidak ditemukan" pesan="Role ini tidak ada atau sudah tidak tersedia." aksi={<Tombol varian="secondary" onClick={onBatal}>Kembali ke daftar role</Tombol>} />;
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-text-heading">Matriks Permission: {role.nama}</h1>
                <p className="text-base text-text-secondary">{role.jumlah_pengguna} pengguna memakai role ini. Perubahan berlaku pada permintaan berikutnya tanpa perlu masuk ulang.</p>
            </header>
            <Matriks key={role.id} role={role} katalog={katalog.data} bolehUbah={can("role.update")} onSimpan={() => onSimpan(role.id)} onBatal={onBatal} />
        </div>
    );
}
