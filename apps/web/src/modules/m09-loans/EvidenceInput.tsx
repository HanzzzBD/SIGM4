import { useEffect, useId, useRef, useState } from "react";
import { Peringatan, Tombol } from "../../shared/ui/primitives";
import { uploadEvidence } from "./api";
import { preparePhoto } from "./photo-preparation";

/** C-29 / DP-05a: pratinjau lokal saja; URL storage hanya diterbitkan backend setelah CLEAN. */
export function EvidenceInput({ label, ids, onChange, signature = false, disabled = false, onBusyChange, galat, fieldPath }: { readonly galat?: string | undefined; readonly fieldPath?: string | undefined; readonly label: string; readonly ids: readonly number[]; readonly onChange: (ids: readonly number[]) => void; readonly signature?: boolean; readonly disabled?: boolean; readonly onBusyChange?: (busy: boolean) => void }) {
    const id = useId(), alive = useRef(true), cancel = useRef<AbortController | null>(null), uploading = useRef(false);
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [previews, setPreviews] = useState<readonly { id: number; file: File; name: string }[]>([]), [failed, setFailed] = useState<readonly File[]>([]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; cancel.current?.abort(); }; }, []);
    const upload = async (files: readonly File[]) => {
        if (uploading.current) return;
        if (files.length + ids.length > (signature ? 1 : 5)) { setError(signature ? "Gunakan satu tanda tangan." : "Maksimal lima foto per unit."); return; }
        const controller = new AbortController(); cancel.current = controller; uploading.current = true; setBusy(true); onBusyChange?.(true); setError(null);
        const next = [...ids], images = [...previews], remaining = [...files]; setFailed([]);
        try {
            for (const file of files) {
                if (signature && file.type !== "image/png") throw new Error("Tanda tangan harus PNG.");
                const prepared = signature ? file : await preparePhoto(file);
                const uploaded = await uploadEvidence(prepared, controller.signal);
                if (!alive.current) return;
                images.push({ id: uploaded, file, name: file.name }); next.push(uploaded);
                setPreviews([...images]); onChange([...next]);
                remaining.shift();
            }
        } catch (failure) { if (alive.current && !controller.signal.aborted) { setFailed(remaining); setError(failure instanceof Error ? failure.message : "Unggahan gagal. Coba lagi."); } }
        finally { uploading.current = false; if (alive.current) { setBusy(false); onBusyChange?.(false); } }
    };
    return <div className="flex flex-col gap-3"><label htmlFor={id} className="text-base font-medium">{label} (wajib)</label><input id={id} data-field={fieldPath} aria-invalid={galat!==undefined||undefined} aria-describedby={galat?`${id}-error`:undefined} type="file" accept={signature ? "image/png" : "image/jpeg,image/png"} multiple={!signature} disabled={disabled || busy} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void upload(files); }} className="w-full min-w-0 text-base" />{galat&&<p id={`${id}-error`} className="text-sm text-error-base">{galat}</p>}<p role="status" className="text-sm text-text-secondary">{busy ? "Mengunggah bukti…" : `${ids.length} berkas berhasil diunggah. Bukti tersimpan privat dan menunggu pemindaian sebelum ditampilkan.`}</p>{error && <Peringatan varian="error">{error}</Peringatan>}{failed.length > 0 && <Tombol varian="secondary" disabled={disabled || busy} onClick={() => void upload(failed)}>Coba unggah lagi</Tombol>}<div className="flex flex-wrap gap-3">{previews.filter((p) => ids.includes(p.id)).map((p) => <div key={p.id} className="flex flex-col gap-2"><PratinjauBerkas file={p.file} label={`Pratinjau ${p.name}`} /><Tombol varian="secondary" disabled={disabled || busy} onClick={() => { setPreviews((old) => old.filter((f) => f.id !== p.id)); onChange(ids.filter((file) => file !== p.id)); }}>Lepas {p.name}</Tombol></div>)}</div></div>;
}

/** Pratinjau lokal digambar langsung dari berkas ke kanvas — tanpa URL apa pun yang berasal dari masukan (DP-05a). */
function PratinjauBerkas({ file, label }: { readonly file: File; readonly label: string }) {
    const kanvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        let aktif = true;
        if (typeof createImageBitmap !== "function") return;
        void createImageBitmap(file).then((gambar) => {
            const c = kanvas.current, ctx = c?.getContext("2d");
            if (!aktif || !c || !ctx) { gambar.close(); return; }
            const skala = Math.min(c.width / gambar.width, c.height / gambar.height, 1), w = gambar.width * skala, h = gambar.height * skala;
            ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(gambar, (c.width - w) / 2, (c.height - h) / 2, w, h); gambar.close();
        }).catch(() => undefined);
        return () => { aktif = false; };
    }, [file]);
    // width/height = resolusi bitmap (2× ukuran tampil h-24), bukan gaya; ukuran tampil tetap token.
    return <canvas ref={kanvas} width={192} height={192} role="img" aria-label={label} className="h-24 w-24 rounded-sm border border-border-subtle" />;
}

/** UX 31.6: bitmap 600×300, penunjuk sentuh/mouse; unggah PNG sebagai alternatif papan ketik. */
export function SignaturePad({ onFile, disabled }: { readonly onFile: (id: number | null) => void; readonly disabled: boolean }) {
    const canvas = useRef<HTMLCanvasElement>(null), drawing = useRef(false), alive = useRef(true);
    const [ink, setInk] = useState(false), [saved, setSaved] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [reset, setReset] = useState(0), [alternative, setAlternative] = useState<readonly number[]>([]);
    const abort = useRef<AbortController | null>(null);
    useEffect(() => { alive.current = true; return () => { alive.current = false; abort.current?.abort(); }; }, []);
    return <section className="flex flex-col gap-3" aria-label="Tanda tangan penerima"><p className="text-base font-medium">Tanda tangan penerima (wajib)</p><p className="text-sm">Penerima menandatangani langsung pada bidang ini, atau unggah PNG tanda tangan melalui pilihan di bawah.</p><canvas ref={canvas} width={600} height={300} aria-label="Bidang tanda tangan; alternatif unggah PNG tersedia di bawah" className="h-auto w-full touch-none rounded-sm border border-border-strong bg-surface-default" onPointerDown={(e) => { if (disabled || busy || saved) return; drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const rect = e.currentTarget.getBoundingClientRect(), ctx = e.currentTarget.getContext("2d")!; ctx.beginPath(); ctx.moveTo((e.clientX - rect.left) * 600 / rect.width, (e.clientY - rect.top) * 300 / rect.height); }} onPointerMove={(e) => { if (!drawing.current) return; const rect = e.currentTarget.getBoundingClientRect(), ctx = e.currentTarget.getContext("2d")!; ctx.lineTo((e.clientX - rect.left) * 600 / rect.width, (e.clientY - rect.top) * 300 / rect.height); ctx.stroke(); setInk(true); onFile(null); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} /><div className="flex flex-wrap gap-3"><Tombol disabled={disabled || busy || !ink || saved} sibuk={busy} onClick={() => { setBusy(true); setError(null); abort.current = new AbortController(); canvas.current?.toBlob((blob) => { if (!blob) { setBusy(false); setError("Tanda tangan tidak dapat disimpan."); return; } void uploadEvidence(new File([blob], "tanda-tangan.png", { type: "image/png" }), abort.current!.signal).then((id) => { if (alive.current) { onFile(id); setSaved(true); } }).catch((failure: unknown) => { if (alive.current) setError(failure instanceof Error ? failure.message : "Tanda tangan gagal diunggah."); }).finally(() => { if (alive.current) setBusy(false); }); }, "image/png"); }}>Simpan tanda tangan</Tombol><Tombol varian="secondary" disabled={disabled || busy} onClick={() => { canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 300); setInk(false); setSaved(false); setAlternative([]); setReset((n) => n + 1); onFile(null); }}>Bersihkan</Tombol></div>{saved && <p role="status">Tanda tangan berhasil disimpan.</p>}{error && <Peringatan varian="error">{error}</Peringatan>}<EvidenceInput key={reset} label="Unggah tanda tangan PNG sebagai alternatif" ids={alternative} signature disabled={disabled || busy || saved} onChange={(ids) => { setAlternative(ids); onFile(ids[0] ?? null); setSaved(ids.length > 0); }} /></section>;
}
