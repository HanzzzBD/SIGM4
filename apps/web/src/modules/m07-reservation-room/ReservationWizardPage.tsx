// P-29 Wizard Pengajuan Reservasi (FR-07.2, UX §7.6.2, UXD-04, PATTERNS §4.3–4.4; PR-03-10).
// Tiga langkah: pilih ruangan & waktu → detail kegiatan → tinjau & ajukan. Langkah 3 menampilkan
// hasil pratinjau server (`POST /reservations/preview`) — tanggal, bentrok, kuota, jalur
// persetujuan — sehingga yang ditinjau persis yang akan dibentuk. Seluruh waktu WIB.
import { RoomReservationBodySchema } from "@sigm4/schemas";
import type { RoomReservationCreated, RoomReservationPreview, TanggalPengajuanRuangan } from "@sigm4/schemas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../../shared/api";
import type { DetailGalat } from "../../shared/api";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Ikon } from "../../shared/ui/icon";
import { Isian, Kartu, KotakCentang, Lencana, Peringatan, Pilihan, Tombol, gabung } from "../../shared/ui/primitives";
import { ajukanReservasi, ketersediaanQuery, pratinjauPengajuan } from "./api";
import { geserHari, jamWib, tanggalPanjang, tanggalWib, tengahMalamWib } from "./kalender";
import { ISIAN_KOSONG, NAMA_HARI, bodyDari, masalahWaktu, opsiJam, ruanganCukup, saranSlot } from "./pengajuan";
import type { IsianWizard } from "./pengajuan";

type Langkah = 1 | 2 | 3;
type Galat = Partial<Record<keyof IsianWizard | "umum", string | undefined>>;

const NAMA_LANGKAH: Record<Langkah, string> = { 1: "Pilih Ruangan & Waktu", 2: "Detail Kegiatan", 3: "Tinjau & Ajukan" };

/** Isian kontrak → isian formulir (galat server & skema ditautkan ke field yang terlihat). */
const FIELD: Readonly<Record<string, keyof IsianWizard>> = {
    room_id: "ruangan",
    waktu_mulai: "mulai",
    waktu_selesai: "selesai",
    nama_kegiatan: "nama_kegiatan",
    jenis_kegiatan: "jenis_kegiatan",
    jumlah_peserta: "jumlah_peserta",
    keperluan: "keperluan",
    kebutuhan_tambahan: "kebutuhan_tambahan",
    keterangan: "keterangan",
    "pengulangan.hari": "hari",
    "pengulangan.sampai": "sampai",
    pengulangan: "hari",
    lewati: "lewati",
};
const LANGKAH_FIELD = (f: keyof IsianWizard): Langkah => (f === "ruangan" || f === "tanggal" || f === "mulai" || f === "selesai" ? 1 : 2);

const KEADAAN: Record<TanggalPengajuanRuangan["keadaan"], { readonly varian: "success" | "error" | "warning" | "neutral"; readonly label: string }> = {
    TERSEDIA: { varian: "success", label: "Tersedia" },
    BENTROK: { varian: "error", label: "Bentrok" },
    TIDAK_SAH: { varian: "warning", label: "Tidak dapat diajukan" },
    DILEWATI: { varian: "neutral", label: "Dilewati" },
};

function galatDari(details: readonly DetailGalat[]): Galat {
    const g: Galat = {};
    for (const d of details) {
        const f = FIELD[d.field] ?? FIELD[d.field.split(".")[0] ?? ""] ?? "umum";
        g[f] ??= d.message;
    }
    return g;
}

/** C-26 penanda langkah wizard: nomor + nama selalu terlihat (PATTERNS §4.3); `aria-current="step"`. */
function IndikatorLangkah({ aktif }: { readonly aktif: Langkah }) {
    return (
        <ol aria-label="Langkah pengajuan" className="flex flex-wrap gap-4">
            {([1, 2, 3] as const).map((n) => (
                <li key={n} aria-current={n === aktif ? "step" : undefined} className="flex items-center gap-2">
                    <span
                        aria-hidden="true"
                        className={gabung(
                            "flex size-icon-lg items-center justify-center rounded-full text-sm font-semibold",
                            n < aktif ? "bg-teal-600 text-text-inverse" : n === aktif ? "border-2 border-teal-600 text-teal-800" : "border border-neutral-300 text-text-secondary",
                        )}
                    >
                        {n < aktif ? <Ikon nama="centang" ukuran="sm" /> : String(n)}
                    </span>
                    <span className={gabung("text-sm", n === aktif ? "font-semibold text-teal-800" : "text-text-secondary")}>
                        {`Langkah ${String(n)}: ${NAMA_LANGKAH[n]}`}
                        {n < aktif && <span className="sr-only"> (selesai)</span>}
                    </span>
                </li>
            ))}
        </ol>
    );
}

function TeksPanjang({ label, value, onChange, galat }: { readonly label: string; readonly value: string; readonly onChange: (v: string) => void; readonly galat?: string | undefined }) {
    const id = `isian-${label.toLowerCase().replace(/\s+/g, "-")}`;
    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={id} className="text-sm font-medium text-text-primary">
                {label}
                <span className="font-regular text-text-secondary"> (opsional)</span>
            </label>
            <textarea
                id={id}
                value={value}
                maxLength={1000}
                rows={3}
                aria-invalid={galat !== undefined || undefined}
                aria-describedby={galat !== undefined ? `${id}-ket` : undefined}
                onChange={(e) => onChange(e.currentTarget.value)}
                className={gabung("rounded-sm bg-surface-default px-4 py-3 text-base text-text-primary hover:border-neutral-500", galat === undefined ? "border border-border-strong" : "border-2 border-border-error")}
            />
            {galat !== undefined && (
                <p id={`${id}-ket`} className="text-sm text-error-base">
                    {galat}
                </p>
            )}
        </div>
    );
}

export default function ReservationWizardPage({
    isianAwal,
    onBatal,
    onKalender,
    onTerbentuk,
}: {
    readonly isianAwal: IsianWizard;
    readonly onBatal: () => void;
    readonly onKalender: (tanggal: string) => void;
    /** UXD-06 (PR-03-27): objek bernomor → berpindah ke Detail Reservasi P-31. Tanpanya, layar hasil sendiri. */
    readonly onTerbentuk?: (hasil: RoomReservationCreated) => void;
}) {
    const [langkah, setLangkah] = useState<Langkah>(1);
    const [isian, setIsian] = useState<IsianWizard>(isianAwal);
    const [galat, setGalat] = useState<Galat>({});
    const [blokir, setBlokir] = useState<readonly string[] | null>(null);
    const [konfirmasiBatal, setKonfirmasiBatal] = useState(false);
    const [hasil, setHasil] = useState<RoomReservationCreated | null>(null);
    const kunci = useRef(new Map<string, string>());
    const judul = useRef<HTMLHeadingElement>(null);

    const ubah = (p: Partial<IsianWizard>) => {
        setIsian((lama) => ({ ...lama, ...p }));
        setGalat((lama) => {
            const baru = { ...lama, umum: undefined };
            for (const k of Object.keys(p) as (keyof IsianWizard)[]) baru[k] = undefined;
            return baru;
        });
    };

    // Ruangan, jam operasional, granularitas, libur, dan slot hari itu — sumber yang sama dengan P-27.
    const dari = isian.tanggal === "" ? "" : tengahMalamWib(isian.tanggal).toISOString();
    const sampai = isian.tanggal === "" ? "" : tengahMalamWib(geserHari(isian.tanggal, 1)).toISOString();
    const kalender = useQuery({ ...ketersediaanQuery(dari, sampai, {}), enabled: isian.tanggal !== "" });
    const data = kalender.data;

    const pratinjau = useMutation({ mutationFn: pratinjauPengajuan });
    const ajukan = useMutation({ mutationFn: ({ body, key }: { body: ReturnType<typeof bodyDari>; key: string }) => ajukanReservasi(body, key) });
    const tinjauan: RoomReservationPreview | undefined = pratinjau.data;

    useEffect(() => {
        judul.current?.focus();
    }, [langkah, hasil]);

    const tanganiGalatServer = (e: unknown, keLangkah: boolean): void => {
        if (!(e instanceof ApiError)) return;
        if (e.kode === "BORROWER_BLOCKED") {
            setBlokir(e.details.map((d) => d.message));
            return;
        }
        const g = galatDari(e.details);
        setGalat({ ...g, umum: g.umum ?? (e.details.length === 0 ? e.message : undefined) });
        const pertama = (Object.keys(g) as (keyof Galat)[]).find((k): k is keyof IsianWizard => k !== "umum");
        if (keLangkah && pertama !== undefined) setLangkah(LANGKAH_FIELD(pertama));
    };

    /** Pratinjau server; `maju` = pindah ke langkah 3 bila lolos. Kuota penuh menghentikan di langkah 2 (BR-023a). */
    const periksa = (i: IsianWizard, maju: boolean) => {
        pratinjau.mutate(bodyDari(i), {
            onSuccess: (p) => {
                if (p.kuota.berjalan >= p.kuota.batas) {
                    setGalat({ umum: `Kuota pengajuan yang menunggu persetujuan sudah penuh: ${String(p.kuota.berjalan)} dari batas ${String(p.kuota.batas)}. Tunggu keputusan atau batalkan salah satu pengajuan Anda.` });
                    setLangkah(2);
                    return;
                }
                if (maju) setLangkah(3);
            },
            onError: (e) => tanganiGalatServer(e, true),
        });
    };

    const lanjut1 = () => {
        const g: Galat = {};
        if (isian.ruangan === "") g.ruangan = "Ruangan wajib dipilih.";
        if (isian.tanggal === "") g.tanggal = "Tanggal wajib diisi.";
        if (isian.mulai === "") g.mulai = "Jam mulai wajib dipilih.";
        if (isian.selesai === "") g.selesai = "Jam selesai wajib dipilih.";
        else if (isian.mulai !== "" && isian.selesai <= isian.mulai) g.selesai = "Jam selesai harus sesudah jam mulai.";
        const masalah = Object.keys(g).length === 0 && data !== undefined ? masalahWaktu(data, isian) : null;
        if (masalah !== null) g.mulai = masalah;
        setGalat(g);
        if (Object.keys(g).length === 0) setLangkah(2);
    };

    const lanjut2 = () => {
        setBlokir(null);
        const uji = RoomReservationBodySchema.safeParse(bodyDari(isian));
        if (!uji.success) {
            const g = galatDari(uji.error.issues.map((i) => ({ field: i.path.map(String).join("."), message: i.message })));
            if (isian.jumlah_peserta.trim() === "") g.jumlah_peserta = "Jumlah peserta wajib diisi.";
            setGalat(g);
            return;
        }
        if (isian.berulang && isian.hari.length === 0) {
            setGalat({ hari: "Pilih minimal satu hari." });
            return;
        }
        periksa(isian, true);
    };

    const kirim = () => {
        const body = bodyDari(isian);
        const teks = JSON.stringify(body);
        // ID-01/ID-04: kunci per isi body — isian yang berubah adalah pengajuan lain.
        const key = kunci.current.get(teks) ?? crypto.randomUUID();
        kunci.current.set(teks, key);
        ajukan.mutate({ body, key }, { onSuccess: onTerbentuk ?? setHasil, onError: (e) => tanganiGalatServer(e, false) });
    };

    const lewati = (tanggal: string, ya: boolean) => {
        const baru = { ...isian, lewati: ya ? [...isian.lewati, tanggal] : isian.lewati.filter((t) => t !== tanggal) };
        setIsian(baru);
        periksa(baru, false);
    };

    const ubahan = JSON.stringify(isian) !== JSON.stringify(isianAwal);
    const batal = () => (ubahan && hasil === null ? setKonfirmasiBatal(true) : onBatal());
    const ruang = data?.ruangan.find((r) => r.id === isian.ruangan);
    const jam = data === undefined || isian.tanggal === "" ? { mulai: [], selesai: [] } : opsiJam(isian.tanggal, data);
    const tertahan = tinjauan?.tanggal.filter((t) => t.keadaan === "BENTROK" || t.keadaan === "TIDAK_SAH") ?? [];
    const bentrokSaatKirim = ajukan.error instanceof ApiError && ajukan.error.kode === "RESERVATION_CONFLICT";
    const saran = !isian.berulang && (bentrokSaatKirim || galat.mulai === "Ruangan sudah terpakai pada rentang ini.") && data !== undefined ? saranSlot(data, isian.ruangan, isian.tanggal, isian.mulai, isian.selesai) : null;
    const pakaiSaran = (s: { mulai: string; selesai: string }) => {
        const baru = { ...isian, ...s };
        setIsian(baru);
        setGalat({});
        ajukan.reset();
        if (langkah === 3) periksa(baru, false);
    };
    const kapasitasLebih = galat.jumlah_peserta?.startsWith("Jumlah peserta melebihi kapasitas") === true && data !== undefined ? ruanganCukup(data, isian, Number(isian.jumlah_peserta)) : [];

    if (hasil !== null) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                <h1 ref={judul} tabIndex={-1} className="text-2xl font-semibold text-text-primary">
                    Pengajuan terkirim
                </h1>
                <Peringatan varian="success" judul={`Nomor pengajuan ${hasil.nomor}`}>
                    Status: Menunggu Persetujuan. Approver telah diberi tahu; slot ditahan sementara sampai diputuskan.
                </Peringatan>
                {hasil.tanggal.length > 1 && (
                    <ul className="flex flex-col gap-1 text-base text-text-primary">
                        {hasil.tanggal.map((t) => (
                            <li key={t.id}>{`${t.nomor} — ${tanggalPanjang(tanggalWib(new Date(t.mulai)))}, ${jamWib(t.mulai)}–${jamWib(t.selesai)} WIB`}</li>
                        ))}
                    </ul>
                )}
                <div className="flex flex-wrap gap-3">
                    <Tombol onClick={() => onKalender(isian.tanggal)}>Kembali ke Kalender Ruangan</Tombol>
                    <Tombol
                        varian="secondary"
                        onClick={() => {
                            setHasil(null);
                            setIsian(ISIAN_KOSONG);
                            pratinjau.reset();
                            ajukan.reset();
                            setLangkah(1);
                        }}
                    >
                        Ajukan reservasi lain
                    </Tombol>
                </div>
            </div>
        );
    }

    let isi: ReactNode;
    if (langkah === 1) {
        isi = (
            <Kartu judul="Ruangan dan waktu">
                <Isian label="Tanggal" type="date" required value={isian.tanggal} galat={galat.tanggal} onChange={(e) => ubah({ tanggal: e.currentTarget.value })} />
                {isian.tanggal !== "" && kalender.isPending && <KeadaanMemuat label="Memuat ruangan" baris={3} />}
                {kalender.isError && <KeadaanGalat galat={kalender.error} onCobaLagi={() => void kalender.refetch()} />}
                {data !== undefined && (
                    <>
                        <Pilihan
                            label="Ruangan"
                            required
                            kosong="Pilih ruangan"
                            galat={galat.ruangan}
                            value={isian.ruangan}
                            opsi={data.ruangan.map((r) => ({ nilai: r.id, label: `${r.nama} — ${r.gedung.nama}${r.kapasitas === null ? "" : `, ${String(r.kapasitas)} orang`}` }))}
                            onChange={(e) => ubah({ ruangan: e.currentTarget.value })}
                        />
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Pilihan label="Jam mulai (WIB)" required kosong="Pilih jam" galat={galat.mulai} value={isian.mulai} opsi={jam.mulai.map((j) => ({ nilai: j, label: j.replace(":", ".") }))} onChange={(e) => ubah({ mulai: e.currentTarget.value })} />
                            <Pilihan label="Jam selesai (WIB)" required kosong="Pilih jam" galat={galat.selesai} value={isian.selesai} opsi={jam.selesai.map((j) => ({ nilai: j, label: j.replace(":", ".") }))} onChange={(e) => ubah({ selesai: e.currentTarget.value })} />
                        </div>
                        <p className="text-sm text-text-secondary">{`Jam operasional ${data.jam_operasional.mulai.replace(":", ".")}–${data.jam_operasional.selesai.replace(":", ".")} WIB, kelipatan ${String(data.granularitas_menit)} menit.`}</p>
                    </>
                )}
            </Kartu>
        );
    } else if (langkah === 2) {
        isi = (
            <div className="flex flex-col gap-6">
                <Kartu judul="Detail kegiatan">
                    <Isian label="Nama kegiatan" required maxLength={200} value={isian.nama_kegiatan} galat={galat.nama_kegiatan} onChange={(e) => ubah({ nama_kegiatan: e.currentTarget.value })} />
                    <Isian label="Jenis kegiatan" required maxLength={100} bantuan="Mis. Rapat, Pelatihan, Lomba, Ibadah." value={isian.jenis_kegiatan} galat={galat.jenis_kegiatan} onChange={(e) => ubah({ jenis_kegiatan: e.currentTarget.value })} />
                    <Isian
                        label="Perkiraan jumlah peserta"
                        required
                        type="number"
                        min={1}
                        inputMode="numeric"
                        {...(ruang?.kapasitas === null || ruang === undefined ? {} : { bantuan: `Kapasitas ${ruang.nama}: ${String(ruang.kapasitas)} orang.` })}
                        value={isian.jumlah_peserta}
                        galat={galat.jumlah_peserta}
                        onChange={(e) => ubah({ jumlah_peserta: e.currentTarget.value })}
                    />
                    {kapasitasLebih.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <p className="text-sm text-text-primary">Ruangan lain yang cukup dan kosong pada waktu yang sama:</p>
                            <div className="flex flex-wrap gap-2">
                                {kapasitasLebih.map((r) => (
                                    <Tombol key={r.id} varian="secondary" onClick={() => ubah({ ruangan: r.id, jumlah_peserta: isian.jumlah_peserta })}>
                                        {`${r.nama} (${String(r.kapasitas)} orang)`}
                                    </Tombol>
                                ))}
                            </div>
                        </div>
                    )}
                    <TeksPanjang label="Keperluan" value={isian.keperluan} galat={galat.keperluan} onChange={(v) => ubah({ keperluan: v })} />
                    <TeksPanjang label="Kebutuhan tambahan" value={isian.kebutuhan_tambahan} galat={galat.kebutuhan_tambahan} onChange={(v) => ubah({ kebutuhan_tambahan: v })} />
                    <TeksPanjang label="Keterangan" value={isian.keterangan} galat={galat.keterangan} onChange={(v) => ubah({ keterangan: v })} />
                    <p className="text-sm text-text-secondary">Aset pendukung belum dapat diajukan bersama reservasi ruangan.</p>
                </Kartu>
                <Kartu judul="Pengulangan">
                    <KotakCentang label="Ulangi setiap minggu" checked={isian.berulang} onCheckedChange={(v) => ubah({ berulang: v, hari: v && isian.hari.length === 0 && isian.tanggal !== "" ? [((new Date(`${isian.tanggal}T00:00:00Z`).getUTCDay() + 6) % 7) + 1] : isian.hari, lewati: [] })} />
                    {isian.berulang && (
                        <>
                            <fieldset className="flex flex-col gap-1" aria-describedby={galat.hari === undefined ? undefined : "galat-hari"}>
                                <legend className="text-sm font-medium text-text-primary">Hari</legend>
                                <div className="grid grid-cols-2 md:grid-cols-4">
                                    {NAMA_HARI.map(([n, nama]) => (
                                        <KotakCentang key={n} label={nama} checked={isian.hari.includes(n)} onCheckedChange={(v) => ubah({ hari: v ? [...isian.hari, n] : isian.hari.filter((h) => h !== n), lewati: [] })} />
                                    ))}
                                </div>
                                {galat.hari !== undefined && (
                                    <p id="galat-hari" className="text-sm text-error-base">
                                        {galat.hari}
                                    </p>
                                )}
                            </fieldset>
                            <Isian label="Sampai tanggal" type="date" required min={isian.tanggal} value={isian.sampai} galat={galat.sampai} onChange={(e) => ubah({ sampai: e.currentTarget.value, lewati: [] })} />
                        </>
                    )}
                </Kartu>
            </div>
        );
    } else {
        isi = (
            <div className="flex flex-col gap-6">
                <Kartu judul="Ringkasan">
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-base md:grid-cols-2">
                        {(
                            [
                                ["Ruangan", ruang === undefined ? "—" : `${ruang.nama} — ${ruang.gedung.nama}`],
                                ["Waktu", `${isian.mulai.replace(":", ".")}–${isian.selesai.replace(":", ".")} WIB`],
                                ["Nama kegiatan", isian.nama_kegiatan],
                                ["Jenis kegiatan", isian.jenis_kegiatan],
                                ["Jumlah peserta", `${isian.jumlah_peserta} orang`],
                                ["Pengulangan", isian.berulang ? `Setiap ${NAMA_HARI.filter(([n]) => isian.hari.includes(n)).map(([, h]) => h).join(", ")} sampai ${tanggalPanjang(isian.sampai)}` : "Tidak berulang"],
                                ["Keperluan", isian.keperluan.trim() || "—"],
                                ["Kebutuhan tambahan", isian.kebutuhan_tambahan.trim() || "—"],
                                ["Keterangan", isian.keterangan.trim() || "—"],
                            ] as const
                        ).map(([k, v]) => (
                            <div key={k} className="flex flex-col">
                                <dt className="text-sm text-text-secondary">{k}</dt>
                                <dd className="text-text-primary">{v}</dd>
                            </div>
                        ))}
                    </dl>
                </Kartu>

                {tinjauan !== undefined && (
                    <>
                        <Kartu judul={isian.berulang ? `Tanggal (${String(tinjauan.tanggal.filter((t) => t.keadaan === "TERSEDIA").length)} akan diajukan)` : "Tanggal"}>
                            <ul className="flex flex-col divide-y divide-border-subtle">
                                {tinjauan.tanggal.map((t) => (
                                    <li key={t.tanggal} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                        <div className="flex flex-col">
                                            <span className="text-text-primary">{`${tanggalPanjang(t.tanggal)}, ${jamWib(t.mulai)}–${jamWib(t.selesai)} WIB`}</span>
                                            {t.alasan !== null && <span className="text-sm text-text-secondary">{t.alasan}</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Lencana varian={KEADAAN[t.keadaan].varian}>{KEADAAN[t.keadaan].label}</Lencana>
                                            {isian.berulang && t.keadaan !== "TERSEDIA" && (
                                                <Tombol varian="tertiary" disabled={pratinjau.isPending} onClick={() => lewati(t.tanggal, t.keadaan !== "DILEWATI")}>
                                                    {t.keadaan === "DILEWATI" ? "Sertakan lagi" : "Lewati tanggal ini"}
                                                </Tombol>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {tertahan.length > 0 && (
                                <Peringatan varian="error" judul="Sebagian tanggal tidak dapat diajukan">
                                    {isian.berulang ? "Lewati tanggal yang bentrok atau tidak sah, atau ubah pola pengulangan." : "Ubah ruangan atau waktu pada langkah 1."}
                                </Peringatan>
                            )}
                        </Kartu>
                        <Kartu judul="Jalur persetujuan">
                            <ol className="flex flex-col gap-2">
                                {tinjauan.jalur_persetujuan.map((l) => (
                                    <li key={l.urutan} className="flex flex-col">
                                        <span className="text-text-primary">{`Langkah ${String(l.urutan)}: ${l.approver}${l.fallback ? " (pengganti)" : ""}`}</span>
                                        <span className="text-sm text-text-secondary">{l.akan_dilewati === null ? `Batas waktu ${String(l.sla_jam)} jam kerja` : `Dilewati — ${l.akan_dilewati}`}</span>
                                    </li>
                                ))}
                            </ol>
                        </Kartu>
                    </>
                )}
                {pratinjau.isPending && <KeadaanMemuat label="Memeriksa ketersediaan" baris={2} />}
                <Peringatan varian="warning" judul="Satu pengajuan, satu keputusan">
                    {isian.berulang
                        ? "Seluruh tanggal diajukan sebagai satu pengajuan dan diputuskan sekaligus: disetujui atau ditolak bersama."
                        : "Pengajuan diputuskan utuh: bila ruangan tidak lagi tersedia saat diputuskan, seluruh pengajuan ditolak dan Anda perlu mengajukan ulang."}
                </Peringatan>
            </div>
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <header className="flex flex-col gap-4">
                <h1 ref={judul} tabIndex={-1} className="text-2xl font-semibold text-text-primary">
                    Ajukan Reservasi Ruangan
                </h1>
                <IndikatorLangkah aktif={langkah} />
            </header>

            {blokir !== null ? (
                <Peringatan varian="error" judul="Selesaikan kewajiban terlebih dahulu" aksi={<Tombol varian="secondary" onClick={onBatal}>Kembali</Tombol>}>
                    <ul className="list-disc pl-4">
                        {blokir.map((b) => (
                            <li key={b}>{b}</li>
                        ))}
                    </ul>
                </Peringatan>
            ) : (
                <>
                    {isi}
                    {(galat.umum !== undefined || (langkah === 3 && ajukan.error instanceof ApiError)) && (
                        <Peringatan
                            varian="error"
                            judul={bentrokSaatKirim ? "Slot baru saja dipesan pengguna lain" : "Pengajuan belum dapat dikirim"}
                            aksi={saran === null ? undefined : <Tombol varian="secondary" onClick={() => pakaiSaran(saran)}>{`Pakai slot terdekat ${saran.mulai.replace(":", ".")}–${saran.selesai.replace(":", ".")} WIB`}</Tombol>}
                        >
                            {galat.umum ?? (ajukan.error instanceof ApiError && ajukan.error.details.length > 0 ? ajukan.error.details.map((d) => d.message).join(" ") : ajukan.error?.message)}
                        </Peringatan>
                    )}
                    {langkah === 1 && saran !== null && galat.umum === undefined && (
                        <Peringatan varian="info" judul="Saran slot terdekat" aksi={<Tombol varian="secondary" onClick={() => pakaiSaran(saran)}>{`Pakai ${saran.mulai.replace(":", ".")}–${saran.selesai.replace(":", ".")} WIB`}</Tombol>}>
                            {`${ruang?.nama ?? "Ruangan ini"} kosong pada ${saran.mulai.replace(":", ".")}–${saran.selesai.replace(":", ".")} WIB di hari yang sama.`}
                        </Peringatan>
                    )}
                    <footer className="flex flex-wrap justify-between gap-3 border-t border-border-subtle pt-4">
                        <Tombol varian="tertiary" onClick={batal}>
                            Batal
                        </Tombol>
                        <div className="flex flex-wrap gap-3">
                            {langkah > 1 && (
                                <Tombol varian="secondary" onClick={() => setLangkah((langkah - 1) as Langkah)}>
                                    Kembali
                                </Tombol>
                            )}
                            {langkah === 1 && <Tombol onClick={lanjut1}>Lanjut</Tombol>}
                            {langkah === 2 && (
                                <Tombol sibuk={pratinjau.isPending} onClick={lanjut2}>
                                    Lanjut ke Tinjau
                                </Tombol>
                            )}
                            {langkah === 3 && (
                                <Tombol className="min-h-control-lg" sibuk={ajukan.isPending} disabled={tinjauan === undefined || tertahan.length > 0 || pratinjau.isPending} onClick={kirim}>
                                    Ajukan
                                </Tombol>
                            )}
                        </div>
                    </footer>
                </>
            )}

            <DialogKonfirmasi buka={konfirmasiBatal} onTutup={() => setKonfirmasiBatal(false)} judul="Batalkan pengajuan?" labelAksi="Ya, batalkan" varian="danger" onKonfirmasi={onBatal}>
                Isian yang sudah Anda masukkan tidak disimpan.
            </DialogKonfirmasi>
        </div>
    );
}
