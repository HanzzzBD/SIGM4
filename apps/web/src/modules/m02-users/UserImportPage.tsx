// P-62 Impor Pengguna (UX §6 `/pengguna/impor`; FR-02.1 A4, IMPT-02…05, F-05; PR-01-19). Pola P-17: laporan
// permanen pada URL (`?job=`), bukan toast; > 200 baris diproses worker dan di-poll sampai selesai (IMPT-04).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { jalurDrilldown } from "../../shared/navigasi";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Isian, Peringatan, Tombol } from "../../shared/ui/primitives";
import { berjalan, imporQuery, kunciImpor, laporanCsv, simpanUnduhan, unduhTemplat, unggahImpor } from "./api";

const STATUS = { MENUNGGU: "Menunggu pemrosesan", BERJALAN: "Sedang diproses", SELESAI: "Selesai", GAGAL: "Pemrosesan terhenti" } as const;

export default function UserImportPage({ jobId, onJob }: { readonly jobId: number | null; readonly onJob: (id: number) => void }) {
    const [berkas, setBerkas] = useState<File | null>(null);
    const queryClient = useQueryClient();
    const kueri = useQuery(imporQuery(jobId));
    const unggah = useMutation({
        mutationFn: unggahImpor,
        onSuccess: (h) => {
            queryClient.setQueryData(kunciImpor(Number(h.data.id)), h.data);
            onJob(Number(h.data.id));
        },
    });
    const templat = useMutation({ mutationFn: unduhTemplat });
    const job = kueri.data;
    const jalan = berjalan(job);
    useEffect(() => {
        if (job !== undefined && !berjalan(job)) void queryClient.invalidateQueries({ queryKey: ["users", "daftar"] });
    }, [job, queryClient]);
    const daftar = jalurDrilldown("P-60");

    function kirim(e: FormEvent): void {
        e.preventDefault();
        if (berkas !== null) unggah.mutate(berkas);
    }

    return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
            <header>
                <h1 className="text-2xl font-semibold text-text-heading">Impor Pengguna</h1>
                <p className="mt-2 text-base text-text-secondary">Unggah CSV atau XLSX sesuai templat. Baris yang gagal tidak menggagalkan baris lain dan dapat diunggah ulang setelah diperbaiki.</p>
            </header>
            <section aria-labelledby="judul-unggah" className="rounded-md border border-border-subtle bg-surface-default p-4">
                <h2 id="judul-unggah" className="mb-4 text-lg font-semibold text-text-heading">Unggah berkas</h2>
                <div className="mb-4">
                    <Tombol varian="secondary" sibuk={templat.isPending} onClick={() => templat.mutate()}>
                        Unduh templat XLSX
                    </Tombol>
                </div>
                {templat.isError && <KeadaanGalat galat={templat.error} onCobaLagi={() => templat.mutate()} />}
                <form noValidate onSubmit={kirim} className="flex flex-col gap-4">
                    <Isian label="Berkas impor" type="file" accept=".csv,.xlsx" required disabled={unggah.isPending || jalan} bantuan="Lebih dari 200 baris diproses di latar belakang; Anda menerima notifikasi saat selesai. Berkas yang sama dalam 24 jam tidak diproses ulang." onChange={(e) => { setBerkas(e.currentTarget.files?.[0] ?? null); unggah.reset(); }} />
                    {unggah.isError && <KeadaanGalat galat={unggah.error} onCobaLagi={() => { if (berkas !== null) unggah.mutate(berkas); }} />}
                    <div>
                        <Tombol type="submit" disabled={berkas === null || jalan} sibuk={unggah.isPending}>
                            Mulai impor
                        </Tombol>
                    </div>
                </form>
            </section>
            {jobId !== null && kueri.isPending && <KeadaanMemuat label="Memuat laporan impor" baris={4} />}
            {kueri.isError && <KeadaanGalat galat={kueri.error} onCobaLagi={() => void kueri.refetch()} />}
            {job !== undefined && (
                <section aria-labelledby="judul-laporan" className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4">
                    <h2 id="judul-laporan" className="text-lg font-semibold text-text-heading">Laporan impor</h2>
                    <p className="break-all text-sm text-text-secondary">{job.nama_berkas}</p>
                    <p role="status" aria-live="polite" className="text-base text-text-primary">
                        {STATUS[job.status]} — {job.terproses} dari {job.total} baris diproses.
                    </p>
                    {jalan && <progress aria-label="Progres impor pengguna" max={job.total} value={job.terproses} className="h-2 w-full" />}
                    <dl className="grid grid-cols-2 gap-4">
                        <div><dt className="text-sm text-text-secondary">Baris berhasil</dt><dd className="text-xl font-semibold text-text-primary">{job.sukses}</dd></div>
                        <div><dt className="text-sm text-text-secondary">Baris gagal</dt><dd className="text-xl font-semibold text-text-primary">{job.gagal}</dd></div>
                    </dl>
                    {unggah.data?.meta?.idempotent_replay === true && <Peringatan varian="info" judul="Berkas sudah diterima">Hasil pekerjaan sebelumnya ditampilkan. Pengguna yang sudah dibuat tidak diproses ulang.</Peringatan>}
                    {job.pesan_galat !== null && <Peringatan varian="error" judul="Pemrosesan terhenti">{job.pesan_galat}</Peringatan>}
                    {job.laporan_gagal.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-text-primary">
                                <caption className="mb-2 text-left font-medium">Baris yang perlu diperbaiki</caption>
                                <thead><tr><th scope="col" className="p-2">Baris</th><th scope="col" className="p-2">Email</th><th scope="col" className="p-2">Alasan gagal</th></tr></thead>
                                <tbody>
                                    {job.laporan_gagal.map((f) => (
                                        <tr key={f.baris} className="border-t border-border-subtle"><td className="p-2">{f.baris}</td><td className="p-2 break-all">{f.email ?? "—"}</td><td className="p-2">{f.pesan}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!jalan && (
                        <div className="flex flex-wrap gap-2">
                            <Tombol varian="secondary" onClick={() => simpanUnduhan(new Blob([laporanCsv(job)], { type: "text/csv;charset=utf-8" }), `laporan_impor_pengguna_${job.id}.csv`)}>Unduh laporan</Tombol>
                            {daftar !== null && <a href={daftar} className="inline-flex min-h-control-md items-center rounded-md px-4 text-text-link">Kembali ke Pengguna</a>}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
