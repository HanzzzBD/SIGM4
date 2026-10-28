// P-63 Detail Pengguna (UX §6 `/pengguna/{id}`; FR-02.1 langkah 6–7, FR-01.3 A5, FR-01.5 A3/A7; PR-01-19).
// Aksi sebagai drawer bertautan `?aksi=` (UXD-02); setiap aksi hanya tampil bila izinnya dipegang (PM-04) dan
// server tetap menolak (NFR-S-05). Rahasia (password sementara, kode aktivasi) hidup di state komponen ini
// saja dan tampil satu kali; titipan dari P-61 diambil sekali saat halaman dipasang (rahasia.ts).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { KUNCI_ME, useCan, useSesi } from "../../shared/auth";
import { jalurDrilldown } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import type { IsianPengguna, MetodeVerifikasi, Pengguna } from "./api";
import { LABEL_METODE, LABEL_STATUS, METODE_VERIFIKASI, galatIsian, penggunaQuery, resetDuaFaktor, resetPassword, roleQuery, terbitkanKodeAktivasi, ubahPengguna, ubahStatus, unitQuery, waktuWib } from "./api";
import { FormPengguna, PanelRahasia } from "./form";
import { ambilRahasia, useAksiRahasia } from "./rahasia";
import PseudonymizePanel from "./PseudonymizePanel";

export type AksiPengguna = "ubah" | "status" | "reset-password" | "reset-2fa" | "kode-aktivasi";
type Rahasia = { readonly judul: string; readonly label: string; readonly nilai: string; readonly berlakuSampai: string | null };

const AKSI_RAHASIA = {
    "reset-password": { judul: "Reset password", label: "Password sementara", fn: resetPassword, dampak: "Seluruh sesi pengguna dicabut dan kunci login dibuka. Pengguna wajib mengganti password saat masuk." },
    "reset-2fa": { judul: "Reset 2FA", label: "Kode aktivasi 2FA", fn: resetDuaFaktor, dampak: "2FA dinonaktifkan, kode cadangan dihapus, dan seluruh sesi pengguna dicabut. Role wajib 2FA menerima kode aktivasi baru." },
    "kode-aktivasi": { judul: "Terbitkan kode aktivasi 2FA", label: "Kode aktivasi 2FA", fn: terbitkanKodeAktivasi, dampak: "Kode aktivasi sebelumnya tidak berlaku lagi." },
} as const;

function Baris({ label, children }: { readonly label: string; readonly children: ReactNode }) {
    return (
        <div className="grid grid-cols-1 gap-1 border-t border-border-subtle py-3 sm:grid-cols-3">
            <dt className="text-sm text-text-secondary">{label}</dt>
            <dd className="text-base text-text-primary sm:col-span-2">{children}</dd>
        </div>
    );
}

/** Drawer aksi beridentitas: metode verifikasi luring wajib dipilih sebelum penerbitan (FR-01.3, FR-01.5). */
function DrawerRahasia({ jenis, u, onSelesai, onTutup }: { readonly jenis: keyof typeof AKSI_RAHASIA; readonly u: Pengguna; readonly onSelesai: (r: Rahasia | null, pesan: string) => void; readonly onTutup: () => void }) {
    const a = AKSI_RAHASIA[jenis];
    const [metode, setMetode] = useState<MetodeVerifikasi | "">("");
    const [kurang, setKurang] = useState(false);
    const aksi = useAksiRahasia(a.fn);
    const judul = useRef<HTMLHeadingElement>(null);
    useEffect(() => judul.current?.focus(), []);
    async function kirim(): Promise<void> {
        if (metode === "") {
            setKurang(true);
            return;
        }
        const h = await aksi.jalankan(u.id, metode);
        if (h === undefined) return;
        const sesi = h.sesiDicabut === null ? "" : ` ${String(h.sesiDicabut)} sesi dicabut.`;
        onSelesai(h.rahasia === null ? null : { judul: `${a.judul} untuk ${u.nama}`, label: a.label, nilai: h.rahasia, berlakuSampai: h.berlakuSampai }, `${a.judul} berhasil.${sesi}`);
    }
    return (
        <section aria-labelledby="judul-aksi" role="dialog" aria-modal="false" className="flex flex-col gap-4 rounded-md border border-border-strong bg-surface-default p-4 shadow-1">
            <h2 ref={judul} tabIndex={-1} id="judul-aksi" className="text-lg font-semibold text-text-heading outline-none">
                {a.judul}: {u.nama}
            </h2>
            <p className="text-base text-text-secondary">{a.dampak}</p>
            <Pilihan label="Metode verifikasi identitas" required kosong="Pilih metode" value={metode} galat={kurang ? "Metode verifikasi wajib dipilih." : undefined} opsi={METODE_VERIFIKASI.map((m) => ({ nilai: m, label: LABEL_METODE[m] }))} onChange={(e) => { setMetode(e.target.value as MetodeVerifikasi | ""); setKurang(false); }} />
            {aksi.galat !== null && <Peringatan varian="error" judul="Aksi tidak dapat dijalankan">{galatIsian(aksi.galat).umum ?? Object.values(galatIsian(aksi.galat).isian).join(" ")}</Peringatan>}
            <div className="flex flex-wrap gap-3">
                <Tombol varian="danger" sibuk={aksi.sibuk} onClick={() => void kirim()}>
                    {a.judul}
                </Tombol>
                <Tombol varian="secondary" disabled={aksi.sibuk} onClick={onTutup}>
                    Batal
                </Tombol>
            </div>
        </section>
    );
}

export default function UserDetailPage({ id, aksi, onAksi }: { readonly id: string; readonly aksi?: AksiPengguna | undefined; readonly onAksi: (a: AksiPengguna | undefined) => void }) {
    const can = useCan();
    const queryClient = useQueryClient();
    // Titipan P-61 diambil sekali saat dipasang; muat ulang/Back tidak menampilkannya lagi.
    const [rahasia, setRahasia] = useState<Rahasia | null>(() => {
        const r = ambilRahasia(`buat:${id}`);
        return r === null ? null : { judul: "Pengguna berhasil dibuat", label: "Password sementara", nilai: r, berlakuSampai: null };
    });
    const [pesan, setPesan] = useState<string | null>(null);
    const kueri = useQuery(penggunaQuery(id));
    const roles = useQuery({ ...roleQuery, enabled: can("role.view") });
    const units = useQuery({ ...unitQuery(), enabled: can("setting.view") });
    const sesi = useSesi();
    const segarkan = (u: Pengguna) => {
        // Menyunting akun sendiri (nama, telepon): identitas sesi `/me` ikut disegarkan.
        if (u.id === sesi.user.id) void queryClient.invalidateQueries({ queryKey: KUNCI_ME });
        queryClient.setQueryData(penggunaQuery(id).queryKey, u);
        void queryClient.invalidateQueries({ queryKey: ["users", "daftar"] });
    };
    const ubah = useMutation({ mutationFn: (isian: IsianPengguna) => ubahPengguna(id, isian), onSuccess: (u) => { segarkan(u); setPesan("Perubahan pengguna tersimpan."); onAksi(undefined); } });
    const status = useMutation({ mutationFn: (alasan: string) => ubahStatus(id, kueri.data?.status === "AKTIF" ? "NONAKTIF" : "AKTIF", kueri.data?.status === "AKTIF" ? alasan : undefined), onSuccess: (u) => { segarkan(u); setPesan(`Pengguna ${LABEL_STATUS[u.status].toLowerCase()}.`); onAksi(undefined); } });
    // FR-18.2 A2: Riwayat Perubahan hanya bagi pemegang activity_log.view (P-73), dan hanya bila P-73 terdaftar.
    const riwayat = can("activity_log.view") ? jalurDrilldown(`P-73?entitas=users&entitas_id=${id}`) : null;

    if (kueri.isPending) return <KeadaanMemuat baris={6} label="Memuat pengguna" />;
    if (kueri.isError) return <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />;
    const u = kueri.data;
    const namaRole = roles.data?.find((r) => r.id === u.role_id)?.nama;
    const namaUnit = u.work_unit_id === null ? "—" : (units.data?.find((x) => x.id === u.work_unit_id)?.nama ?? "—");
    const aktif = u.status === "AKTIF";

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-semibold text-text-heading">{u.nama}</h1>
                    <span>
                        <Lencana varian={aktif ? "success" : "neutral"}>{LABEL_STATUS[u.status]}</Lencana>
                    </span>
                </div>
                {aksi === undefined && rahasia === null && !u.pseudonymized_at && (
                    <div className="flex flex-wrap gap-2">
                        {can("user.update") && <Tombol varian="secondary" onClick={() => onAksi("ubah")}>Ubah</Tombol>}
                        {can("user.update") && <Tombol varian={aktif ? "danger" : "secondary"} onClick={() => onAksi("status")}>{aktif ? "Nonaktifkan" : "Aktifkan"}</Tombol>}
                        {can("user.reset_password") && <Tombol varian="secondary" onClick={() => onAksi("reset-password")}>Reset Password</Tombol>}
                        {can("user.reset_2fa") && <Tombol varian="secondary" onClick={() => onAksi("reset-2fa")}>Reset 2FA</Tombol>}
                        {can("user.reset_2fa") && <Tombol varian="secondary" onClick={() => onAksi("kode-aktivasi")}>Terbitkan Kode Aktivasi 2FA</Tombol>}
                        {riwayat !== null && <a href={riwayat} className="inline-flex min-h-control-md items-center rounded-md px-4 text-base font-medium text-text-link">Riwayat Perubahan</a>}
                    </div>
                )}
            </header>

            {pesan !== null && <Peringatan varian="success">{pesan}</Peringatan>}
            {u.pseudonymized_at && <Peringatan varian="info">Akun telah dipseudonimkan pada {waktuWib(u.pseudonymized_at)}. Identitas tidak dapat dipulihkan dan akun tidak dapat diaktifkan atau disunting.</Peringatan>}
            {!aktif && !u.pseudonymized_at && sesi.user.role_kode === "R-01" && sesi.user.id !== u.id && can("user.update") && sesi.permissions["user.update"] === "all" && aksi === undefined && <PseudonymizePanel key={u.id} id={u.id} nama={u.nama} />}
            {rahasia !== null && <PanelRahasia judul={rahasia.judul} label={rahasia.label} rahasia={rahasia.nilai} berlakuSampai={rahasia.berlakuSampai} onTutup={() => setRahasia(null)} />}

            {aksi === "ubah" && can("user.update") && !u.pseudonymized_at && (
                <section aria-labelledby="judul-ubah" className="rounded-md border border-border-strong bg-surface-default p-4 shadow-1">
                    <h2 id="judul-ubah" className="mb-4 text-lg font-semibold text-text-heading">Ubah pengguna</h2>
                    <FormPengguna awal={u} labelKirim="Simpan perubahan" sibuk={ubah.isPending} galat={ubah.error} onKirim={(isian) => ubah.mutate(isian)} onBatal={() => { ubah.reset(); onAksi(undefined); }} />
                </section>
            )}
            {(aksi === "reset-password" || aksi === "reset-2fa" || aksi === "kode-aktivasi") && !u.pseudonymized_at && can(aksi === "reset-password" ? "user.reset_password" : "user.reset_2fa") && (
                <DrawerRahasia key={aksi} jenis={aksi} u={u} onTutup={() => onAksi(undefined)} onSelesai={(r, p) => { setRahasia(r); setPesan(p); onAksi(undefined); }} />
            )}
            <DialogKonfirmasi
                buka={aksi === "status" && can("user.update") && !u.pseudonymized_at}
                onTutup={() => { status.reset(); onAksi(undefined); }}
                judul={aktif ? `Nonaktifkan ${u.nama}?` : `Aktifkan ${u.nama}?`}
                labelAksi={aktif ? "Nonaktifkan" : "Aktifkan"}
                varian={aktif ? "danger" : "primary"}
                {...(aktif ? { labelAlasan: "Alasan penonaktifan" } : {})}
                sibuk={status.isPending}
                galat={status.error === null ? undefined : (galatIsian(status.error).umum ?? Object.values(galatIsian(status.error).isian).join(" "))}
                onKonfirmasi={(alasan) => status.mutate(alasan)}
            >
                {aktif ? "Pengguna tidak dapat masuk sampai diaktifkan kembali. Data transaksinya tetap tersimpan." : "Pengguna dapat masuk kembali dengan akunnya."}
            </DialogKonfirmasi>

            <section aria-labelledby="judul-profil" className="rounded-md border border-border-subtle bg-surface-default p-4">
                <h2 id="judul-profil" className="mb-2 text-lg font-semibold text-text-heading">Profil</h2>
                <dl>
                    <Baris label="Email">{u.email}</Baris>
                    <Baris label="NIP/NIS">{u.nip_nis ?? "—"}</Baris>
                    <Baris label="Dinonaktifkan">{u.deactivated_at ? waktuWib(u.deactivated_at) : "—"}</Baris>
                    {can("role.view") && <Baris label="Role">{namaRole ?? "—"}</Baris>}
                    {can("setting.view") && <Baris label="Unit kerja">{namaUnit}</Baris>}
                    <Baris label="Telepon">{u.telepon ?? "—"}</Baris>
                    <Baris label="Login terakhir">{u.login_terakhir_pada === null ? "Belum pernah masuk" : waktuWib(u.login_terakhir_pada)}</Baris>
                    <Baris label="Wajib ganti password">{u.must_change_password ? "Ya" : "Tidak"}</Baris>
                    <Baris label="Persetujuan wali">{u.consent_guardian_at === null ? "Belum terekam" : waktuWib(u.consent_guardian_at)}</Baris>
                    <Baris label="Dibuat">{waktuWib(u.created_at)}</Baris>
                </dl>
            </section>
        </div>
    );
}
