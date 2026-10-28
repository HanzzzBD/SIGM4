import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { KUNCI_ME, useCan, useSesi } from "../../shared/auth";
import { Isian, Peringatan, Tombol } from "../../shared/ui/primitives";
import { perbaruiProfil, photoQuery, unggahFotoProfil } from "./account-api";
import { accountError } from "./account-api";
import { KeadaanGalat } from "../../shared/states";
import { KepalaHalaman } from "../../shared/ui/visual";

export default function ProfilePage() {
    const sesi = useSesi(); const qc = useQueryClient(); const can = useCan();
    const [nama, setNama] = useState(sesi.user.nama); const [telepon, setTelepon] = useState(sesi.user.telepon ?? "");
    const [file, setFile] = useState<File | null>(null); const [hapus, setHapus] = useState(false); const [sibuk, setSibuk] = useState(false); const [galat, setGalat] = useState<string | null>(null); const [sukses, setSukses] = useState(false);
    const receipt = useRef<{ file: File; id: number } | null>(null);
    const foto = useQuery(photoQuery);
    const kirim = async () => { setGalat(null); setSukses(false); setSibuk(true); try {
        let id: number | null | undefined = hapus ? null : undefined;
        if (file && !hapus) { if (receipt.current?.file !== file) receipt.current = { file, id: await unggahFotoProfil(file) }; id = receipt.current.id; }
        await perbaruiProfil(nama.trim(), telepon.trim() || null, id); await qc.invalidateQueries({ queryKey: KUNCI_ME }); await qc.invalidateQueries({ queryKey: ["account", "profile-photo"] }); setFile(null); setHapus(false); receipt.current = null; setSukses(true);
    } catch (error) { setGalat(accountError(error)); } finally { setSibuk(false); } };
    return <div className="flex min-w-0 flex-col gap-6"><KepalaHalaman judul="Profil" info={{ judul: "Tentang Profil", isi: "Ubah nama, telepon, dan foto profil Anda. Email dan role dikelola Administrator." }} /><nav className="flex flex-wrap gap-4" aria-label="Pengaturan akun"><Link to="/profil/keamanan" className="text-text-link">Keamanan &amp; 2FA</Link>{can("notification.manage_own") && <Link to="/profil/notifikasi" className="text-text-link">Preferensi Notifikasi</Link>}</nav>
        <p className="break-all text-sm text-text-secondary">{sesi.user.email} · Role {sesi.user.role_kode}</p>
        {foto.isError && <KeadaanGalat galat={foto.error} onCobaLagi={() => void foto.refetch()} />}
        {foto.data?.foto_status === "CLEAN" && foto.data.foto_url && <img src={foto.data.foto_url} alt="Foto profil Anda" className="size-24 rounded-full object-cover" />}
        {foto.data?.foto_status && foto.data.foto_status !== "CLEAN" && <Peringatan varian="info">{foto.data.foto_status === "PENDING" ? "Foto sedang diperiksa." : "Foto belum lolos pemeriksaan. Pilih foto pengganti."}</Peringatan>}
        <form className="flex min-w-0 max-w-xl flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (!sibuk) void kirim(); }}>
            {galat && <Peringatan varian="error">{galat}</Peringatan>}{sukses && <Peringatan varian="success">Profil tersimpan.</Peringatan>}
            <Isian label="Nama" required maxLength={200} value={nama} disabled={sibuk} onChange={(e) => setNama(e.target.value)} /><Isian label="Telepon" type="tel" maxLength={30} value={telepon} disabled={sibuk} onChange={(e) => setTelepon(e.target.value)} />
            <Isian label="Foto profil (JPG/PNG, maksimal 2 MB)" type="file" accept="image/jpeg,image/png" disabled={sibuk} onChange={(e) => { const chosen = e.target.files?.[0] ?? null; setFile(chosen); setHapus(false); receipt.current = null; setGalat(chosen && (chosen.size === 0 || chosen.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png"].includes(chosen.type)) ? "Pilih foto JPG/PNG yang berisi gambar, maksimal 2 MB." : null); }} />
            <Tombol varian="secondary" disabled={sibuk} onClick={() => { setFile(null); setHapus(true); }}>Hapus foto profil</Tombol>{hapus && <p>Foto akan dihapus saat profil disimpan.</p>}<Tombol type="submit" sibuk={sibuk} disabled={!nama.trim() || galat?.startsWith("Pilih foto") === true}>Simpan profil</Tombol>
        </form></div>;
}
