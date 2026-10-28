import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Lencana, Peringatan, Tombol } from "../../shared/ui/primitives";
import { buatUlangKode, status2faQuery } from "./account-api";
import { PasswordForm } from "./PasswordForm";
import { KepalaHalaman } from "../../shared/ui/visual";
import { SessionsPanel } from "./SessionsPanel";
import { accountError } from "./account-api";
export default function SecurityPage() {
    const status = useQuery(status2faQuery); const qc = useQueryClient(); const [confirm, setConfirm] = useState(false); const [sibuk, setSibuk] = useState(false); const [galat, setGalat] = useState<string | undefined>(); const [kode, setKode] = useState<readonly string[] | null>(null);
    return <div className="flex min-w-0 flex-col gap-8"><KepalaHalaman judul="Keamanan & 2FA" info={{ judul: "Tentang Keamanan", isi: "Kelola password, verifikasi dua langkah, dan perangkat yang masuk ke akun Anda." }} /><Link to="/profil" className="text-text-link">Kembali ke Profil</Link><PasswordForm />
        <section aria-labelledby="judul-2fa" className="flex min-w-0 flex-col gap-4"><h2 id="judul-2fa" className="text-xl font-semibold">Autentikasi dua faktor</h2>
            {status.isPending ? <KeadaanMemuat label="Memuat status 2FA" /> : status.isError ? <KeadaanGalat galat={status.error} onCobaLagi={() => void status.refetch()} /> : <><Lencana varian={status.data.aktif ? "success" : "neutral"}>{status.data.aktif ? "2FA aktif" : "2FA belum aktif"}</Lencana>
                {status.data.aktif ? <><p>Sisa kode cadangan: {status.data.sisa_kode_cadangan}</p>{status.data.kode_cadangan_menipis && <Peringatan varian="warning">Kode cadangan menipis. Buat ulang dan simpan kode pengganti.</Peringatan>}<Tombol varian="secondary" disabled={kode !== null} onClick={() => { setGalat(undefined); setConfirm(true); }}>Buat ulang kode cadangan</Tombol></> : <Link to="/login/2fa/aktivasi" search={{ tujuan: "/profil/keamanan" }} className="text-text-link">Aktifkan 2FA</Link>}
                <p className="text-sm text-text-secondary">2FA tidak dapat dinonaktifkan sendiri. Bila kehilangan perangkat dan kode cadangan, hubungi Administrator.</p></>}
            {kode && <div className="flex flex-col gap-3 rounded-md border border-border-subtle p-4"><Peringatan varian="warning">Kode hanya tampil kali ini. Simpan di tempat aman sebelum menutupnya; seluruh kode lama tidak berlaku.</Peringatan><ul aria-label="Kode cadangan baru" className="grid grid-cols-1 gap-2 font-mono sm:grid-cols-2">{kode.map((v) => <li key={v}>{v}</li>)}</ul><Tombol onClick={() => setKode(null)}>Saya sudah menyimpan kode</Tombol></div>}
        </section>
        <DialogKonfirmasi buka={confirm} onTutup={() => setConfirm(false)} judul="Ganti seluruh kode cadangan?" labelAksi="Buat kode baru" sibuk={sibuk} galat={galat} onKonfirmasi={async () => { if (sibuk) return; setSibuk(true); setGalat(undefined); try { setKode(await buatUlangKode()); setConfirm(false); await qc.invalidateQueries({ queryKey: status2faQuery.queryKey }); } catch (error) { setGalat(accountError(error)); } finally { setSibuk(false); } }}><p>Kode lama langsung tidak berlaku. Kode pengganti hanya ditampilkan satu kali.</p></DialogKonfirmasi><SessionsPanel />
    </div>;
}
