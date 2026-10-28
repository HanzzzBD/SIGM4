// Formulir pengguna bersama P-61 (tambah) dan aksi Ubah P-63 (FR-02.1 langkah 2 & 6). Role wajib dan hanya
// dapat dipilih bila `role.view` dipegang; tanpanya formulir tidak dapat dikirim (rencana §1a). Consent wali
// hanya untuk role Siswa (DP-02). Galat server per isian ditampilkan pada isiannya (`error.details`).

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { useCan, useSesi } from "../../shared/auth";
import { KotakCentang, Isian, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import type { IsianPengguna, Pengguna } from "./api";
import { KODE_ROLE_SISWA, aktif, galatIsian, roleQuery, unitQuery } from "./api";

export function FormPengguna({ awal, labelKirim, sibuk, galat, onKirim, onBatal }: {
    readonly awal?: Pengguna | undefined;
    readonly labelKirim: string;
    readonly sibuk: boolean;
    readonly galat: unknown;
    readonly onKirim: (isian: IsianPengguna) => void;
    readonly onBatal: () => void;
}) {
    // BR-069: email dan role akun sendiri tidak dapat diubah (ditegakkan juga di server).
    const sesi = useSesi();
    const sendiri = awal !== undefined && awal.id === sesi.user.id;
    const can = useCan();
    const bolehRole = can("role.view");
    const roles = useQuery({ ...roleQuery, enabled: bolehRole });
    const units = useQuery({ ...unitQuery(), enabled: can("setting.view") });
    const [nama, setNama] = useState(awal?.nama ?? "");
    const [email, setEmail] = useState(awal?.email ?? "");
    const [nip, setNip] = useState(awal?.nip_nis ?? "");
    const [role, setRole] = useState(awal?.role_id ?? "");
    const [unit, setUnit] = useState(awal?.work_unit_id ?? "");
    const [telepon, setTelepon] = useState(awal?.telepon ?? "");
    const [consent, setConsent] = useState(awal?.consent_guardian_at != null);
    const [lokal, setLokal] = useState<Record<string, string>>({});
    const server = galat === null || galat === undefined ? { isian: {} as Readonly<Record<string, string>>, umum: null } : galatIsian(galat);
    const siswa = (roles.data ?? []).find((r) => r.id === role)?.kode === KODE_ROLE_SISWA;
    const g = (k: string) => lokal[k] ?? server.isian[k];

    function kirim(e: FormEvent): void {
        e.preventDefault();
        const kurang: Record<string, string> = {};
        if (nama.trim() === "") kurang["nama"] = "Nama wajib diisi.";
        if (email.trim() === "") kurang["email"] = "Email wajib diisi.";
        if (nip.trim() === "") kurang["nip_nis"] = "NIP/NIS wajib diisi.";
        if (role === "") kurang["role_id"] = "Role wajib dipilih.";
        if (siswa && !consent) kurang["consent_wali"] = "Akun siswa wajib disertai persetujuan wali (DP-02).";
        setLokal(kurang);
        if (Object.keys(kurang).length > 0) return;
        onKirim({
            nama: nama.trim(),
            email: email.trim(),
            nip_nis: nip.trim(),
            role_id: Number(role),
            // Tanpa `setting.view` isian unit tersembunyi: penugasan lama DIPERTAHANKAN (PUT pengganti penuh).
            ...(can("setting.view") ? { work_unit_id: unit === "" ? null : Number(unit) } : awal === undefined ? {} : { work_unit_id: awal.work_unit_id === null ? null : Number(awal.work_unit_id) }),
            telepon: telepon.trim() === "" ? null : telepon.trim(),
            ...(siswa ? { consent_wali: consent } : {}),
        });
    }

    return (
        <form noValidate onSubmit={kirim} className="flex flex-col gap-4">
            {!bolehRole && (
                <Peringatan varian="warning" judul="Role tidak dapat dipilih">
                    Akun Anda tidak memiliki izin melihat role (role.view), sehingga pengguna tidak dapat disimpan. Hubungi Administrator.
                </Peringatan>
            )}
            {server.umum !== null && <Peringatan varian="error" judul="Data belum tersimpan">{server.umum}</Peringatan>}
            <Isian label="Nama lengkap" required maxLength={150} value={nama} galat={g("nama")} onChange={(e) => setNama(e.target.value)} />
            <Isian label="Email" type="email" required maxLength={150} value={email} disabled={sendiri} {...(sendiri ? { bantuan: "Email akun sendiri tidak dapat diubah." } : {})} galat={g("email")} onChange={(e) => setEmail(e.target.value)} />
            <Isian label="NIP/NIS" required maxLength={30} value={nip} galat={g("nip_nis")} onChange={(e) => setNip(e.target.value)} />
            {bolehRole && <Pilihan label="Role" required kosong="Pilih role" value={role} disabled={sendiri} bantuan={sendiri ? "Role akun sendiri tidak dapat diubah." : undefined} galat={g("role_id")} opsi={(roles.data ?? []).map((r) => ({ nilai: r.id, label: r.nama }))} onChange={(e) => setRole(e.target.value)} />}
            {can("setting.view") && <Pilihan label="Unit kerja" kosong="Tanpa unit kerja" value={unit} galat={g("work_unit_id")} opsi={(units.data ?? []).filter((u) => aktif(u) || u.id === awal?.work_unit_id).map((u) => ({ nilai: u.id, label: aktif(u) ? u.nama : `${u.nama} (nonaktif)` }))} onChange={(e) => setUnit(e.target.value)} />}
            <Isian label="Telepon" type="tel" maxLength={20} value={telepon} galat={g("telepon")} onChange={(e) => setTelepon(e.target.value)} />
            {siswa && (
                <div className="flex flex-col gap-1">
                    <KotakCentang label="Persetujuan wali sudah dikumpulkan sekolah" checked={consent} disabled={awal?.consent_guardian_at != null} onCheckedChange={setConsent} />
                    {g("consent_wali") !== undefined && <p role="alert" className="text-sm text-error-base">{g("consent_wali")}</p>}
                </div>
            )}
            <div className="flex flex-wrap gap-3">
                <Tombol type="submit" sibuk={sibuk} disabled={!bolehRole}>
                    {labelKirim}
                </Tombol>
                <Tombol varian="secondary" disabled={sibuk} onClick={onBatal}>
                    Batal
                </Tombol>
            </div>
        </form>
    );
}

/** Rahasia sekali tampil (BR-070c): dinyatakan sebelum ditutup; tidak dapat dibaca ulang. */
export function PanelRahasia({ judul, label, rahasia, berlakuSampai, onTutup }: { readonly judul: string; readonly label: string; readonly rahasia: string; readonly berlakuSampai?: string | null | undefined; readonly onTutup: () => void }) {
    return (
        <section aria-labelledby="judul-rahasia" className="flex flex-col gap-3 rounded-md border border-border-strong bg-surface-default p-4 shadow-1">
            <h2 id="judul-rahasia" className="text-lg font-semibold text-text-heading">
                {judul}
            </h2>
            <Peringatan varian="warning" judul="Hanya tampil satu kali">
                Sampaikan secara langsung kepada pemilik akun. Setelah panel ini ditutup atau halaman dimuat ulang, nilainya tidak dapat ditampilkan lagi.
            </Peringatan>
            <p className="text-sm text-text-secondary">{label}</p>
            <p className="break-all font-mono text-xl font-semibold text-text-primary" data-rahasia>
                {rahasia}
            </p>
            {berlakuSampai != null && <p className="text-sm text-text-secondary">Berlaku sampai {new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }).format(new Date(berlakuSampai))} WIB.</p>}
            <div>
                <Tombol onClick={onTutup}>Sudah saya catat, tutup</Tombol>
            </div>
        </section>
    );
}
