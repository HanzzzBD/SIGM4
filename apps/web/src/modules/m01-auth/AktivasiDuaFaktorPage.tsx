// P-03 Aktivasi 2FA (FR-01.5, F-03). Dicapai role wajib 2FA yang belum terdaftar
// (`/me` → 403 TWO_FACTOR_REQUIRED). Tiga langkah: kode aktivasi dari Administrator
// (BR-070d) → QR + secret + 10 kode cadangan yang tampil SATU kali (BR-070c) → 6 digit.
// Kolom 6 digit baru aktif setelah pengguna menyatakan kode cadangan tersimpan (keputusan 85c).

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../../shared/api";
import { KUNCI_ME } from "../../shared/auth";
import { Isian, Kartu, KotakCentang, Peringatan, Tombol } from "../../shared/ui/primitives";
import { konfirmasiPendaftaran, mulaiPendaftaran } from "./api";
import type { PendaftaranDuaFaktor } from "./api";
import { galatIsian, pesanUmum } from "./galat";
import { KerangkaMasuk, tujuanAman } from "./LoginPage";
import { KodeQr } from "./qr";

/** Isi berkas .txt kode cadangan — tanpa identitas akun, cukup untuk dipakai. */
export function teksKodeCadangan(kode: readonly string[]): string {
    return ["Kode cadangan SIGM4", "Setiap kode hanya dapat dipakai satu kali.", "", ...kode, ""].join("\n");
}

function unduhTeks(nama: string, isi: string): void {
    const url = URL.createObjectURL(new Blob([isi], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nama;
    a.click();
    URL.revokeObjectURL(url);
}

function LangkahKodeAktivasi({ onTerdaftar }: { readonly onTerdaftar: (p: PendaftaranDuaFaktor) => void }) {
    const [kode, setKode] = useState("");
    const [galat, setGalat] = useState<{ readonly isian?: string; readonly umum?: string }>({});
    const [sibuk, setSibuk] = useState(false);
    const kirim = async (ev: FormEvent) => {
        ev.preventDefault();
        setGalat({});
        setSibuk(true);
        try {
            onTerdaftar(await mulaiPendaftaran(kode.trim()));
        } catch (g) {
            // FR-01.5 A5: satu pesan seragam dari server untuk kode belum ada, salah, atau hangus.
            const isian = galatIsian(g, "kode_aktivasi") ?? (g instanceof ApiError && g.kode === "VALIDATION_ERROR" ? g.message : undefined);
            setGalat(isian !== undefined ? { isian } : { umum: pesanUmum(g) });
        } finally {
            setSibuk(false);
        }
    };
    return (
        <Kartu>
            <form className="flex flex-col gap-5" onSubmit={(ev) => void kirim(ev)} noValidate>
                <p className="text-base text-text-primary">Akun Anda wajib memakai verifikasi dua langkah. Masukkan kode aktivasi yang Anda terima langsung dari Administrator.</p>
                {galat.umum !== undefined && <Peringatan varian="error">{galat.umum}</Peringatan>}
                <Isian label="Kode aktivasi" autoComplete="off" required value={kode} galat={galat.isian} onChange={(e) => setKode(e.target.value)} />
                <Tombol type="submit" sibuk={sibuk} disabled={kode.trim() === ""}>
                    {sibuk ? "Memproses…" : "Lanjutkan"}
                </Tombol>
            </form>
        </Kartu>
    );
}

function LangkahPendaftaran({ data, onAktif, onKodeAktivasiHangus }: { readonly data: PendaftaranDuaFaktor; readonly onAktif: () => Promise<void>; readonly onKodeAktivasiHangus: (pesan: string) => void }) {
    const [tersimpan, setTersimpan] = useState(false);
    const [tersalin, setTersalin] = useState(false);
    const [kode, setKode] = useState("");
    const [galat, setGalat] = useState<{ readonly isian?: string; readonly umum?: string }>({});
    const [sibuk, setSibuk] = useState(false);

    const kirim = async (ev: FormEvent) => {
        ev.preventDefault();
        setGalat({});
        setSibuk(true);
        try {
            await konfirmasiPendaftaran(kode.trim());
            await onAktif();
        } catch (g) {
            const hangus = galatIsian(g, "kode_aktivasi");
            if (hangus !== undefined) {
                onKodeAktivasiHangus(hangus);
                return;
            }
            const isian = galatIsian(g, "kode");
            setGalat(isian !== undefined ? { isian } : g instanceof ApiError && g.kode === "VALIDATION_ERROR" ? { umum: g.message } : { umum: pesanUmum(g) });
            setKode("");
        } finally {
            setSibuk(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Kartu>
                <h2 className="text-lg font-semibold text-text-heading">1. Pindai kode QR</h2>
                <p className="text-base text-text-primary">Buka aplikasi authenticator di ponsel Anda, lalu pindai kode berikut.</p>
                <KodeQr isi={data.otpauth_uri} label="Kode QR pendaftaran aplikasi authenticator" />
                <p className="text-sm text-text-secondary">
                    Tidak dapat memindai? Masukkan kunci ini secara manual: <code className="break-all font-mono text-text-primary">{data.secret}</code>
                </p>
            </Kartu>
            <Kartu>
                <h2 className="text-lg font-semibold text-text-heading">2. Simpan kode cadangan</h2>
                <Peringatan varian="warning">Kode cadangan hanya ditampilkan sekali ini. Setiap kode dapat dipakai satu kali untuk masuk bila ponsel Anda hilang.</Peringatan>
                <ol aria-label="Kode cadangan" className="grid grid-cols-2 gap-2 font-mono text-base text-text-primary">
                    {data.kode_cadangan.map((k) => (
                        <li key={k}>{k}</li>
                    ))}
                </ol>
                <div className="flex flex-wrap gap-3">
                    <Tombol
                        varian="secondary"
                        ikon="salin"
                        onClick={() => {
                            void navigator.clipboard?.writeText(data.kode_cadangan.join("\n")).then(() => setTersalin(true));
                        }}
                    >
                        {tersalin ? "Tersalin" : "Salin semua"}
                    </Tombol>
                    <Tombol varian="secondary" ikon="unduh" onClick={() => unduhTeks("kode-cadangan-sigm4.txt", teksKodeCadangan(data.kode_cadangan))}>
                        Unduh .txt
                    </Tombol>
                </div>
                <KotakCentang label="Saya sudah menyimpan 10 kode cadangan di tempat aman" checked={tersimpan} onCheckedChange={setTersimpan} />
            </Kartu>
            <Kartu>
                <h2 className="text-lg font-semibold text-text-heading">3. Konfirmasi</h2>
                <form className="flex flex-col gap-5" onSubmit={(ev) => void kirim(ev)} noValidate>
                    {galat.umum !== undefined && <Peringatan varian="error">{galat.umum}</Peringatan>}
                    <Isian
                        label="Kode 6 digit dari aplikasi authenticator"
                        {...(tersimpan ? {} : { bantuan: "Aktif setelah Anda menyatakan kode cadangan sudah tersimpan." })}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        required
                        disabled={!tersimpan}
                        value={kode}
                        galat={galat.isian}
                        onChange={(e) => setKode(e.target.value.replace(/\D/g, ""))}
                    />
                    <Tombol type="submit" sibuk={sibuk} disabled={!tersimpan || !/^\d{6}$/.test(kode)}>
                        {sibuk ? "Memproses…" : "Aktifkan 2FA"}
                    </Tombol>
                </form>
            </Kartu>
        </div>
    );
}

export function AktivasiDuaFaktorPage({ tujuan }: { readonly tujuan?: string | undefined }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [data, setData] = useState<PendaftaranDuaFaktor | null>(null);
    const [hangus, setHangus] = useState<string | null>(null);
    return (
        <KerangkaMasuk judul="Aktifkan verifikasi dua langkah" lebar="lebar">
            {hangus !== null && <Peringatan varian="error">{hangus}</Peringatan>}
            {data === null ? (
                <LangkahKodeAktivasi
                    onTerdaftar={(p) => {
                        setHangus(null);
                        setData(p);
                    }}
                />
            ) : (
                <LangkahPendaftaran
                    data={data}
                    onAktif={async () => {
                        // Cookie akses baru membawa amr `otp`; `/me` dimuat ulang oleh gerbang sesi.
                        await queryClient.invalidateQueries({ queryKey: KUNCI_ME });
                        await navigate({ href: tujuanAman(tujuan) });
                    }}
                    onKodeAktivasiHangus={(pesan) => {
                        setData(null);
                        setHangus(pesan);
                    }}
                />
            )}
        </KerangkaMasuk>
    );
}
