import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { StocktakeCreateSchema } from "@sigm4/schemas";
import { Isian, Pilihan, Tombol, KotakCentang, Peringatan } from "../../shared/ui/primitives";
import { KeadaanGalat, KeadaanMemuat } from "../../shared/states";
import { optionsQuery, StocktakeAttempt, message } from "./api";
export default function SessionCreatePage() {
    const q = useQuery(optionsQuery), navigate = useNavigate(), attempt = useRef(new StocktakeAttempt());
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const [domain,setDomain]=useState<"ASET"|"BAHAN">("ASET");
    const [name, setName] = useState(""), [start, setStart] = useState(today), [end, setEnd] = useState(today), [kind, setKind] = useState("SEKOLAH"), [target, setTarget] = useState(""), [category, setCategory] = useState(""), [people, setPeople] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
    if (q.isPending) return <KeadaanMemuat label="Memuat cakupan opname" />;
    if (q.isError) return <KeadaanGalat galat={q.error} onCobaLagi={() => void q.refetch()} />;
    const choices = kind === "GEDUNG" ? q.data.buildings : kind === "RUANGAN" ? q.data.rooms : q.data.categories;
    return <div className="flex flex-col gap-6"><Link to="/opname" className="text-text-link">Kembali ke daftar sesi</Link><header><h1 className="text-2xl font-semibold text-text-heading">Buat Sesi Opname</h1><p className="mt-1 text-text-secondary">Satu sesi memeriksa satu domain. Target dan saldo/kondisi awal dibekukan saat sesi dibuat.</p></header><form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); void (async () => {
        const input = StocktakeCreateSchema.safeParse({ domain,nama: name, periode_mulai: start, periode_selesai: end, cakupan: { jenis: kind, ...(kind === "SEKOLAH" ? {} : { id: Number(target) }), ...(domain==="ASET"&&category && kind !== "KATEGORI" ? { category_id: Number(category) } : {}) }, pelaksana_ids: people.map(Number) });
        if (!input.success) { setError(input.error.issues[0]?.message ?? "Lengkapi sesi."); return; }
        setBusy(true); setError(""); try { const s = await attempt.current.send("/audit-sessions", input.data); if ("id" in s) await navigate({ to: "/opname/$id", params: { id: s.id } }); } catch (error) { setError(message(error)); } finally { setBusy(false); }
    })(); }}>
        <Pilihan label="Domain opname" value={domain} opsi={[{nilai:"ASET",label:"Aset"},{nilai:"BAHAN",label:"Bahan"}]} onChange={e=>{setDomain(e.target.value as "ASET"|"BAHAN");setKind("SEKOLAH");setTarget("");setCategory("");}}/>
        <Isian label="Nama sesi" required value={name} maxLength={200} onChange={e => setName(e.target.value)} />
        <div className="grid gap-4 md:grid-cols-2"><Isian label="Periode mulai (WIB)" type="date" required value={start} onChange={e => setStart(e.target.value)} /><Isian label="Periode selesai (WIB)" type="date" required value={end} min={start} onChange={e => setEnd(e.target.value)} /><Pilihan label="Jenis cakupan" value={kind} opsi={[{ nilai: "SEKOLAH", label: "Seluruh sekolah" }, { nilai: "GEDUNG", label: "Per gedung" }, { nilai: "RUANGAN", label: "Per ruangan" }, ...(domain==="ASET"?[{ nilai: "KATEGORI", label: "Per kategori" }]:[])]} onChange={e => { setKind(e.target.value); setTarget(""); }} />{kind !== "SEKOLAH" && <Pilihan label="Cakupan target" required kosong="Pilih cakupan" value={target} opsi={choices.map(c => ({ nilai: c.id, label: c.nama }))} onChange={e => setTarget(e.target.value)} />}{domain==="ASET"&&kind !== "KATEGORI" && <Pilihan label="Batasi kategori" value={category} kosong="Semua kategori" opsi={q.data.categories.map(c => ({ nilai: c.id, label: c.nama }))} onChange={e => setCategory(e.target.value)} />}</div>
        <fieldset className="flex flex-col gap-3 rounded-md border border-border-subtle p-4"><legend className="px-2 font-medium">Petugas pelaksana</legend>{q.data.people.map(p => <KotakCentang key={p.id} label={p.nama} checked={people.includes(p.id)} onCheckedChange={checked => setPeople(old => checked ? [...old, p.id] : old.filter(id => id !== p.id))} />)}</fieldset>
        {error && <Peringatan varian="error">{error}</Peringatan>}<Tombol type="submit" sibuk={busy}>Buat sesi dan bekukan target</Tombol>
    </form></div>;
}
