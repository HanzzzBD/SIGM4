import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { FineListQuery, LoanListQuery } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { REGISTERED_SCREENS } from "../../shared/screens";
import { Button, Chips, EmptyState, EntityCard, Input, Label, Notice, Screen, tokens as t } from "../../shared/ui";
import { formatTime } from "../../shared/time";
import { rupiah } from "../../shared/wib";
import { loadFines, loadLoans } from "./api";
import { FINE_LABEL, FINE_TONE, LOAN_TABS, fineKind, loanLabel, loanTone } from "./model";

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
    return pages > 1 ? <View style={{ flexDirection: "row", gap: t.space.sm, alignItems: "center" }}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => onPage(page - 1)}/><Label tone="muted">{page}/{pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= pages} onPress={() => onPage(page + 1)}/></View> : null;
}

/** MS-12 Peminjaman Saya / MS-49 Daftar Peminjaman — padanan P-32; cakupan baris ditentukan server (FR-09.3). */
export function LoanListScreen() {
    const params = useLocalSearchParams<{ tab?: string; q?: string }>();
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {}, manage = Object.hasOwn(permissions, "loan.manage");
    const [tab, setTab] = useState<LoanListQuery["tab"]>(LOAN_TABS.some((x) => x.value === params.tab) ? params.tab as LoanListQuery["tab"] : "aktif"), [q, setQ] = useState(params.q ?? ""), [page, setPage] = useState(1);
    const permitted = Object.hasOwn(permissions, "loan.view");
    const resource = useResource(`${account}:loans:${tab}:${q}:${page}`, useCallback((signal: AbortSignal) => permitted ? loadLoans(api, { tab, page, per_page: 20, ...(q.trim() ? { q: q.trim() } : {}) }, signal) : Promise.resolve(null), [api, tab, q, page, permitted]));
    const title = manage ? "Daftar Peminjaman" : "Peminjaman Saya";
    if (!permitted) return <Screen title={title}><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat peminjaman."/></Screen>;
    return <Screen title={title} subtitle="Denda berjalan adalah estimasi sampai pengembalian tercatat. Pembayaran dilakukan luring.">
        {manage && REGISTERED_SCREENS["MS-50"] && <Button icon="handshake" title="Antrean serah terima" secondary onPress={() => router.push("/peminjaman/serah-terima" as "/scan")}/>}
        <Chips label="Status" value={tab} options={LOAN_TABS} onChange={(v) => { setTab(v); setPage(1); }}/>
        <Input icon="search" label="Cari" value={q} onChangeText={(v) => { setQ(v); setPage(1); }} placeholder="Nomor, peminjam, atau kode aset"/>
        {resource.loading && <Label tone="muted">Memuat peminjaman…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {resource.data?.data.length === 0 && <EmptyState illustration="empty" title="Tidak ada peminjaman" description="Ubah tab atau kata kunci untuk mencari transaksi lain."/>}
        {resource.data?.data.map((l) => <EntityCard key={l.id} icon="handHelping" title={l.nomor} meta={[manage ? l.peminjam.nama : null, `Jatuh tempo ${formatTime(l.tanggal_jatuh_tempo)}`]}
            statuses={[{ label: loanLabel(l.status), tone: loanTone(l.status) }, ...(l.hari_terlambat > 0 ? [{ label: `${l.hari_terlambat} hari · ${rupiah(l.estimasi_denda)}`, tone: "error" as const }] : [])]} value={`${l.unit_aktif}`} onPress={() => router.push(`/peminjaman/${l.id}` as "/scan")}/>)}
        <Pager page={page} pages={resource.data?.meta.total_pages ?? 1} onPage={setPage}/>
    </Screen>;
}

const KINDS = [{ value: "", label: "Semua" }, { value: "KETERLAMBATAN", label: "Keterlambatan" }, { value: "GANTI_RUGI", label: "Ganti Rugi" }] as const;
/** MS-14 Denda Saya / MS-52 Denda & Kewajiban — padanan P-35; kewajiban per unit (FR-09.4). */
export function FineListScreen() {
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {}, own = permissions["fine.view"] === "own";
    const [kind, setKind] = useState<"" | NonNullable<FineListQuery["jenis"]>>(""), [status, setStatus] = useState<"" | NonNullable<FineListQuery["status"]>>(""), [page, setPage] = useState(1);
    const permitted = Object.hasOwn(permissions, "fine.view"), title = own ? "Denda Saya" : "Denda & Kewajiban";
    const resource = useResource(`${account}:fines:${kind}:${status}:${page}`, useCallback((signal: AbortSignal) => permitted ? loadFines(api, { page, per_page: 20, ...(kind ? { jenis: kind } : {}), ...(status ? { status } : {}) }, signal) : Promise.resolve(null), [api, kind, status, page, permitted]));
    if (!permitted) return <Screen title={title}><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat kewajiban."/></Screen>;
    return <Screen title={title} subtitle="Kewajiban terbit per unit setelah pengembalian terlambat atau penetapan ganti rugi. Pembayaran dilakukan luring dan dicatat petugas berwenang.">
        <Chips label="Jenis" value={kind} options={KINDS} onChange={(v) => { setKind(v); setPage(1); }}/>
        <Chips label="Status" value={status} options={[{ value: "" as const, label: "Semua" }, ...Object.entries(FINE_LABEL).map(([value, label]) => ({ value: value as keyof typeof FINE_LABEL, label }))]} onChange={(v) => { setStatus(v); setPage(1); }}/>
        {resource.loading && <Label tone="muted">Memuat kewajiban…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {resource.data?.data.length === 0 && <EmptyState illustration="success" title="Tidak ada kewajiban" description="Kewajiban pada saringan ini akan tampil di sini."/>}
        {resource.data?.data.map((f) => <EntityCard key={f.id} icon="receipt" title={`${fineKind(f.jenis)} · ${f.kode_barang}`} meta={[f.nama_aset, own ? f.nomor_peminjaman : f.peminjam.nama]} statuses={[{ label: FINE_LABEL[f.status], tone: FINE_TONE[f.status] }]} value={rupiah(f.sisa ?? f.jumlah)} onPress={() => router.push(`/denda/${f.id}` as "/scan")}/>)}
        <Pager page={page} pages={resource.data?.meta.total_pages ?? 1} onPage={setPage}/>
    </Screen>;
}
