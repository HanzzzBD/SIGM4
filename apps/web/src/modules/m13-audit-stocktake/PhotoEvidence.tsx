import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod/mini";
import { api } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { Tombol, Peringatan } from "../../shared/ui/primitives";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { StocktakeAttempt, message } from "./api";
const Response = z.object({ data: z.array(z.object({ file_id: z.string(), item_id: z.nullable(z.string()), finding_id: z.nullable(z.string()), status: z.string(), url: z.nullable(z.string()) })) });
const labels: Record<string, string> = { CLEAN: "Terverifikasi", PENDING: "Sedang diperiksa", INFECTED: "Ditolak pemeriksaan keamanan", REJECTED: "Ditolak", BELUM_TERUNGGAH: "Belum terunggah" };
export default function PhotoEvidence({ id, running }: { id: string; running: boolean }) {
    const [page, setPage] = useState(1), [selected, setSelected] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
    const can = useCan(), client = useQueryClient(), attempt = useRef(new StocktakeAttempt());
    const q = useQuery({ queryKey: ["stocktake", id, "photos", page], queryFn: async () => Response.parse((await api.get(`/audit-sessions/${id}/photos`, { params: { page, per_page: 20 } })).data).data, refetchInterval: 10000 });
    const remove = async (alasan: string) => { if (!selected) return; setBusy(true); setError(""); try { await attempt.current.send(`/audit-sessions/${id}/photos/${selected}/remove`, { alasan }); setSelected(null); await client.invalidateQueries({ queryKey: ["stocktake", id] }); } catch (e) { setError(message(e)); } finally { setBusy(false); } };
    return <section className="flex flex-col gap-4"><h2 className="text-lg font-semibold">Foto bukti pemeriksaan</h2>{q.isPending ? <KeadaanMemuat label="Memuat foto bukti" /> : q.isError ? <KeadaanGalat galat={q.error} onCobaLagi={() => void q.refetch()} /> : <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{q.data.map(p => {
        const safeUrl = p.url && /^https?:\/\//i.test(p.url) ? p.url : null;
        return <article key={p.file_id} className="flex flex-col gap-3 rounded-md border border-border-subtle p-4"><p>{p.item_id ? `Pemeriksaan #${p.item_id}` : `Temuan baru #${p.finding_id}`}</p>{safeUrl && <a href={safeUrl} target="_blank" rel="noopener noreferrer"><img src={safeUrl} alt={`Bukti ${p.item_id ? `pemeriksaan ${p.item_id}` : `temuan ${p.finding_id}`}`} loading="lazy" className="h-48 w-full object-contain" /></a>}<p>{labels[p.status] ?? "Foto belum siap"}</p>{running && can("audit.manage") && p.status !== "CLEAN" && <Tombol varian="secondary" disabled={busy} onClick={() => setSelected(p.file_id)}>Tarik foto yang belum siap</Tombol>}</article>;
    })}</div>{q.data.length === 0 && <p>Belum ada foto pada halaman ini.</p>}<nav aria-label="Halaman foto bukti" className="flex flex-wrap gap-3"><Tombol varian="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Foto sebelumnya</Tombol><span>Halaman {page}</span><Tombol varian="secondary" disabled={q.data.length < 20} onClick={() => setPage(page + 1)}>Foto berikutnya</Tombol></nav></>}{error && <Peringatan varian="error">{error}</Peringatan>}<DialogKonfirmasi buka={selected !== null} onTutup={() => setSelected(null)} judul="Tarik foto yang belum siap?" labelAksi="Tarik foto" labelAlasan="Alasan penarikan foto" sibuk={busy} galat={error || undefined} onKonfirmasi={alasan => void remove(alasan)}>Hasil pemeriksaan tetap tersimpan. Foto ini tidak digunakan untuk rekonsiliasi dan alasannya dicatat.</DialogKonfirmasi></section>;
}
