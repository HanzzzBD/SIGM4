import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSesi } from "../../shared/auth";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { Isian, Peringatan, Tombol } from "../../shared/ui/primitives";
import { ImportReportRetention, useImportReportExpired } from "../../shared/ui/import-report-retention";
import { ScheduleImportInputError, downloadScheduleTemplate, runningScheduleImport, saveScheduleCsv, scheduleFailureCsv, scheduleImportKey, scheduleImportQuery, uploadRoomSchedules } from "./import-api";

const labels = { MENUNGGU: "Menunggu pemrosesan", BERJALAN: "Sedang diproses", SELESAI: "Selesai", GAGAL: "Pemrosesan terhenti" } as const;
export default function RoomScheduleImportPanel({ jobId, onJob }: { readonly jobId: string | null; readonly onJob: (id: string) => void }) {
    const [file, setFile] = useState<File | null>(null), qc = useQueryClient(), account = useSesi().user.id;
    const query = useQuery(scheduleImportQuery(account, jobId));
    const upload = useMutation({ mutationFn: uploadRoomSchedules, onSuccess: h => { qc.setQueryData(scheduleImportKey(account, h.data.id), h.data); onJob(h.data.id); } });
    const template = useMutation({ mutationFn: downloadScheduleTemplate });
    const job = query.data, running = runningScheduleImport(job), expired = useImportReportExpired(job?.report_expires_at, job?.report_expired);
    useEffect(() => {
        if (job && !runningScheduleImport(job)) void qc.invalidateQueries({ predicate: q => q.queryKey[0] === "rooms" && (q.queryKey[1] === "availability" || q.queryKey[2] === "blocks") });
    }, [job, qc]);
    function download(correction: boolean) {
        if (!job || expired) return;
        saveScheduleCsv(new Blob([scheduleFailureCsv(job, correction)], { type: "text/csv;charset=utf-8" }), `${correction ? "koreksi" : "laporan"}_jadwal_${job.id}.csv`);
    }
    return <section aria-labelledby="judul-impor-jadwal" className="flex min-w-0 flex-col gap-3 border-t border-border-subtle pt-4">
        <h3 id="judul-impor-jadwal" className="text-base font-semibold text-text-primary">Impor CSV jadwal tetap</h3>
        <p className="text-sm text-text-secondary">Berkas dapat memuat beberapa ruangan. Gunakan kode ruangan dan satu nama hari (Senin–Minggu) per baris, jam HH:MM WIB, serta tanggal YYYY-MM-DD dalam tahun ajaran aktif. Pemisah koma atau titik koma diterima. Baris bentrok gagal; reservasi tetap tersimpan.</p>
        <div><Tombol varian="secondary" sibuk={template.isPending} onClick={() => template.mutate()}>Unduh templat CSV</Tombol></div>
        {template.isError && <KeadaanGalat galat={template.error} onCobaLagi={() => template.mutate()} />}
        <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); if (file) upload.mutate(file); }}>
            <Isian label="Berkas jadwal tetap" type="file" accept=".csv,text/csv" disabled={upload.isPending || running} bantuan="CSV UTF-8 maksimal 6 MB. Lebih dari 200 baris diproses di latar belakang dan diberi notifikasi saat selesai." onChange={e => { setFile(e.currentTarget.files?.[0] ?? null); upload.reset(); }} />
            <div><Tombol type="submit" disabled={!file || running} sibuk={upload.isPending}>Mulai impor jadwal</Tombol></div>
            {upload.isError && (upload.error instanceof ScheduleImportInputError ? <Peringatan varian="error">{upload.error.message}</Peringatan> : <KeadaanGalat galat={upload.error} onCobaLagi={() => { if (file) upload.mutate(file); }} />)}
        </form>
        {jobId && query.isPending && <KeadaanMemuat label="Memuat laporan jadwal tetap" baris={3} />}
        {query.isError && <KeadaanGalat galat={query.error} onCobaLagi={() => void query.refetch()} />}
        {job && <section aria-label="Laporan impor jadwal tetap" className="flex min-w-0 flex-col gap-3 rounded-md border border-border-subtle p-3">
            <p className="break-all text-sm text-text-secondary">{expired ? `impor-${job.id}` : job.nama_berkas}</p>
            <p role="status" className="text-text-primary">{labels[job.status]} — {job.terproses} dari {job.total} baris. {job.sukses} berhasil, {job.gagal} gagal.</p>
            {running && <progress aria-label="Progres impor jadwal tetap" max={job.total} value={job.terproses} className="w-full" />}
            <ImportReportRetention expired={expired} expires={job.report_expires_at} />
            {upload.data?.meta?.idempotent_replay && <Peringatan varian="info">Berkas sudah diterima. Hasil pekerjaan sebelumnya ditampilkan.</Peringatan>}
            {!expired && job.pesan_galat && <Peringatan varian="error">{job.pesan_galat}</Peringatan>}
            {!expired && job.laporan_gagal.length > 0 && <div className="max-w-full overflow-x-auto"><table className="w-full text-left text-sm text-text-primary"><caption className="mb-2 text-left font-medium">Baris yang perlu diperbaiki</caption><thead><tr>{["Baris", "Kode ruangan", "Alasan gagal"].map(s => <th scope="col" className="p-2" key={s}>{s}</th>)}</tr></thead><tbody>{job.laporan_gagal.map(r => <tr key={r.baris} className="border-t border-border-subtle"><td className="p-2">{r.baris}</td><td className="break-all p-2">{r.kode_ruangan ?? "—"}</td><td className="p-2">{r.pesan}</td></tr>)}</tbody></table></div>}
            {!running && !expired && <div className="flex flex-wrap gap-2"><Tombol varian="secondary" onClick={() => download(false)}>Unduh laporan jadwal</Tombol>{job.gagal > 0 && <Tombol varian="secondary" onClick={() => download(true)}>Unduh berkas koreksi jadwal</Tombol>}</div>}
        </section>}
    </section>;
}
