// P-64 Kenaikan Kelas Massal (UX §6 `/pengguna/kenaikan-kelas`; SL-02, SL-04; PR-01-19). Daftar siswa butuh
// `user.view` + `role.view` (role Siswa), tahun ajaran & kelas butuh `setting.view`: izin yang kurang disebut
// dalam Peringatan dan TIDAK ada permintaan ke endpoint tanpa izin (rencana §1a). Laporan per siswa; lulusan
// berkewajiban aktif tampil sebagai daftar terblokir (SL-04).

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useCan } from "../../shared/auth";
import { jalurDrilldown } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { KotakCentang, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import type { ItemKenaikan } from "./api";
import { BATAS_KENAIKAN, aktif, KODE_ROLE_SISWA, daftarPenggunaQuery, galatIsian, prosesKenaikan, roleQuery, tahunAjaranQuery, unitQuery } from "./api";

type PilihanSiswa = { readonly tindakan: "NAIK"; readonly kelas: string } | { readonly tindakan: "LULUS" } | null;
const TH = "bg-surface-subtle px-3 py-2 text-left text-sm font-medium text-text-primary";
const TD = "border-t border-border-subtle px-3 py-2 text-base text-text-primary";

export default function ClassPromotionPage() {
    const can = useCan();
    const kurang = ["user.view", "role.view", "setting.view"].filter((p) => !can(p));
    const siap = kurang.length === 0;
    const roles = useQuery({ ...roleQuery, enabled: siap });
    const siswaRole = roles.data?.find((r) => r.kode === KODE_ROLE_SISWA)?.id;
    const tahun = useQuery({ ...tahunAjaranQuery, enabled: siap });
    const kelas = useQuery({ ...unitQuery("KELAS"), enabled: siap });
    const [page, setPage] = useState(1);
    const siswa = useQuery({ ...daftarPenggunaQuery({ role: siswaRole, status: "AKTIF", page }, 100), enabled: siap && siswaRole !== undefined });
    const [tahunId, setTahunId] = useState("");
    const [pilih, setPilih] = useState<Record<string, PilihanSiswa>>({});
    const [terpilih, setTerpilih] = useState<ReadonlySet<string>>(new Set());
    const [massal, setMassal] = useState("");
    const proses = useMutation({
        mutationFn: (items: ItemKenaikan[]) => prosesKenaikan(Number(tahunId), items),
        // Siswa yang berhasil dikeluarkan dari antrean & pilihan: batch berikutnya tidak mengirim ulang mereka;
        // yang gagal tetap tersisa untuk dikoreksi.
        onSuccess: (h) => {
            const selesai = new Set(h.baris.filter((b) => b.status === "SUKSES").map((b) => String(b.user_id)));
            setPilih((p) => Object.fromEntries(Object.entries(p).filter(([id]) => !selesai.has(id))));
            setTerpilih((t) => new Set([...t].filter((id) => !selesai.has(id))));
        },
    });
    const daftar = jalurDrilldown("P-60");

    if (!siap)
        return (
            <div className="flex flex-col gap-6">
                <h1 className="text-2xl font-semibold text-text-heading">Kenaikan Kelas Massal</h1>
                <Peringatan varian="warning" judul="Data pendukung tidak dapat dibaca">
                    Halaman ini membutuhkan izin {kurang.join(", ")} untuk membaca daftar siswa, tahun ajaran, dan kelas. Hubungi Administrator.
                </Peringatan>
            </div>
        );

    const items: ItemKenaikan[] = Object.entries(pilih).flatMap(([id, p]): ItemKenaikan[] => (p === null ? [] : p.tindakan === "LULUS" ? [{ user_id: Number(id), tindakan: "LULUS" }] : p.kelas === "" ? [] : [{ user_id: Number(id), tindakan: "NAIK", kelas_id: Number(p.kelas) }]));
    const namaSiswa = new Map((siswa.data?.data ?? []).map((s) => [Number(s.id), s.nama]));
    const opsiKelas = (kelas.data ?? []).filter(aktif).map((k) => ({ nilai: k.id, label: k.nama }));
    const hasil = proses.data;
    const terblokir = hasil?.baris.filter((b) => b.kewajiban.length > 0) ?? [];

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-text-heading">Kenaikan Kelas Massal</h1>
                <p className="text-base text-text-secondary">Tetapkan kelas pada tahun ajaran terpilih atau tandai lulus. Maksimal {BATAS_KENAIKAN} siswa per proses.</p>
            </header>

            {tahun.isError || kelas.isError || roles.isError ? (
                <KeadaanGalat galat={tahun.error ?? kelas.error ?? roles.error} onCobaLagi={() => { void tahun.refetch(); void kelas.refetch(); void roles.refetch(); }} />
            ) : (
                <section aria-label="Pengaturan proses" className="grid grid-cols-1 gap-3 rounded-md border border-border-subtle bg-surface-default p-4 md:grid-cols-3">
                    <Pilihan label="Tahun ajaran" required kosong="Pilih tahun ajaran" value={tahunId} opsi={(tahun.data ?? []).map((t) => ({ nilai: t.id, label: t.is_active ? `${t.nama} (aktif)` : t.nama }))} onChange={(e) => { setTahunId(e.target.value); setPilih({}); setTerpilih(new Set()); proses.reset(); }} />
                    <Pilihan label="Kelas untuk siswa terpilih" kosong="Pilih kelas" value={massal} opsi={opsiKelas} onChange={(e) => setMassal(e.target.value)} />
                    <div className="flex items-end gap-2">
                        <Tombol varian="secondary" disabled={terpilih.size === 0 || massal === ""} onClick={() => setPilih((p) => ({ ...p, ...Object.fromEntries([...terpilih].map((id) => [id, { tindakan: "NAIK", kelas: massal } as const])) }))}>
                            Naikkan terpilih
                        </Tombol>
                        <Tombol varian="secondary" disabled={terpilih.size === 0} onClick={() => setPilih((p) => ({ ...p, ...Object.fromEntries([...terpilih].map((id) => [id, { tindakan: "LULUS" } as const])) }))}>
                            Luluskan terpilih
                        </Tombol>
                    </div>
                </section>
            )}

            {roles.isPending || siswa.isPending ? (
                <KeadaanMemuat baris={6} label="Memuat siswa" />
            ) : siswa.isError ? (
                <KeadaanGalat galat={siswa.error} onCobaLagi={() => void siswa.refetch()} />
            ) : siswa.data.data.length === 0 ? (
                <KeadaanKosong judul="Belum ada siswa aktif" pesan="Siswa aktif akan tampil di sini untuk ditetapkan kelasnya." />
            ) : (
                <div className="overflow-auto border border-border-subtle bg-surface-default">
                    <table className="w-full border-collapse">
                        <caption className="sr-only">Siswa aktif</caption>
                        <thead>
                            <tr>
                                <th scope="col" className={TH}>Pilih</th>
                                <th scope="col" className={TH}>Nama</th>
                                <th scope="col" className={TH}>NIS</th>
                                <th scope="col" className={TH}>Tindakan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {siswa.data.data.map((s) => {
                                const p = pilih[s.id] ?? null;
                                return (
                                    <tr key={s.id}>
                                        <td className={TD}>
                                            <KotakCentang label={`Pilih ${s.nama}`} checked={terpilih.has(s.id)} onCheckedChange={(v) => setTerpilih((t) => { const n = new Set(t); if (v) n.add(s.id); else n.delete(s.id); return n; })} />
                                        </td>
                                        <th scope="row" className={`${TD} text-left font-medium`}>{s.nama}</th>
                                        <td className={`${TD} font-mono`}>{s.nip_nis}</td>
                                        <td className={TD}>
                                            <Pilihan
                                                label={`Tindakan untuk ${s.nama}`}
                                                kosong="Tidak diproses"
                                                value={p === null ? "" : p.tindakan === "LULUS" ? "LULUS" : p.kelas}
                                                opsi={[...opsiKelas.map((k) => ({ nilai: k.nilai, label: `Naik ke ${k.label}` })), { nilai: "LULUS", label: "Tandai lulus" }]}
                                                onChange={(e) => setPilih((x) => ({ ...x, [s.id]: e.target.value === "" ? null : e.target.value === "LULUS" ? { tindakan: "LULUS" } : { tindakan: "NAIK", kelas: e.target.value } }))}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {siswa.data.meta.total_pages > 1 && (
                        <nav aria-label="Halaman siswa" className="flex items-center justify-between gap-3 p-3 text-sm text-text-secondary">
                            <Tombol varian="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</Tombol>
                            <span>Halaman {page} dari {siswa.data.meta.total_pages}</span>
                            <Tombol varian="secondary" disabled={page >= siswa.data.meta.total_pages} onClick={() => setPage(page + 1)}>Berikutnya</Tombol>
                        </nav>
                    )}
                </div>
            )}

            {proses.isError && <Peringatan varian="error" judul="Proses ditolak">{galatIsian(proses.error).umum ?? Object.values(galatIsian(proses.error).isian).join(" ")}</Peringatan>}
            <div>
                <Tombol disabled={tahunId === "" || items.length === 0 || items.length > BATAS_KENAIKAN} sibuk={proses.isPending} onClick={() => proses.mutate(items)}>
                    Proses {items.length} siswa
                </Tombol>
            </div>

            {hasil !== undefined && (
                <section aria-labelledby="judul-hasil" className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4">
                    <h2 id="judul-hasil" className="text-lg font-semibold text-text-heading">Laporan hasil</h2>
                    <p role="status" className="text-base text-text-primary">{hasil.sukses} berhasil, {hasil.gagal} gagal dari {hasil.total} siswa.</p>
                    <ul className="flex flex-col gap-2">
                        {hasil.baris.map((b) => (
                            <li key={b.user_id} className="flex flex-wrap items-center gap-2 text-base text-text-primary">
                                <Lencana varian={b.status === "SUKSES" ? "success" : "error"}>{b.status === "SUKSES" ? "Berhasil" : "Gagal"}</Lencana>
                                <span>{namaSiswa.get(b.user_id) ?? `Siswa #${String(b.user_id)}`} — {b.tindakan === "NAIK" ? "naik kelas" : "lulus"}</span>
                                {b.pesan !== null && <span className="text-sm text-text-secondary">{b.pesan}</span>}
                            </li>
                        ))}
                    </ul>
                    {terblokir.length > 0 && (
                        <Peringatan varian="warning" judul="Siswa terblokir oleh kewajiban aktif (SL-04)">
                            <ul className="flex flex-col gap-1">
                                {terblokir.map((b) => (
                                    <li key={b.user_id}>
                                        {namaSiswa.get(b.user_id) ?? `Siswa #${String(b.user_id)}`}: {b.kewajiban.map((k) => k.keterangan).join("; ")}
                                    </li>
                                ))}
                            </ul>
                        </Peringatan>
                    )}
                    {daftar !== null && <a href={daftar} className="inline-flex min-h-control-md items-center self-start rounded-md px-4 text-text-link">Kembali ke Pengguna</a>}
                </section>
            )}
        </div>
    );
}
