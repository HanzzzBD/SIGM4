import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KUNCI_ME } from "../../shared/auth";
import { Isian, Peringatan, Tombol } from "../../shared/ui/primitives";
import { gantiPassword } from "./api";
import { ATURAN_PASSWORD } from "./GantiPasswordPage";
import { galatIsian, pesanUmum } from "./galat";
export function PasswordForm() {
    const qc = useQueryClient(); const [lama, setLama] = useState(""); const [baru, setBaru] = useState(""); const [konfirmasi, setKonfirmasi] = useState(""); const [sibuk, setSibuk] = useState(false); const [galat, setGalat] = useState<string | null>(null); const [sukses, setSukses] = useState(false);
    return <section aria-labelledby="judul-password" className="flex flex-col gap-4"><h2 id="judul-password" className="text-xl font-semibold">Ganti password</h2>
        <form className="flex max-w-xl flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); if (sibuk) return; setGalat(null); setSukses(false); if (baru !== konfirmasi) { setGalat("Konfirmasi password tidak sama."); return; } setSibuk(true); try { await gantiPassword(lama, baru); setLama(""); setBaru(""); setKonfirmasi(""); await qc.invalidateQueries({ queryKey: KUNCI_ME }); await qc.invalidateQueries({ queryKey: ["account", "sessions"] }); setSukses(true); } catch (error) { setGalat(galatIsian(error, "password_lama") ?? galatIsian(error, "password_baru") ?? pesanUmum(error)); } finally { setSibuk(false); } }}>
            {galat && <Peringatan varian="error">{galat}</Peringatan>}{sukses && <Peringatan varian="success">Password berubah. Sesi lain telah dicabut; perangkat ini tetap masuk.</Peringatan>}
            <Isian label="Password saat ini" type="password" autoComplete="current-password" required value={lama} disabled={sibuk} onChange={(e) => setLama(e.target.value)} />
            <Isian label="Password baru" type="password" autoComplete="new-password" required maxLength={512} value={baru} disabled={sibuk} onChange={(e) => setBaru(e.target.value)} />
            <ul aria-label="Syarat password baru" className="text-sm">{ATURAN_PASSWORD.map((a) => <li key={a.label}>{a.label}: {a.uji(baru) ? "terpenuhi" : "belum terpenuhi"}</li>)}</ul><p className="text-sm text-text-secondary">Server juga memeriksa password bocor, nama/email, dan 3 password terakhir.</p>
            <Isian label="Konfirmasi password baru" type="password" autoComplete="new-password" required value={konfirmasi} disabled={sibuk} validasi={(v) => (v === baru ? undefined : "Konfirmasi password tidak sama dengan password baru.")} onChange={(e) => setKonfirmasi(e.target.value)} /><Tombol type="submit" sibuk={sibuk}>Simpan password</Tombol>
        </form></section>;
}
