// Panel "Kelola Jadwal Tetap & Blokade" — aksi sekunder P-27 (UX §7.6.1 "Kelola Jadwal Tetap 🔒 ·
// Blokade Manual 🔒", FR-07.5, alur F-11; PR-03-13, keputusan 19a log phase-03). Daftar aturan &
// blokade sebuah ruangan, penonaktifan (A3), dan formulir baru yang SELALU diperiksa server lebih dulu:
// libur yang dilewati (A4), bentrok blokade lain (sesuaikan), dan bentrok reservasi yang menuntut
// keputusan EKSPLISIT — batalkan beralasan (NT-08) atau sesuaikan blokade (A1, keputusan 19c).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RoomBlockInput, RoomBlockPreview } from "@sigm4/schemas";
import { useState } from "react";
import { ApiError } from "../../shared/api";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Isian, KotakCentang, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import { buatBlokade, daftarBlokadeQuery, ketersediaanQuery, nonaktifkanBlokade, pratinjauBlokade } from "./api";
import { hariIniWib, jamWib, tanggalPanjang, tanggalWib } from "./kalender";
import { NAMA_HARI, waktuWib } from "./pengajuan";

const pesanGalat = (e: unknown) => (e instanceof ApiError && e.message !== "" ? e.message : "Permintaan gagal. Coba lagi.");
const detailGalat = (e: unknown): readonly { field: string; message: string }[] => (e instanceof ApiError ? (e.details ?? []) : []);
const waktuPanjang = (iso: string) => `${tanggalPanjang(tanggalWib(new Date(iso)))}, ${jamWib(iso)} WIB`;

interface Isian {
    readonly jenis: "JADWAL_TETAP" | "BLOKADE_MANUAL";
    readonly hari: readonly number[];
    readonly jam_mulai: string;
    readonly jam_selesai: string;
    readonly berlaku_mulai: string;
    readonly berlaku_sampai: string;
    readonly mulai_tanggal: string;
    readonly mulai_jam: string;
    readonly selesai_tanggal: string;
    readonly selesai_jam: string;
    readonly label_kegiatan: string;
}

const KOSONG: Isian = { jenis: "JADWAL_TETAP", hari: [], jam_mulai: "07:00", jam_selesai: "08:00", berlaku_mulai: "", berlaku_sampai: "", mulai_tanggal: "", mulai_jam: "00:00", selesai_tanggal: "", selesai_jam: "00:00", label_kegiatan: "" };

function bodyDari(i: Isian): RoomBlockInput {
    return i.jenis === "JADWAL_TETAP"
        ? { jenis: "JADWAL_TETAP", hari: [...i.hari].sort((a, b) => a - b), jam_mulai: i.jam_mulai, jam_selesai: i.jam_selesai, berlaku_mulai: i.berlaku_mulai, berlaku_sampai: i.berlaku_sampai, label_kegiatan: i.label_kegiatan }
        : { jenis: "BLOKADE_MANUAL", mulai: waktuWib(i.mulai_tanggal, i.mulai_jam).toISOString(), selesai: waktuWib(i.selesai_tanggal, i.selesai_jam).toISOString(), label_kegiatan: i.label_kegiatan };
}

function FormulirBlokade({ roomId, onSelesai }: { readonly roomId: string; readonly onSelesai: (pesan: string) => void }) {
    const [isian, setIsian] = useState<Isian>(KOSONG);
    const [hasil, setHasil] = useState<RoomBlockPreview | null>(null);
    const [konfirmasi, setKonfirmasi] = useState(false);
    const ubah = (p: Partial<Isian>) => {
        setIsian((l) => ({ ...l, ...p }));
        setHasil(null); // isian berubah = pratinjau lama tak berlaku
    };
    const periksa = useMutation({ mutationFn: () => pratinjauBlokade(roomId, bodyDari(isian)), onSuccess: setHasil });
    const simpan = useMutation({
        mutationFn: (alasan?: string) => buatBlokade(roomId, bodyDari(isian), alasan === undefined ? undefined : { alasan }),
        onSuccess: (h) => {
            setKonfirmasi(false);
            setIsian(KOSONG);
            setHasil(null);
            onSelesai(`Blokade tersimpan: ${String(h.slot_dibuat)} slot terbentuk${h.reservasi_dibatalkan.length > 0 ? `, ${String(h.reservasi_dibatalkan.length)} reservasi dibatalkan dan pemohonnya dinotifikasi` : ""}.`);
        },
    });
    const galat = (field: string) => detailGalat(periksa.error).find((d) => d.field === field)?.message;
    const tetap = isian.jenis === "JADWAL_TETAP";

    return (
        <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
                e.preventDefault();
                periksa.mutate();
            }}
        >
            <Pilihan
                label="Jenis blokade"
                value={isian.jenis}
                opsi={[
                    { nilai: "JADWAL_TETAP", label: "Jadwal tetap (pola mingguan)" },
                    { nilai: "BLOKADE_MANUAL", label: "Blokade manual (rentang tunggal)" },
                ]}
                onChange={(e) => ubah({ jenis: e.target.value === "BLOKADE_MANUAL" ? "BLOKADE_MANUAL" : "JADWAL_TETAP" })}
            />
            <Isian label="Label kegiatan" maxLength={100} value={isian.label_kegiatan} galat={galat("label_kegiatan")} onChange={(e) => ubah({ label_kegiatan: e.target.value })} />
            {tetap ? (
                <>
                    <fieldset className="flex flex-col gap-1">
                        <legend className="text-sm font-medium text-text-primary">Hari</legend>
                        <div className="flex flex-wrap gap-x-4">
                            {NAMA_HARI.map(([n, nama]) => (
                                <KotakCentang key={n} label={nama} checked={isian.hari.includes(n)} onCheckedChange={(v) => ubah({ hari: v ? [...isian.hari, n] : isian.hari.filter((h) => h !== n) })} />
                            ))}
                        </div>
                        {galat("hari") !== undefined && <p className="text-sm text-error-base">{galat("hari")}</p>}
                    </fieldset>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Isian label="Jam mulai (WIB)" type="time" value={isian.jam_mulai} galat={galat("jam_mulai")} onChange={(e) => ubah({ jam_mulai: e.target.value })} />
                        <Isian label="Jam selesai (WIB)" type="time" value={isian.jam_selesai} galat={galat("jam_selesai")} onChange={(e) => ubah({ jam_selesai: e.target.value })} />
                        <Isian label="Berlaku mulai" type="date" value={isian.berlaku_mulai} galat={galat("berlaku_mulai")} onChange={(e) => ubah({ berlaku_mulai: e.target.value })} />
                        <Isian label="Berlaku sampai" type="date" value={isian.berlaku_sampai} galat={galat("berlaku_sampai")} onChange={(e) => ubah({ berlaku_sampai: e.target.value })} />
                    </div>
                </>
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Isian label="Mulai tanggal" type="date" value={isian.mulai_tanggal} onChange={(e) => ubah({ mulai_tanggal: e.target.value })} />
                    <Isian label="Mulai jam (WIB)" type="time" value={isian.mulai_jam} onChange={(e) => ubah({ mulai_jam: e.target.value })} />
                    <Isian label="Selesai tanggal" type="date" value={isian.selesai_tanggal} galat={galat("selesai")} onChange={(e) => ubah({ selesai_tanggal: e.target.value })} />
                    <Isian label="Selesai jam (WIB)" type="time" value={isian.selesai_jam} onChange={(e) => ubah({ selesai_jam: e.target.value })} />
                </div>
            )}
            {periksa.isError && detailGalat(periksa.error).length === 0 && <Peringatan varian="error">{pesanGalat(periksa.error)}</Peringatan>}
            <Tombol type="submit" varian="secondary" className="self-start" sibuk={periksa.isPending} disabled={(tetap && (isian.hari.length === 0 || isian.berlaku_mulai === "" || isian.berlaku_sampai === "")) || (!tetap && (isian.mulai_tanggal === "" || isian.selesai_tanggal === ""))}>
                Periksa blokade
            </Tombol>

            {hasil !== null && (
                <section aria-label="Hasil pemeriksaan blokade" className="flex flex-col gap-3">
                    <p className="text-base text-text-primary">{`${String(hasil.kemunculan.length)} kemunculan akan menjadi slot dalam horizon pemesanan.`}</p>
                    {hasil.dilewati.length > 0 && (
                        <Peringatan varian="info" judul="Hari libur dilewati">
                            <ul>
                                {hasil.dilewati.map((d) => (
                                    <li key={d.tanggal}>{`${tanggalPanjang(d.tanggal)} — ${d.alasan}`}</li>
                                ))}
                            </ul>
                        </Peringatan>
                    )}
                    {hasil.bentrok_lain.length > 0 ? (
                        <Peringatan varian="error" judul="Beririsan dengan blokade lain — sesuaikan rentangnya">
                            <ul>
                                {hasil.bentrok_lain.map((b) => (
                                    <li key={b.mulai}>{`${b.label ?? b.asal}: ${waktuPanjang(b.mulai)}`}</li>
                                ))}
                            </ul>
                        </Peringatan>
                    ) : hasil.bentrok_reservasi.length > 0 ? (
                        <Peringatan varian="warning" judul={`Beririsan dengan ${String(hasil.bentrok_reservasi.length)} reservasi — pilih tindakan`}>
                            <ul className="mb-3">
                                {hasil.bentrok_reservasi.map((r) => (
                                    <li key={r.reservation_id}>{`${r.nomor} · ${r.nama_kegiatan ?? "—"} · ${r.pemohon} · ${waktuPanjang(r.mulai)} (${r.status === "DISETUJUI" ? "Disetujui" : "Menunggu Persetujuan"})`}</li>
                                ))}
                            </ul>
                            <div className="flex flex-wrap gap-2">
                                <Tombol varian="danger" onClick={() => setKonfirmasi(true)}>
                                    Batalkan reservasi tersebut
                                </Tombol>
                                <Tombol varian="secondary" onClick={() => setHasil(null)}>
                                    Sesuaikan blokade
                                </Tombol>
                            </div>
                        </Peringatan>
                    ) : (
                        <Tombol className="self-start" sibuk={simpan.isPending} onClick={() => simpan.mutate(undefined)}>
                            Simpan blokade
                        </Tombol>
                    )}
                    {simpan.isError && !konfirmasi && <Peringatan varian="error">{pesanGalat(simpan.error)}</Peringatan>}
                </section>
            )}

            <DialogKonfirmasi
                buka={konfirmasi}
                onTutup={() => setKonfirmasi(false)}
                judul={`Batalkan ${String(hasil?.bentrok_reservasi.length ?? 0)} reservasi dan simpan blokade?`}
                labelAksi="Batalkan reservasi & simpan blokade"
                varian="danger"
                labelAlasan="Alasan pembatalan"
                sibuk={simpan.isPending}
                galat={simpan.isError ? pesanGalat(simpan.error) : undefined}
                onKonfirmasi={(alasan) => simpan.mutate(alasan)}
            >
                Slot reservasi tersebut dibebaskan dan setiap pemohon dinotifikasi beserta alasan ini (FR-07.5 A1). Blokade lalu tersimpan.
            </DialogKonfirmasi>
        </form>
    );
}

export default function RoomBlocksPanel({ roomId, onRuangan, onTutup }: { readonly roomId: string | null; readonly onRuangan: (id: string) => void; readonly onTutup: () => void }) {
    const qc = useQueryClient();
    const hari = hariIniWib();
    const ruangan = useQuery(ketersediaanQuery(`${hari}T00:00:00+07:00`, `${hari}T23:59:59+07:00`, {}));
    const daftar = useQuery({ ...daftarBlokadeQuery(roomId ?? ""), enabled: roomId !== null });
    const [info, setInfo] = useState<string | null>(null);
    const [nonaktif, setNonaktif] = useState<{ jenis: "JADWAL_TETAP" | "BLOKADE_MANUAL"; id: string; label: string } | null>(null);
    const muatUlang = () => void qc.invalidateQueries({ queryKey: ["rooms"] });
    const matikan = useMutation({
        mutationFn: (p: { jenis: "JADWAL_TETAP" | "BLOKADE_MANUAL"; id: string }) => nonaktifkanBlokade(p.jenis, p.id),
        onSuccess: (h) => {
            setNonaktif(null);
            setInfo(`Blokade dinonaktifkan; ${String(h.slot_dilepas)} slot mendatang dilepas.`);
            muatUlang();
        },
    });
    const namaHari = (n: number) => NAMA_HARI.find(([x]) => x === n)?.[1] ?? String(n);

    return (
        <section aria-labelledby="judul-blokade" className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4">
            <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                    <h2 id="judul-blokade" className="text-lg font-semibold text-text-primary">
                        Kelola Jadwal Tetap & Blokade
                    </h2>
                    <p className="text-sm text-text-secondary">Jadwal tetap menutup ruangan setiap minggu (mis. KBM); blokade manual menutup satu rentang (mis. renovasi). Seluruh waktu WIB.</p>
                </div>
                <Tombol varian="tertiary" onClick={onTutup}>
                    Tutup
                </Tombol>
            </header>
            {ruangan.isPending ? (
                <KeadaanMemuat baris={1} label="Memuat ruangan" />
            ) : ruangan.isError ? (
                <KeadaanGalat galat={ruangan.error} onCobaLagi={() => void ruangan.refetch()} />
            ) : (
                <Pilihan label="Ruangan" kosong="Pilih ruangan" value={roomId ?? ""} opsi={ruangan.data.ruangan.map((r) => ({ nilai: r.id, label: `${r.nama} · ${r.gedung.nama}` }))} onChange={(e) => e.target.value !== "" && onRuangan(e.target.value)} />
            )}
            {info !== null && <Peringatan varian="success">{info}</Peringatan>}
            {roomId !== null &&
                (daftar.isPending ? (
                    <KeadaanMemuat baris={3} label="Memuat blokade ruangan" />
                ) : daftar.isError ? (
                    <KeadaanGalat galat={daftar.error} onCobaLagi={() => void daftar.refetch()} />
                ) : (
                    <>
                        <div className="flex flex-col gap-2">
                            <h3 className="text-base font-semibold text-text-primary">Blokade terdaftar</h3>
                            {daftar.data.jadwal_tetap.length === 0 && daftar.data.blokade_manual.length === 0 ? (
                                <p className="text-sm text-text-secondary">Belum ada jadwal tetap maupun blokade manual pada ruangan ini.</p>
                            ) : (
                                <ul className="flex flex-col gap-2">
                                    {daftar.data.jadwal_tetap.map((a) => (
                                        <li key={`t${a.id}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                                            <span className="flex flex-col">
                                                <span className="font-medium text-text-primary">{a.label_kegiatan}</span>
                                                <span className="text-sm text-text-secondary">{`Jadwal tetap · setiap ${namaHari(a.hari)} ${a.jam_mulai.replace(":", ".")}–${a.jam_selesai.replace(":", ".")} WIB · ${tanggalPanjang(a.berlaku_mulai)} s.d. ${tanggalPanjang(a.berlaku_sampai)}`}</span>
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <Lencana varian={a.status === "AKTIF" ? "success" : "neutral"}>{a.status === "AKTIF" ? "Aktif" : "Nonaktif"}</Lencana>
                                                {a.status === "AKTIF" && (
                                                    <Tombol varian="secondary" onClick={() => setNonaktif({ jenis: "JADWAL_TETAP", id: a.id, label: a.label_kegiatan })}>
                                                        Nonaktifkan
                                                    </Tombol>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                    {daftar.data.blokade_manual.map((m) => (
                                        <li key={`m${m.id}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                                            <span className="flex flex-col">
                                                <span className="font-medium text-text-primary">{m.label_kegiatan}</span>
                                                <span className="text-sm text-text-secondary">{`Blokade manual · ${waktuPanjang(m.mulai)} – ${waktuPanjang(m.selesai)}`}</span>
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <Lencana varian={m.status === "AKTIF" ? "success" : "neutral"}>{m.status === "AKTIF" ? "Aktif" : "Nonaktif"}</Lencana>
                                                {m.status === "AKTIF" && (
                                                    <Tombol varian="secondary" onClick={() => setNonaktif({ jenis: "BLOKADE_MANUAL", id: m.id, label: m.label_kegiatan })}>
                                                        Nonaktifkan
                                                    </Tombol>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                            <h3 className="text-base font-semibold text-text-primary">Tambah blokade</h3>
                            <FormulirBlokade
                                key={roomId}
                                roomId={roomId}
                                onSelesai={(pesan) => {
                                    setInfo(pesan);
                                    muatUlang();
                                }}
                            />
                        </div>
                    </>
                ))}
            <DialogKonfirmasi
                buka={nonaktif !== null}
                onTutup={() => setNonaktif(null)}
                judul={`Nonaktifkan "${nonaktif?.label ?? ""}"?`}
                labelAksi="Nonaktifkan blokade"
                sibuk={matikan.isPending}
                galat={matikan.isError ? pesanGalat(matikan.error) : undefined}
                onKonfirmasi={() => nonaktif !== null && matikan.mutate({ jenis: nonaktif.jenis, id: nonaktif.id })}
            >
                Slot yang belum dimulai dilepas dan ruangan kembali dapat dipesan; slot yang sudah lewat tetap tersimpan sebagai arsip (FR-07.5 A3). Aturan tidak dapat diaktifkan ulang — buat aturan baru bila perlu.
            </DialogKonfirmasi>
        </section>
    );
}
