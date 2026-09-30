// P-05 Ganti Password Wajib (FR-01.1 A4, FR-01.4). Tidak ada jalan keluar lain: gerbang
// `mustChangePassword` server memblokir route lain (SDD-AUTH-09). Server satu-satunya
// penentu kebijakan (NFR-S-03a); daftar aturan di bawah isian hanya indikator (keputusan 85d).

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../../shared/api";
import { KUNCI_ME } from "../../shared/auth";
import { Ikon } from "../../shared/ui/icon";
import { Isian, Kartu, Peringatan, Tombol } from "../../shared/ui/primitives";
import { gantiPassword } from "./api";
import { galatIsian, pesanUmum } from "./galat";
import { KerangkaMasuk, tujuanAman } from "./LoginPage";

/** FR-01.4 langkah 3 — bagian kebijakan yang dapat diperiksa tanpa server. */
export const ATURAN_PASSWORD: readonly { readonly label: string; readonly uji: (p: string) => boolean }[] = [
    { label: "Minimal 12 karakter", uji: (p) => p.length >= 12 },
    { label: "Mengandung huruf besar", uji: (p) => /[A-Z]/.test(p) },
    { label: "Mengandung huruf kecil", uji: (p) => /[a-z]/.test(p) },
    { label: "Mengandung angka", uji: (p) => /\d/.test(p) },
];

function IndikatorAturan({ password }: { readonly password: string }) {
    return (
        <div className="flex flex-col gap-2">
            <ul aria-label="Syarat password baru" className="flex flex-col gap-1 text-sm">
                {ATURAN_PASSWORD.map((a) => {
                    const ok = a.uji(password);
                    return (
                        <li key={a.label} className={`flex items-center gap-2 ${ok ? "text-success-strong" : "text-text-secondary"}`}>
                            <Ikon nama={ok ? "sukses" : "belumTerpenuhi"} ukuran="sm" />
                            {a.label}
                            <span className="sr-only">{ok ? "— terpenuhi" : "— belum terpenuhi"}</span>
                        </li>
                    );
                })}
            </ul>
            <p className="text-sm text-text-secondary">Juga diperiksa saat disimpan: tidak ada di daftar password bocor, tidak memuat nama atau email Anda, dan bukan salah satu dari 3 password terakhir.</p>
        </div>
    );
}

interface Galat {
    readonly lama?: string | undefined;
    readonly baru?: string | undefined;
    readonly konfirmasi?: string | undefined;
    readonly umum?: string | undefined;
}

export function GantiPasswordPage({ tujuan }: { readonly tujuan?: string | undefined }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [lama, setLama] = useState("");
    const [baru, setBaru] = useState("");
    const [konfirmasi, setKonfirmasi] = useState("");
    const [galat, setGalat] = useState<Galat>({});
    const [sibuk, setSibuk] = useState(false);

    const kirim = async (ev: FormEvent) => {
        ev.preventDefault();
        if (konfirmasi !== baru) {
            setGalat({ konfirmasi: "Konfirmasi password tidak sama dengan password baru." });
            return;
        }
        setGalat({});
        setSibuk(true);
        try {
            await gantiPassword(lama, baru);
            await queryClient.invalidateQueries({ queryKey: KUNCI_ME });
            await navigate({ href: tujuanAman(tujuan) });
        } catch (g) {
            // Gerbang password mendahului gerbang 2FA (SDD-AUTH-09): role wajib 2FA yang belum
            // terdaftar mengaktifkan 2FA dulu, lalu kembali ke sini (keputusan 85).
            if (g instanceof ApiError && g.kode === "TWO_FACTOR_REQUIRED") {
                await navigate({ to: "/login/2fa/aktivasi", search: { tujuan: tujuan === undefined ? "/ganti-password" : `/ganti-password?tujuan=${encodeURIComponent(tujuan)}` } });
                return;
            }
            const g422 = { lama: galatIsian(g, "password_lama"), baru: galatIsian(g, "password_baru") };
            setGalat(g422.lama !== undefined || g422.baru !== undefined ? g422 : { umum: pesanUmum(g) });
            if (g422.lama !== undefined) setLama("");
        } finally {
            setSibuk(false);
        }
    };

    return (
        <KerangkaMasuk judul="Ganti password">
            <Peringatan varian="info">Anda memakai password sementara. Ganti password sebelum melanjutkan; sesi di perangkat lain akan dikeluarkan.</Peringatan>
            <Kartu>
                <form className="flex flex-col gap-5" onSubmit={(ev) => void kirim(ev)} noValidate>
                    {galat.umum !== undefined && <Peringatan varian="error">{galat.umum}</Peringatan>}
                    <Isian label="Password saat ini" type="password" autoComplete="current-password" required value={lama} galat={galat.lama} onChange={(e) => setLama(e.target.value)} />
                    <Isian label="Password baru" type="password" autoComplete="new-password" required value={baru} galat={galat.baru} onChange={(e) => setBaru(e.target.value)} />
                    <IndikatorAturan password={baru} />
                    <Isian label="Konfirmasi password baru" type="password" autoComplete="new-password" required value={konfirmasi} galat={galat.konfirmasi} onChange={(e) => setKonfirmasi(e.target.value)} />
                    <Tombol type="submit" sibuk={sibuk} disabled={lama === "" || baru === "" || konfirmasi === ""}>
                        {sibuk ? "Menyimpan…" : "Simpan password"}
                    </Tombol>
                </form>
            </Kartu>
        </KerangkaMasuk>
    );
}
