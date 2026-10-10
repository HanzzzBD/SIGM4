// Konteks reservasi ruangan bagi P-38 Detail Keputusan (FR-10.2 langkah 3; keputusan 92c log phase-02):
// pemohon, objek, jadwal, keperluan — dari `GET /reservations/{id}`. Di luar hak lihat atau sudah
// tak ada (403/404) → keterangan singkat; keputusan tetap dapat diambil dari linimasa (SDD-AUTH-08).

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ApiError } from "../../shared/api";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { detailReservasiQuery } from "./api";
import { jamWib, tanggalPendek, tanggalWib } from "./kalender";

function Baris({
    label,
    children,
}: {
    readonly label: string;
    readonly children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="text-sm font-medium text-text-secondary sm:w-40 sm:shrink-0">
                {label}
            </dt>
            <dd className="text-base text-text-primary">{children}</dd>
        </div>
    );
}

export function RingkasanReservasi({ id }: { readonly id: string }) {
    const kueri = useQuery(detailReservasiQuery(id));
    if (kueri.isPending)
        return <KeadaanMemuat baris={4} label="Memuat detail reservasi" />;
    if (kueri.isError) {
        if (
            kueri.error instanceof ApiError &&
            (kueri.error.status === 403 || kueri.error.status === 404)
        )
            return (
                <p className="text-base text-text-secondary">
                    Detail reservasi tidak dapat ditampilkan.
                </p>
            );
        return (
            <KeadaanGalat
                galat={kueri.error}
                onCobaLagi={() => void kueri.refetch()}
            />
        );
    }
    const d = kueri.data;
    const jadwal = `${tanggalPendek(tanggalWib(new Date(d.waktu_mulai)))}, ${jamWib(d.waktu_mulai)}–${jamWib(d.waktu_selesai)} WIB`;
    return (
        <div className="flex flex-col gap-3">
            <dl className="flex flex-col gap-3">
                <Baris label="Nomor">{d.nomor}</Baris>
                <Baris label="Pemohon">{d.pemohon.nama}</Baris>
                <Baris label="Ruangan">
                    {d.ruangan === null
                        ? "—"
                        : `${d.ruangan.nama} · ${d.ruangan.gedung}`}
                </Baris>
                <Baris label="Jadwal">
                    {jadwal}
                    {d.tanggal.length > 0 && (
                        <span className="block text-sm text-text-secondary">
                            Berulang · {d.tanggal.length} tanggal
                        </span>
                    )}
                </Baris>
                <Baris label="Kegiatan">
                    {[d.nama_kegiatan, d.jenis_kegiatan]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                </Baris>
                <Baris label="Jumlah peserta">{d.jumlah_peserta ?? "—"}</Baris>
                <Baris label="Keperluan">{d.keperluan ?? "—"}</Baris>
                {d.kebutuhan_tambahan !== null && (
                    <Baris label="Kebutuhan tambahan">
                        {d.kebutuhan_tambahan}
                    </Baris>
                )}
            </dl>
            <div>
                <Link
                    to="/reservasi/$id"
                    params={{ id: d.id }}
                    className="text-text-link hover:text-text-link-hover"
                >
                    Buka detail reservasi {d.nomor}
                </Link>
            </div>
        </div>
    );
}
