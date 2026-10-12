import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Isian, Peringatan, Tombol } from "../../shared/ui/primitives";
import { KerangkaMasuk } from "./LoginPage";
import { ajukanReset } from "./account-api";
import { pesanUmum } from "./galat";
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState(""); const [sibuk, setSibuk] = useState(false); const [terkirim, setTerkirim] = useState(false); const [galat, setGalat] = useState<string | null>(null);
    return <KerangkaMasuk judul="Lupa password"><form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); setSibuk(true); setGalat(null); try { await ajukanReset(email.trim()); setTerkirim(true); setEmail(""); } catch (error) { setGalat(pesanUmum(error)); } finally { setSibuk(false); } }}>
        <p>Administrator akan memverifikasi identitas Anda sebelum menerbitkan password sementara.</p>
        {terkirim && <Peringatan varian="success">Permintaan diterima. Hubungi Administrator untuk verifikasi identitas.</Peringatan>}{galat && <Peringatan varian="error">{galat}</Peringatan>}
        <Isian label="Email" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Tombol type="submit" sibuk={sibuk} disabled={!email.trim()}>Ajukan reset password</Tombol><Link to="/login" className="text-text-link">Kembali ke Login</Link>
    </form></KerangkaMasuk>;
}
