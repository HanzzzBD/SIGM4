import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { StatusReservasi } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button, Chips, EmptyState, EntityCard, Input, Label, Notice, Screen, Toggle, tokens as t } from "../../shared/ui";
import { rangeLabel } from "../../shared/wib";
import { loadList } from "./api";
import { STATUS_LABEL, STATUS_TONE } from "./model";

const FILTERS: readonly (StatusReservasi | "")[] = ["", "MENUNGGU_PERSETUJUAN", "DISETUJUI", "PERLU_REVISI", "BERLANGSUNG", "SELESAI", "DITOLAK", "DIBATALKAN"];

/** MS-47 — padanan P-30: pengajuan tersaring scope role oleh server (FR-07.3). */
export function ReservationListScreen() {
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const [status, setStatus] = useState<StatusReservasi | "">(""), [q, setQ] = useState(""), [mine, setMine] = useState(false), [page, setPage] = useState(1);
    const permitted = Object.hasOwn(permissions, "reservation.view"), broad = permitted && permissions["reservation.view"] !== "own";
    const resource = useResource(`${account}:reservations:${status}:${q}:${mine}:${page}`, useCallback((signal: AbortSignal) => permitted ? loadList(api, { page, per_page: 20, ...(status ? { status } : {}), ...(q.trim() ? { q: q.trim() } : {}), ...(mine ? { pemohon: "saya" as const } : {}) }, signal) : Promise.resolve(null), [api, page, status, q, mine, permitted]));
    if (!permitted) return <Screen title="Reservasi"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat reservasi."/></Screen>;
    return <Screen title="Reservasi">
        {Object.hasOwn(permissions, "reservation.create") && <View style={{ flexDirection: "row", gap: t.space.sm }}><View style={{ flex: 1 }}><Button icon="calendarDays" title="Kalender" secondary onPress={() => router.push("/kalender-ruangan" as "/scan")}/></View><View style={{ flex: 1 }}><Button icon="plus" title="Ajukan" onPress={() => router.push("/reservasi/baru" as "/scan")}/></View></View>}
        <Input icon="search" label="Cari" value={q} onChangeText={(v) => { setQ(v); setPage(1); }} placeholder="Nomor atau nama kegiatan"/>
        <Chips label="Status" value={status} options={FILTERS.map((s) => ({ value: s, label: s ? STATUS_LABEL[s] : "Semua" }))} onChange={(v) => { setStatus(v); setPage(1); }}/>
        {broad && <Toggle label="Hanya pengajuan saya" value={mine} onChange={(v) => { setMine(v); setPage(1); }}/>}
        {resource.loading && <Label tone="muted">Memuat reservasi…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {resource.data?.data.length === 0 && <EmptyState illustration="empty" title="Belum ada reservasi" description="Pengajuan pada saringan ini akan tampil di sini."/>}
        {resource.data?.data.map((item) => <EntityCard key={item.id} icon={item.jenis === "RUANGAN" ? "calendarCheck" : "package"} title={item.nama_kegiatan ?? item.ruangan?.nama ?? item.nomor} meta={[item.nomor, rangeLabel(item.waktu_mulai, item.waktu_selesai)]} statuses={[{ label: STATUS_LABEL[item.status], tone: STATUS_TONE[item.status] }]} {...(item.jumlah_tanggal > 0 ? { value: `${item.jumlah_tanggal}×` } : {})} onPress={() => router.push(`/reservasi/${item.id}` as "/scan")}/>)}
        {resource.data && resource.data.meta.total_pages > 1 && <View style={{ flexDirection: "row", gap: t.space.sm, alignItems: "center" }}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{resource.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= resource.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
    </Screen>;
}
