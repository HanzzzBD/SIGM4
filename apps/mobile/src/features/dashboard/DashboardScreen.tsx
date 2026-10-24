import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { DashboardCardResponseSchema, DashboardManifestResponseSchema } from "@sigm4/schemas";
import type { DashboardCard, DashboardPeriod } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Button, Card, Label, Notice, Screen, tokens as t } from "../../shared/ui";
import { cardLines, quickActions, visibleCards } from "./model";

function CardView({ card, period, refreshKey }: { card: DashboardCard; period: DashboardPeriod; refreshKey: number }) {
    const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const lastRefresh = useRef(0);
    const load = useCallback(async (signal: AbortSignal) => { const fresh = lastRefresh.current !== refreshKey; lastRefresh.current = refreshKey; return DashboardCardResponseSchema.parse((await api.get(`/dashboard/cards/${card.id}`, { params: { rentang: period, segarkan: fresh ? "true" : "false" }, signal })).data).data; }, [api, card.id, period, refreshKey]);
    const resource = useResource(`${account}:${card.id}:${period}`, load);
    const data = resource.data;
    if (card.id === "efek-tertunda-gagal" && data && typeof data.isi === "object" && data.isi !== null && (data.isi as { jumlah?: number }).jumlah === 0) return null;
    return <Card><Label>{card.judul}</Label>{resource.loading && <Label>Memuat kartu…</Label>}{resource.error && <><Notice message={resource.error} /><Button title="Coba lagi" secondary onPress={resource.reload} /></>}
        {data && <>{cardLines(card.id, data.isi).map((line, index) => <Label key={index}>{line}</Label>)}<Label>Diperbarui {formatTime(data.diperbarui_pada)}</Label></>}
        {card.drilldown && <Label>Daftar tujuan kartu ini belum tersedia pada tahap beranda. Gunakan tab Tugas untuk antrean yang tersedia.</Label>}
    </Card>;
}
export function DashboardScreen() {
    const { state, api } = useAuth(); const [period, setPeriod] = useState<DashboardPeriod>("30_hari"); const [trends, setTrends] = useState(false);
    const [periodMenu, setPeriodMenu] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const permissions = state.kind === "READY" ? state.session.permissions : {}; const account = state.kind === "READY" ? state.session.user.id : "";
    const canView = Object.hasOwn(permissions, "dashboard.view");
    const load = useCallback(async (signal: AbortSignal) => canView ? DashboardManifestResponseSchema.parse((await api.get("/dashboard", { signal })).data).data : null, [api, canView]);
    const resource = useResource(`${account}:dashboard`, load);
    const cards = visibleCards(resource.data?.kartu ?? [], permissions);
    const actions = quickActions(permissions);
    const periods = [["7_hari", "7 hari"], ["30_hari", "30 hari"], ["semester", "Semester"], ["tahun_ajaran", "Tahun ajaran"]] as const;
    return <Screen title="Beranda" action={canView ? <Button title={periods.find(([value]) => value === period)![1]} secondary onPress={() => setPeriodMenu((value) => !value)} /> : undefined}><Label>Selamat datang, {state.kind === "READY" ? state.session.user.nama : ""}.</Label>
        {periodMenu && <Card><Label>Pilih rentang dashboard</Label>{periods.map(([value, label]) => <Button key={value} title={`${period === value ? "✓ " : ""}${label}`} secondary onPress={() => { setPeriod(value); setPeriodMenu(false); }} />)}</Card>}
        {cards.filter((card) => card.zona === 1).map((card) => <CardView key={card.id} card={card} period={period} refreshKey={refreshKey} />)}
        <Card><Label>Aksi cepat</Label><View style={styles.actions}>{actions.map((action) => <View key={action.permission} style={styles.action}><Button title={action.label} disabled={action.path === null} onPress={() => { if (action.path) router.push(action.path as "/scan"); }} />{action.path === null && <Label>Layar {action.label.toLowerCase()} belum tersedia di aplikasi.</Label>}</View>)}</View></Card>
        {!canView && <Label>Dashboard tidak tersedia untuk izin akun Anda. Tab lainnya tetap dapat digunakan.</Label>}
        {canView && <><Button title="Muat ulang dashboard" secondary onPress={() => { setRefreshKey((value) => value + 1); resource.reload(); }} />
        {resource.loading && <Label>Memuat dashboard…</Label>}{resource.error && <><Notice message={resource.error} /><Button title="Coba lagi" onPress={resource.reload} /></>}
        {resource.data && cards.length === 0 && <Label>Belum ada kartu dashboard untuk akun Anda. Antrean yang tersedia dapat dilihat pada tab Tugas.</Label>}
        {[2, 4].map((zone) => cards.filter((card) => card.zona === zone).map((card) => <CardView key={card.id} card={card} period={period} refreshKey={refreshKey} />))}
        {cards.some((card) => card.zona === 3) && <><Button title={trends ? "Ciutkan kecenderungan" : "Lihat kecenderungan"} secondary onPress={() => setTrends((value) => !value)} />{trends && cards.filter((card) => card.zona === 3).map((card) => <CardView key={card.id} card={card} period={period} refreshKey={refreshKey} />)}</>}
        </>}
    </Screen>;
}
const styles = StyleSheet.create({ actions: { flexDirection: "row", flexWrap: "wrap", gap: t.space.md }, action: { flexBasis: "45%", flexGrow: 1, gap: t.space.sm } });
