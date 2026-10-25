import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button, Chips, DateField, EmptyState, EntityCard, Input, Label, Notice, Screen, tokens as t } from "../../shared/ui";
import { dateWib, isoWib, shiftDay, shortDate, validTime } from "../../shared/wib";
import { loadAssets } from "./api";

/** MS-45 — padanan P-28: aset yang dapat dipinjam + jumlah tersedia pada rentang WIB (FR-08.1). */
export function CatalogScreen() {
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const today = dateWib(Date.now());
    const [startDate, setStartDate] = useState(shiftDay(today, 1)), [startTime, setStartTime] = useState("08:00"), [endDate, setEndDate] = useState(shiftDay(today, 1)), [endTime, setEndTime] = useState("17:00");
    const [q, setQ] = useState(""), [category, setCategory] = useState<string>(""), [page, setPage] = useState(1);
    const valid = validTime(startTime) && validTime(endTime) && `${endDate}${endTime}` > `${startDate}${startTime}`;
    const dari = isoWib(startDate, startTime), sampai = isoWib(endDate, endTime), permitted = Object.hasOwn(permissions, "reservation.view");
    const resource = useResource(`${account}:asset-catalog:${dari}:${sampai}:${q}:${category}:${page}`, useCallback((signal: AbortSignal) => permitted && valid ? loadAssets(api, { dari, sampai, ...(q.trim() ? { q: q.trim() } : {}), ...(category ? { kategori_id: category } : {}), page }, signal) : Promise.resolve(null), [api, dari, sampai, q, category, page, permitted, valid]));
    if (!permitted) return <Screen title="Katalog Aset"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat reservasi."/></Screen>;
    const data = resource.data, reset = () => setPage(1);
    return <Screen title="Katalog Aset" subtitle="Jumlah tersedia dihitung untuk rentang yang dipilih. Pemilihan belum mengunci aset sampai pengajuan dikirim.">
        <View style={{ flexDirection: "row", gap: t.space.sm }}><View style={{ flex: 1 }}><DateField label="Mulai" value={startDate} min={today} onChange={(v) => { setStartDate(v); if (v > endDate) setEndDate(v); reset(); }}/></View><View style={{ width: t.size.avatar * 2 }}><Input label="Jam" value={startTime} onChangeText={(v) => { setStartTime(v); reset(); }} maxLength={5} placeholder="08:00"/></View></View>
        <View style={{ flexDirection: "row", gap: t.space.sm }}><View style={{ flex: 1 }}><DateField label="Kembali" value={endDate} min={startDate} onChange={(v) => { setEndDate(v); reset(); }}/></View><View style={{ width: t.size.avatar * 2 }}><Input label="Jam" value={endTime} onChangeText={(v) => { setEndTime(v); reset(); }} maxLength={5} placeholder="17:00"/></View></View>
        {!valid && <Notice tone="info" message="Isi jam HH:MM dan pastikan waktu kembali sesudah waktu mulai."/>}
        <Input icon="search" label="Cari aset" value={q} onChangeText={(v) => { setQ(v); reset(); }} placeholder="Nama aset"/>
        {data && data.data.kategori.length > 0 && <Chips label="Kategori" value={category} options={[{ value: "", label: "Semua" }, ...data.data.kategori.map((k) => ({ value: k.id, label: k.nama }))]} onChange={(v) => { setCategory(v); reset(); }}/>}
        {resource.loading && valid && <Label tone="muted">Memuat ketersediaan…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {data && data.data.kelompok.length === 0 && <EmptyState illustration="empty" title="Tidak ada aset" description="Ubah kata kunci, kategori, atau rentang waktu."/>}
        {data?.data.kelompok.map((group) => <EntityCard key={group.key} icon="package" photo={group.foto_url} title={group.nama} meta={[group.kategori.nama, [group.merek, group.model].filter(Boolean).join(" ")]}
            statuses={[group.jumlah_tersedia > 0 ? { label: `${group.jumlah_tersedia} tersedia`, tone: "success" } : group.tersedia_mulai ? { label: `Bebas mulai ${shortDate(dateWib(new Date(group.tersedia_mulai)))}`, tone: "warning" } : { label: "Tidak tersedia", tone: "error" }]}
            value={`${group.jumlah_tersedia}/${group.jumlah_unit}`}
            {...(Object.hasOwn(permissions, "reservation.create") && group.jumlah_tersedia > 0 ? { onPress: () => router.push(`/reservasi/baru?mode=ASET&kategori=${group.kategori.id}&mulai=${encodeURIComponent(dari)}&selesai=${encodeURIComponent(sampai)}` as "/scan") } : {})}/>)}
        {data && data.meta.total_pages > 1 && <View style={{ flexDirection: "row", gap: t.space.sm, alignItems: "center" }}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
    </Screen>;
}
