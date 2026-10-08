// P-17/F-05/UXD-06: laporan permanen pada URL, bukan toast.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Isian, Peringatan, Tombol } from "../../shared/ui/primitives";
import { jalurDrilldown } from "../../shared/navigasi";
import { AssetImportInputError, downloadTemplate, importJobKey, importJobQuery, importReportCsv, runningImport, saveDownload, uploadAssets } from "./api";

const STATUS = { MENUNGGU: "Menunggu pemrosesan", BERJALAN: "Sedang diproses", SELESAI: "Selesai", GAGAL: "Pemrosesan terhenti" } as const;
export default function AssetImportPage({ jobId, onJob }: { readonly jobId: number | null; readonly onJob: (id: number) => void }) {
    const [file, setFile] = useState<File | null>(null);
    const queryClient = useQueryClient();
    const query = useQuery(importJobQuery(jobId));
    const upload = useMutation({ mutationFn: uploadAssets, onSuccess: (result) => { queryClient.setQueryData(importJobKey(Number(result.data.id)), result.data); onJob(Number(result.data.id)); } });
    const template = useMutation({ mutationFn: downloadTemplate });
    const job = query.data;
    const running = runningImport(job);
    useEffect(() => {
        if (job !== undefined && !runningImport(job)) void queryClient.invalidateQueries({ queryKey: ["assets"] });
    }, [job, queryClient]);
    function submit(event: FormEvent): void {
        event.preventDefault();
        if (file !== null) upload.mutate(file);
    }
    const catalog = job === undefined ? null : jalurDrilldown(`P-15?filter[import_job_id]=${job.id}`);
    function download(correction: boolean): void {
        if (job === undefined) return;
        saveDownload(new Blob([importReportCsv(job, correction)], { type: "text/csv;charset=utf-8" }), `${correction ? "koreksi" : "laporan"}_impor_aset_${job.id}.csv`);
    }
    return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
            <header><h1 className="text-2xl font-semibold text-text-primary">Impor Aset</h1><p className="mt-2 text-base text-text-secondary">Unggah CSV atau XLSX sesuai templat. Baris yang gagal dapat diperbaiki dan diunggah kembali.</p></header>
            <section aria-labelledby="upload-heading" className="rounded-md border border-border-subtle bg-surface-default p-4">
                <h2 id="upload-heading" className="mb-4 text-lg font-semibold text-text-primary">Unggah berkas</h2>
                <div className="mb-4"><Tombol varian="secondary" sibuk={template.isPending} onClick={() => template.mutate()}>Unduh templat XLSX</Tombol></div>
                {template.isError && <KeadaanGalat galat={template.error} onCobaLagi={() => template.mutate()} />}
                <form noValidate onSubmit={submit} className="flex flex-col gap-4">
                    <Isian label="Berkas impor" type="file" accept=".csv,.xlsx" required disabled={upload.isPending || running} bantuan="Maksimal 6 MB. Lebih dari 200 baris diproses di latar belakang; Anda menerima notifikasi saat selesai." onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); upload.reset(); }} />
                    {upload.isError && (upload.error instanceof AssetImportInputError
                        ? <Peringatan varian="error" judul="Berkas tidak dapat diimpor">{upload.error.message}</Peringatan>
                        : <KeadaanGalat galat={upload.error} onCobaLagi={() => { if (file !== null) upload.mutate(file); }} />)}
                    <div><Tombol type="submit" disabled={file === null || running} sibuk={upload.isPending}>Mulai impor</Tombol></div>
                    {upload.isPending && <p role="status" className="text-sm text-text-secondary">Mengunggah dan memproses berkas…</p>}
                </form>
            </section>
            {jobId !== null && query.isPending && <KeadaanMemuat label="Memuat laporan impor" baris={4} />}
            {query.isError && <KeadaanGalat galat={query.error} onCobaLagi={() => void query.refetch()} />}
            {job !== undefined && (
                <section aria-labelledby="report-heading" className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4">
                    <h2 id="report-heading" className="text-lg font-semibold text-text-primary">Laporan impor</h2>
                    <p className="break-all text-sm text-text-secondary">{job.nama_berkas}</p>
                    <p role="status" aria-live="polite" className="text-base text-text-primary">{STATUS[job.status]} — {job.terproses} dari {job.total} baris diproses.</p>
                    {running && <progress aria-label="Progres impor aset" max={job.total} value={job.terproses} className="h-2 w-full accent-teal-600" />}
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div><dt className="text-sm text-text-secondary">Baris berhasil</dt><dd className="text-xl font-semibold text-text-primary">{job.sukses}</dd></div>
                        <div><dt className="text-sm text-text-secondary">Baris gagal</dt><dd className="text-xl font-semibold text-text-primary">{job.gagal}</dd></div>
                        <div><dt className="text-sm text-text-secondary">Unit dibuat</dt><dd className="text-xl font-semibold text-text-primary">{job.unit_dibuat}</dd></div>
                    </dl>
                    {upload.data?.meta?.idempotent_replay === true && <Peringatan varian="info" judul="Berkas sudah diterima">Hasil pekerjaan sebelumnya ditampilkan. Aset yang sudah dibuat tidak diproses ulang.</Peringatan>}
                    {job.pesan_galat !== null && <Peringatan varian="error" judul="Pemrosesan terhenti">{job.pesan_galat}</Peringatan>}
                    {job.laporan_gagal.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm text-text-primary"><caption className="mb-2 text-left font-medium">Baris yang perlu diperbaiki</caption><thead><tr><th scope="col" className="p-2">Baris</th><th scope="col" className="p-2">Nama barang</th><th scope="col" className="p-2">Alasan gagal</th></tr></thead><tbody>{job.laporan_gagal.map((failure) => <tr key={failure.baris} className="border-t border-border-subtle"><td className="p-2">{failure.baris}</td><td className="p-2">{failure.nama_barang ?? "—"}</td><td className="p-2">{failure.pesan}</td></tr>)}</tbody></table></div>}
                    {!running && <div className="flex flex-wrap gap-2"><Tombol varian="secondary" onClick={() => download(false)}>Unduh laporan</Tombol>{job.gagal > 0 && <Tombol varian="secondary" onClick={() => download(true)}>Unduh berkas koreksi</Tombol>}{catalog !== null && <a href={catalog} className="inline-flex min-h-control-md items-center rounded-md px-4 text-text-link">Lihat aset hasil impor</a>}</div>}
                </section>
            )}
        </div>
    );
}
