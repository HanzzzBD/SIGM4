// P-01 Login (FR-01.1, F-01). Pesan kredensial SATU dan generik — tak pernah membedakan
// email tak terdaftar, password salah, atau akun terkunci (FR-01.1 A1/A2, SDD-SESS-12).
// Urutan gerbang mengikuti server (SDD-AUTH-09): 2FA → ganti password wajib → tujuan.

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, GalatJaringan } from "../../shared/api";
import { KUNCI_ME } from "../../shared/auth";
import { HALAMAN_TERDAFTAR } from "../../shared/navigasi";
import { Isian, Kartu, Peringatan, Tombol } from "../../shared/ui/primitives";
import { login, perluDuaFaktor, simpanTantangan } from "./api";

/** Tujuan setelah login hanya path internal — bukan URL lain (mencegah open redirect). */
export function tujuanAman(tujuan: string | undefined): string {
    return tujuan !== undefined && tujuan.startsWith("/") && !tujuan.startsWith("//") && !tujuan.startsWith("/login") ? tujuan : "/";
}

function pesanGalat(g: unknown): string {
    if (g instanceof GalatJaringan) return g.message;
    if (g instanceof ApiError) {
        if (g.status === 429) return `Terlalu banyak percobaan masuk. Coba lagi dalam ${String(g.tungguDetik ?? 60)} detik.`;
        // 401 & 403 (nonaktif, FR-01.1 A3): kalimat server — sudah generik dan tidak membocorkan akun.
        if (g.status === 401 || g.status === 403) return g.message;
    }
    return "Terjadi gangguan pada sistem. Coba lagi beberapa saat lagi.";
}

export function LoginPage({ tujuan }: { readonly tujuan?: string | undefined }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [galat, setGalat] = useState<string | null>(null);
    const [sibuk, setSibuk] = useState(false);

    const kirim = async (ev: FormEvent) => {
        ev.preventDefault();
        setGalat(null);
        setSibuk(true);
        try {
            const hasil = await login(email, password);
            if (perluDuaFaktor(hasil)) {
                simpanTantangan(hasil);
                await navigate({ href: "/login/2fa" });
                return;
            }
            if (hasil.user.must_change_password) {
                await navigate({ href: "/ganti-password" });
                return;
            }
            await queryClient.invalidateQueries({ queryKey: KUNCI_ME });
            await navigate({ href: tujuanAman(tujuan) });
        } catch (g) {
            setGalat(pesanGalat(g));
            setPassword("");
        } finally {
            setSibuk(false);
        }
    };

    return (
        <main className="flex min-h-full items-center justify-center bg-bg-page px-4 py-12">
            <div className="flex w-full max-w-sm flex-col gap-6">
                <h1 className="text-2xl font-semibold text-text-heading">Masuk ke SIGM4</h1>
                <Kartu>
                    <form className="flex flex-col gap-5" onSubmit={(ev) => void kirim(ev)} noValidate>
                        {galat !== null && <Peringatan varian="error">{galat}</Peringatan>}
                        <Isian label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
                        <Isian label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                        <Tombol type="submit" sibuk={sibuk} disabled={email.trim() === "" || password === ""}>
                            {sibuk ? "Memproses…" : "Masuk"}
                        </Tombol>
                    </form>
                </Kartu>
                <nav aria-label="Tautan halaman masuk" className="flex justify-between text-sm">
                    {HALAMAN_TERDAFTAR["P-04"] !== undefined && (
                        <a className="text-text-link hover:text-text-link-hover" href={HALAMAN_TERDAFTAR["P-04"]}>
                            Lupa password?
                        </a>
                    )}
                    {HALAMAN_TERDAFTAR["P-07"] !== undefined && (
                        <a className="text-text-link hover:text-text-link-hover" href={HALAMAN_TERDAFTAR["P-07"]}>
                            Pemberitahuan Privasi
                        </a>
                    )}
                </nav>
            </div>
        </main>
    );
}
