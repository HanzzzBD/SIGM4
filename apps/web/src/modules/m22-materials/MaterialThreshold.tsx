import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCan } from "../../shared/auth";
import { api } from "../../shared/api";
import { Isian, Tombol, Peringatan } from "../../shared/ui/primitives";
import { MaterialWriteAttempt } from "./api";
import { thresholdQuery, materialBusinessError } from "./request-api";
export default function MaterialThreshold({ id }: { id: string }) {
    const can = useCan(), q = useQuery({ ...thresholdQuery(id), enabled: can("setting.view") }), [value, setValue] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), attempt = useRef(new MaterialWriteAttempt());
    if (!can("setting.view")) return null;
    const save = async (reset: boolean) => { const limit = Number(value); if (!reset && (!value.trim() || !Number.isInteger(limit) || limit < 0 || limit > 2147483647)) { setError("Isi batas jumlah bulat nonnegatif."); return; } setBusy(true); setError(""); try { await attempt.current.send({ reset, batas: reset ? null : limit }, async (body, key) => { const c = body as { reset: boolean; batas: number | null }; return c.reset ? api.delete(`/materials/${id}/request-threshold`, { data: {}, headers: { "Idempotency-Key": key } }) : api.put(`/materials/${id}/request-threshold`, { batas: c.batas }, { headers: { "Idempotency-Key": key } }); }); await q.refetch(); setValue(""); } catch (e) { setError(materialBusinessError(e)); } finally { setBusy(false); } };
    return <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">Ambang Persetujuan Permintaan</h2>{error && <Peringatan varian="error">{error}</Peringatan>}{q.isError ? <Tombol onClick={() => void q.refetch()}>Muat ambang lagi</Tombol> : <p>Bawaan: {q.data?.default_qty ?? "Belum dikonfigurasi"} · Khusus bahan: {q.data?.batas_khusus ?? "Mengikuti bawaan"}.</p>}{can("setting.manage") && <><Isian label="Batas jumlah khusus bahan" type="number" min={0} max={2147483647} step={1} value={value} onChange={e => setValue(e.target.value)} /><div className="flex flex-wrap gap-3"><Tombol disabled={busy} onClick={() => void save(false)}>Simpan batas khusus</Tombol><Tombol varian="secondary" disabled={busy || q.data?.batas_khusus == null} onClick={() => void save(true)}>Gunakan batas bawaan</Tombol></div><a href="/pengaturan?kelompok=BAHAN" className="text-text-link underline">Atur ambang bawaan</a></>}</section>;
}
