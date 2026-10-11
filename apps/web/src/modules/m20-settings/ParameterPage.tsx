// P-70 Parameter Sistem (UX §6 `/pengaturan`; FR-20.1, A1–A3; PR-01-24). Sepuluh kelompok sebagai tab di URL.
// Setiap parameter menampilkan penjelasan & nilai bawaan (AC FR-20.1). Ubah hanya `setting.manage` (keputusan
// 36d): tanpanya isian baca-saja dan tak ada Simpan. Simpan per kelompok mengirim HANYA kunci yang berubah;
// galat rentang server (A1) tampil pada isiannya. Kode aset & denda diperingatkan dampaknya sebelum disimpan.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCan } from "../../shared/auth";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Isian, KotakCentang, Peringatan, Tombol, gabung } from "../../shared/ui/primitives";
import type { Kelompok, Parameter } from "./api";
import { KELOMPOK, LABEL_KELOMPOK, PERINGATAN_DAMPAK, galatIsian, parameterQuery, simpanParameter, waktuWib } from "./api";
import { NavPengaturan } from "./NavPengaturan";

const tampil = (v: unknown): string => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "Ya" : "Tidak") : String(v));

/** Nilai isian → nilai bertipe parameter; `undefined` bila belum sah (dicegah klien sebelum dikirim). */
function nilaiDari(p: Parameter, mentah: string | boolean): unknown {
    if (p.tipe === "BOOLEAN") return mentah === true;
    if (p.tipe === "TEKS") return mentah;
    const t = String(mentah).trim().replace(",", ".");
    if (t === "") return undefined;
    const n = Number(t);
    if (!Number.isFinite(n) || (p.tipe === "BILANGAN_BULAT" && !Number.isInteger(n))) return undefined;
    return n;
}

const nilaiTampil = (p: Parameter): string | boolean => (p.tipe === "BOOLEAN" ? p.value === true : p.value === null || p.value === undefined ? "" : String(p.value));

/**
 * Hanya kunci yang BENAR-BENAR disunting pengguna yang dikirim; masing-masing membawa nilai dasar saat
 * suntingan dimulai. Refetch latar memperbarui isian yang tak disentuh; bila nilai server sebuah kunci yang
 * sedang disunting berubah, isiannya diberi peringatan (menyimpan berarti menimpa).
 */
function FormKelompok({ kelompok, data, bolehUbah, onSibuk }: { readonly kelompok: Kelompok; readonly data: readonly Parameter[]; readonly bolehUbah: boolean; readonly onSibuk: (sibuk: boolean) => void }) {
    const queryClient = useQueryClient();
    const [sunting, setSunting] = useState<Record<string, { readonly nilai: string | boolean; readonly dasar: string | boolean }>>({});
    const [lokal, setLokal] = useState<Record<string, string>>({});
    const [konfirmasi, setKonfirmasi] = useState(false);
    const [tersimpan, setTersimpan] = useState(false);
    const nilai = (p: Parameter) => sunting[p.key]?.nilai ?? nilaiTampil(p);
    const ubah = (p: Parameter, v: string | boolean) => {
        setSunting((s) => ({ ...s, [p.key]: { nilai: v, dasar: s[p.key]?.dasar ?? nilaiTampil(p) } }));
        setTersimpan(false);
    };
    const berubah = data.filter((p) => sunting[p.key] !== undefined && sunting[p.key]?.nilai !== sunting[p.key]?.dasar);
    const simpan = useMutation({
        mutationFn: simpanParameter,
        onSuccess: (baru) => {
            // Cache diperbarui dari keadaannya SEKARANG (bukan salinan saat render) lalu disegarkan dari server.
            queryClient.setQueryData(parameterQuery(kelompok).queryKey, (lama) => lama?.map((p) => baru.find((b) => b.key === p.key) ?? p));
            void queryClient.invalidateQueries({ queryKey: ["settings", kelompok] });
            setSunting((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !baru.some((b) => b.key === k))));
            setKonfirmasi(false);
            setTersimpan(true);
        },
    });
    useEffect(() => {
        onSibuk(simpan.isPending);
        return () => onSibuk(false);
    }, [simpan.isPending, onSibuk]);
    const server = simpan.error === null ? { isian: {} as Readonly<Record<string, string>>, umum: null } : galatIsian(simpan.error);

    function kirim(): void {
        const kurang: Record<string, string> = {};
        const isi: Record<string, unknown> = {};
        for (const p of berubah) {
            const v = nilaiDari(p, nilai(p));
            if (v === undefined) kurang[p.key] = p.tipe === "BILANGAN_BULAT" ? "Isi dengan bilangan bulat." : "Isi dengan angka.";
            else isi[p.key] = v;
        }
        setLokal(kurang);
        if (Object.keys(kurang).length > 0 || Object.keys(isi).length === 0) return;
        simpan.mutate(isi);
    }

    const sibuk = simpan.isPending;
    return (
        <section aria-labelledby={`judul-${kelompok}`} className="flex flex-col gap-4">
            <h2 id={`judul-${kelompok}`} className="text-lg font-semibold text-text-heading">{LABEL_KELOMPOK[kelompok]}</h2>
            {!bolehUbah && <Peringatan varian="info">Anda dapat membaca parameter ini, tetapi hanya Administrator (izin setting.manage) yang dapat mengubahnya.</Peringatan>}
            {tersimpan && berubah.length === 0 && <Peringatan varian="success">Perubahan parameter {LABEL_KELOMPOK[kelompok]} tersimpan dan berlaku pada transaksi berikutnya.</Peringatan>}
            {server.umum !== null && <Peringatan varian="error" judul="Parameter belum tersimpan">{server.umum}</Peringatan>}
            <ul className="flex flex-col gap-3">
                {data.map((p) => {
                    const galat = lokal[p.key] ?? server.isian[p.key];
                    const rentang = p.nilai_min !== null || p.nilai_maks !== null ? `Rentang: ${tampil(p.nilai_min)} – ${tampil(p.nilai_maks)}.` : null;
                    const keterangan = [`Bawaan: ${tampil(p.nilai_bawaan)}.`, rentang, `Terakhir diubah ${waktuWib(p.updated_at)}.`].filter(Boolean).join(" ");
                    return (
                        <li key={p.key} className={gabung("rounded-md border bg-surface-default p-4", berubah.includes(p) ? "border-border-strong" : "border-border-subtle")}>
                            {p.tipe === "BOOLEAN" ? (
                                <div className="flex flex-col gap-1">
                                    <KotakCentang label={p.deskripsi} checked={nilai(p) === true} disabled={!bolehUbah || sibuk} onCheckedChange={(v) => ubah(p, v)} />
                                    <p className="text-sm text-text-secondary">{keterangan}</p>
                                    {galat !== undefined && <p role="alert" className="text-sm text-error-base">{galat}</p>}
                                </div>
                            ) : (
                                <Isian
                                    label={p.deskripsi}
                                    type={p.tipe === "TEKS" ? "text" : "number"}
                                    inputMode={p.tipe === "TEKS" ? undefined : p.tipe === "DESIMAL" ? "decimal" : "numeric"}
                                    step={p.tipe === "DESIMAL" ? "any" : p.tipe === "BILANGAN_BULAT" ? 1 : undefined}
                                    min={p.nilai_min ?? undefined}
                                    max={p.nilai_maks ?? undefined}
                                    value={String(nilai(p))}
                                    readOnly={!bolehUbah}
                                    disabled={sibuk}
                                    bantuan={keterangan}
                                    galat={galat}
                                    onChange={(e) => ubah(p, e.target.value)}
                                />
                            )}
                            {sunting[p.key] !== undefined && sunting[p.key]?.dasar !== nilaiTampil(p) && (
                                <p role="alert" className="mt-1 text-sm text-warning-strong">Nilai di server berubah menjadi {tampil(nilaiTampil(p))} sejak Anda mulai menyunting; menyimpan akan menimpanya.</p>
                            )}
                            <p className="mt-1 font-mono text-xs text-text-tertiary">{p.key}</p>
                        </li>
                    );
                })}
            </ul>
            {bolehUbah && (
                <div className="flex flex-wrap gap-3">
                    <Tombol disabled={berubah.length === 0} sibuk={sibuk} onClick={() => (PERINGATAN_DAMPAK[kelompok] === undefined ? kirim() : setKonfirmasi(true))}>
                        Simpan {LABEL_KELOMPOK[kelompok]}
                    </Tombol>
                    <Tombol varian="secondary" disabled={berubah.length === 0 || sibuk} onClick={() => { setSunting({}); setLokal({}); simpan.reset(); }}>
                        Batalkan perubahan
                    </Tombol>
                </div>
            )}
            <DialogKonfirmasi buka={konfirmasi} onTutup={() => setKonfirmasi(false)} judul={`Simpan perubahan ${LABEL_KELOMPOK[kelompok]}?`} labelAksi="Simpan" sibuk={sibuk} onKonfirmasi={kirim}>
                {PERINGATAN_DAMPAK[kelompok]}
            </DialogKonfirmasi>
        </section>
    );
}

export default function ParameterPage({ kelompok, onKelompok }: { readonly kelompok: Kelompok; readonly onKelompok: (k: Kelompok) => void }) {
    const can = useCan();
    const kueri = useQuery(parameterQuery(kelompok));
    // Tab dikunci selama simpan berjalan (A2): berpindah kelompok di tengah PUT menampilkan nilai lama.
    const [sibuk, setSibuk] = useState(false);
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-text-heading">Parameter Sistem</h1>
                <p className="text-base text-text-secondary">Parameter global yang mengatur perilaku sistem. Perubahan berlaku pada transaksi berikutnya tanpa restart.</p>
            </header>
            <NavPengaturan aktif="P-70" />
            <div role="tablist" aria-label="Kelompok parameter" className="flex flex-wrap gap-1">
                {KELOMPOK.map((k) => (
                    <button key={k} type="button" role="tab" aria-selected={k === kelompok} disabled={sibuk && k !== kelompok} onClick={() => onKelompok(k)} className={gabung("inline-flex min-h-touch items-center rounded-md px-3 text-sm font-medium", k === kelompok ? "bg-neutral-100 text-text-primary" : "text-text-secondary hover:text-text-primary")}>
                        {LABEL_KELOMPOK[k]}
                    </button>
                ))}
            </div>
            {kueri.isPending ? (
                <KeadaanMemuat baris={5} label="Memuat parameter" />
            ) : kueri.isError ? (
                <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />
            ) : kueri.data.length === 0 ? (
                <KeadaanKosong judul="Belum ada parameter di kelompok ini" pesan="Parameter kelompok ini ditambahkan bersama fitur pemakainya." />
            ) : (
                <FormKelompok key={kelompok} kelompok={kelompok} data={kueri.data} bolehUbah={can("setting.manage")} onSibuk={setSibuk} />
            )}
        </div>
    );
}
