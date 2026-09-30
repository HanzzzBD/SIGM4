// P-02 Verifikasi 2FA (FR-01.5, F-01). Challenge dari login hidup di memori tab 5 menit
// (SDD-SESS-10). Server menjawab 401 yang sama untuk kode salah dan challenge habis
// (SDD-AUTH-08); klien membedakannya lewat umur challenge. 423 = terkunci (FR-01.5 A1) —
// sisa waktunya boleh tampil karena password sudah terbukti benar.

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../../shared/api";
import { KUNCI_ME } from "../../shared/auth";
import { Isian, Kartu, Peringatan, Tombol } from "../../shared/ui/primitives";
import { ambilTantangan, hapusTantangan, verifikasiDuaFaktor } from "./api";
import type { HasilVerifikasi } from "./api";
import { pesanUmum } from "./galat";
import { KerangkaMasuk, tujuanAman } from "./LoginPage";

const PESAN_KODE_SALAH = "Kode verifikasi salah. Periksa kode di aplikasi authenticator atau kode cadangan Anda.";
const PESAN_HABIS = "Waktu verifikasi habis. Silakan masuk kembali.";

export function VerifikasiDuaFaktorPage({ tujuan }: { readonly tujuan?: string | undefined }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [kode, setKode] = useState("");
    const [galat, setGalat] = useState<string | null>(null);
    /** Keadaan akhir (challenge habis / akun terkunci): satu-satunya jalan adalah Login. */
    const [buntu, setBuntu] = useState<string | null>(null);
    const [menipis, setMenipis] = useState<HasilVerifikasi | null>(null);
    const [sibuk, setSibuk] = useState(false);

    const lanjut = async (h: HasilVerifikasi) => {
        // Urutan gerbang server (SDD-AUTH-09): setelah 2FA, ganti password wajib.
        if (h.user.must_change_password) {
            await navigate({ to: "/ganti-password", search: { tujuan } });
            return;
        }
        await queryClient.invalidateQueries({ queryKey: KUNCI_ME });
        await navigate({ href: tujuanAman(tujuan) });
    };

    const kirim = async (ev: FormEvent) => {
        ev.preventDefault();
        const t = ambilTantangan();
        if (t === null || Date.now() >= t.kedaluwarsaPada) {
            hapusTantangan();
            setBuntu(PESAN_HABIS);
            return;
        }
        setGalat(null);
        setSibuk(true);
        try {
            const h = await verifikasiDuaFaktor(t.challenge_token, kode.trim());
            hapusTantangan();
            // FR-01.5 AC: peringatan kode cadangan menipis pada respons login.
            if (h.kode_cadangan_menipis) setMenipis(h);
            else await lanjut(h);
        } catch (g) {
            if (g instanceof ApiError && g.status === 423) {
                hapusTantangan();
                setBuntu(g.message);
            } else if (g instanceof ApiError && g.status === 401) {
                if (Date.now() >= t.kedaluwarsaPada) {
                    hapusTantangan();
                    setBuntu(PESAN_HABIS);
                } else setGalat(PESAN_KODE_SALAH);
            } else setGalat(pesanUmum(g));
            setKode("");
        } finally {
            setSibuk(false);
        }
    };

    return (
        <KerangkaMasuk judul="Verifikasi dua langkah">
            <Kartu>
                {buntu !== null ? (
                    <div className="flex flex-col gap-5">
                        <Peringatan varian="error">{buntu}</Peringatan>
                        <Tombol varian="secondary" onClick={() => void navigate({ to: "/login", search: { tujuan } })}>
                            Kembali ke halaman masuk
                        </Tombol>
                    </div>
                ) : menipis !== null ? (
                    <div className="flex flex-col gap-5">
                        <Peringatan varian="warning" judul="Kode cadangan hampir habis">
                            Tersisa {String(menipis.sisa_kode_cadangan ?? 0)} kode cadangan. Buat ulang kode cadangan di halaman Keamanan & 2FA agar Anda tidak kehilangan akses.
                        </Peringatan>
                        <Tombol onClick={() => void lanjut(menipis)}>Lanjutkan</Tombol>
                    </div>
                ) : (
                    <form className="flex flex-col gap-5" onSubmit={(ev) => void kirim(ev)} noValidate>
                        {galat !== null && <Peringatan varian="error">{galat}</Peringatan>}
                        <Isian
                            label="Kode verifikasi"
                            bantuan="6 digit dari aplikasi authenticator, atau salah satu kode cadangan."
                            autoComplete="one-time-code"
                            autoFocus
                            required
                            value={kode}
                            onChange={(e) => setKode(e.target.value)}
                        />
                        <Tombol type="submit" sibuk={sibuk} disabled={kode.trim() === ""}>
                            {sibuk ? "Memproses…" : "Verifikasi"}
                        </Tombol>
                    </form>
                )}
            </Kartu>
        </KerangkaMasuk>
    );
}
