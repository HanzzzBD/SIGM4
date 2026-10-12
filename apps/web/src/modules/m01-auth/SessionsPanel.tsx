import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Lencana, Tombol } from "../../shared/ui/primitives";
import { cabutSesi, sessionsQuery } from "./account-api";
import { logoutSemua } from "./api";
import { accountError } from "./account-api";
const WAKTU = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
export function SessionsPanel() {
    const query = useQuery(sessionsQuery); const qc = useQueryClient(); const navigate = useNavigate();
    const [pilihan, setPilihan] = useState<{ id: string | null; current: boolean } | null>(null); const [sibuk, setSibuk] = useState(false); const [galat, setGalat] = useState<string | undefined>();
    const cabut = async () => { if (!pilihan || sibuk) return; setSibuk(true); setGalat(undefined); try { if (pilihan.id === null) await logoutSemua(); else await cabutSesi(pilihan.id); if (pilihan.id === null || pilihan.current) { await navigate({ to: "/login" }); qc.clear(); } else { setPilihan(null); await query.refetch(); } } catch (error) { setGalat(accountError(error)); } finally { setSibuk(false); } };
    return <section id="perangkat" aria-labelledby="judul-perangkat" className="flex min-w-0 flex-col gap-4 scroll-mt-4"><h2 id="judul-perangkat" className="text-xl font-semibold">Perangkat Terhubung</h2>
        {query.isPending ? <KeadaanMemuat label="Memuat sesi" /> : query.isError ? <KeadaanGalat galat={query.error} onCobaLagi={() => void query.refetch()} /> : query.data.length === 0 ? <KeadaanKosong judul="Tidak ada sesi aktif" pesan="Perangkat yang terhubung akan tampil di sini." /> : <ul className="flex flex-col gap-3">{query.data.map((s) => <li key={s.id} className="flex min-w-0 flex-col gap-2 rounded-md border border-border-subtle p-4"><div className="flex flex-wrap gap-2"><span>{s.platform}</span>{s.saat_ini && <Lencana varian="success">Perangkat ini</Lencana>}</div><p className="break-all text-sm">{s.user_agent ?? "Informasi perangkat tidak tersedia"}</p><p className="text-sm">IP: {s.ip ?? "—"} · Terakhir diperbarui {WAKTU.format(new Date(s.terakhir_diperbarui))} WIB</p><Tombol varian="secondary" onClick={() => { setGalat(undefined); setPilihan({ id: s.id, current: s.saat_ini }); }} aria-label={`Cabut sesi ${s.platform}${s.saat_ini ? ", perangkat ini" : ""}`}>Cabut perangkat</Tombol></li>)}</ul>}
        <Tombol varian="danger" onClick={() => { setGalat(undefined); setPilihan({ id: null, current: true }); }}>Keluar dari semua perangkat</Tombol>
        <DialogKonfirmasi buka={pilihan !== null} onTutup={() => setPilihan(null)} judul={pilihan?.id === null ? "Keluar dari semua perangkat?" : "Cabut sesi perangkat?"} labelAksi="Cabut sesi" varian="danger" sibuk={sibuk} galat={galat} onKonfirmasi={() => void cabut()}><p>{pilihan?.current ? "Anda juga akan keluar dari perangkat ini dan kembali ke Login." : "Perangkat tersebut harus masuk ulang. Perangkat ini tetap masuk."}</p></DialogKonfirmasi>
    </section>;
}
