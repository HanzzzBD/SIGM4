import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { DashboardCardResponseSchema, DashboardManifestResponseSchema } from "@sigm4/schemas";
import type { DashboardCard, DashboardPeriod } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Badge, Button, Card, EmptyState, Icon, Label, MiniChart, ModuleTile, Notice, Screen, SectionHeading, tokens as t } from "../../shared/ui";
import type { IconName } from "../../shared/ui";
import { initials } from "../../shared/ui/model";
import { cardLines, cardSeries, quickActions, visibleCards } from "./model";

/** Kartu KPI C-23: angka utama, sebaran sebagai Grafik Mini C-33 (DSD-11). */
function CardView({ card, period, refreshKey }: { card: DashboardCard; period: DashboardPeriod; refreshKey: number }) {
    const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const lastRefresh = useRef(0);
    const load = useCallback(async (signal: AbortSignal) => { const fresh = lastRefresh.current !== refreshKey; lastRefresh.current = refreshKey; return DashboardCardResponseSchema.parse((await api.get(`/dashboard/cards/${card.id}`, { params: { rentang: period, segarkan: fresh ? "true" : "false" }, signal })).data).data; }, [api, card.id, period, refreshKey]);
    const resource = useResource(`${account}:${card.id}:${period}`, load);
    const data = resource.data;
    if (card.id === "efek-tertunda-gagal" && data && typeof data.isi === "object" && data.isi !== null && (data.isi as { jumlah?: number }).jumlah === 0) return null;
    const lines = data ? cardLines(card.id, data.isi) : [];
    const series = data ? cardSeries(card.id, data.isi) : null;
    const total = series?.reduce((sum, item) => sum + item.value, 0) ?? 0;
    const icon: IconName = /aset/.test(card.id) ? "package" : /pengajuan|persetujuan/.test(card.id) ? "badgeCheck" : /kondisi|kerusakan/.test(card.id) ? "hammer" : /pengguna|role/.test(card.id) ? "users" : /teknisi/.test(card.id) ? "wrench" : "chartColumn";
    return <Card><View style={styles.cardHeading}><View style={styles.smallIcon}><Icon name={icon} color={t.color.iconDefault}/></View><Text style={styles.cardTitle}>{card.judul}</Text></View>
        {resource.loading && <Label tone="muted">Memuat ringkasan...</Label>}{resource.error && <><Notice message={resource.error}/><Button title="Coba lagi" icon="refresh" secondary onPress={resource.reload}/></>}
        {data && series && series.length > 0 ? <View style={styles.chartRow}>
            <MiniChart kind={card.id === "aktivitas-sistem" ? "line" : series.length <= 6 ? "donut" : "bar"} values={series.map((item) => item.value)} summary={`${card.judul}: ${series.map((item) => `${item.label} ${item.value}`).join(", ")}`}/>
            <View style={styles.legend}><Text style={styles.metric}>{new Intl.NumberFormat("id-ID").format(total)}</Text>{lines.slice(0, 3).map((line, index) => <Text key={index} numberOfLines={1} style={styles.caption}>{line}</Text>)}{lines.length > 3 && <Text style={styles.caption}>+{lines.length - 3} lainnya</Text>}</View>
        </View> : data && <><Text style={styles.metric}>{lines[0]}</Text>{lines.slice(1).map((line, index) => <Label tone="muted" key={index}>{line}</Label>)}</>}
        {data && <View style={styles.cardFoot}><Icon name="clock" size={t.size.iconSmall} color={t.color.muted}/><Text style={styles.caption}>{formatTime(data.diperbarui_pada)}</Text></View>}
        {card.id==="pekerjaan-teknisi"&&state.kind==="READY"&&Object.hasOwn(state.session.permissions,"workorder.view")&&<Button title="Buka work order saya" onPress={()=>router.push("/work-order" as "/scan")}/>}
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
    const name = state.kind === "READY" ? state.session.user.nama : "";
    return <Screen title="Beranda" icon="house" subtitle="Ringkasan fasilitas sesuai hak akses akun Anda. Ketuk Segarkan untuk memuat data terbaru." action={canView ? <Button title={periods.find(([value]) => value === period)![1]} icon="calendar" compact secondary onPress={() => setPeriodMenu(value => !value)}/> : undefined}>
        <View style={styles.welcome}><View style={styles.welcomeText}><Text style={styles.caption}>Selamat datang kembali,</Text><Text style={styles.welcomeName}>{name}</Text></View><View style={styles.avatar}><Text style={styles.initials}>{initials(name)}</Text></View></View>
        {periodMenu && <Card><SectionHeading title="Rentang ringkasan"/>{periods.map(([value, label]) => <Button key={value} title={label} icon={period === value ? "check" : "calendar"} secondary onPress={() => { setPeriod(value); setPeriodMenu(false); }}/>)}</Card>}
        {cards.filter(card => card.zona === 1).map(card => <CardView key={card.id} card={card} period={period} refreshKey={refreshKey}/>)}
        {actions.length > 0 && <><SectionHeading title="Aksi cepat"/>
        <View style={styles.actions}>{actions.map(action => <ModuleTile key={action.permission} label={action.label} icon={action.icon} group={action.group} onPress={() => router.push(action.path as "/scan")}/>)}</View></>}
        {!canView && <EmptyState illustration="success" title="Fitur Anda siap digunakan" description="Pilih aksi cepat atau buka tab Tugas untuk memulai."/>}
        {canView && <><SectionHeading title="Ringkasan operasional" action={<Button title="Segarkan" icon="refresh" compact secondary onPress={() => { setRefreshKey(value => value + 1); resource.reload(); }}/>}/>
        {resource.loading && <Label tone="muted">Memuat dashboard...</Label>}{resource.error && <><Notice message={resource.error}/><Button title="Coba lagi" icon="refresh" onPress={resource.reload}/></>}
        {resource.data && cards.length === 0 && <EmptyState illustration="empty" title="Belum ada ringkasan" description="Antrean pekerjaan yang tersedia dapat dilihat di tab Tugas."/>}
        {[2,4].map(zone => cards.filter(card => card.zona === zone).map(card => <CardView key={card.id} card={card} period={period} refreshKey={refreshKey}/>))}
        {cards.some(card => card.zona === 3) && <><Button title={trends ? "Tutup tren aktivitas" : "Lihat tren aktivitas"} icon="chartColumn" secondary onPress={() => setTrends(value => !value)}/>{trends && cards.filter(card => card.zona === 3).map(card => <CardView key={card.id} card={card} period={period} refreshKey={refreshKey}/>)}</>}
        <Badge label="Data mengikuti hak akses akun" tone="neutral"/></>}
    </Screen>;
}
const styles = StyleSheet.create({
 welcome: {flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:t.space.md,paddingVertical:t.space.sm}, welcomeText:{flex:1,gap:t.space.xs},welcomeName:{fontSize:t.font.heading,fontWeight:"600",color:t.color.heading},avatar:{height:t.size.avatar,width:t.size.avatar,borderRadius:t.radius.full,backgroundColor:t.color.primarySoft,alignItems:"center",justifyContent:"center"},initials:{color:t.color.primary,fontSize:t.font.title,fontWeight:"600"},
 actions:{flexDirection:"row",flexWrap:"wrap",gap:t.space.ms},
 cardHeading:{flexDirection:"row",alignItems:"center",gap:t.space.sm},smallIcon:{padding:t.space.sm,borderRadius:t.radius.md,backgroundColor:t.color.neutralSoft},cardTitle:{flex:1,fontSize:t.font.small,fontWeight:"600",color:t.color.text},metric:{fontSize:t.font.heading,lineHeight:32,fontWeight:"700",color:t.color.heading,fontVariant:["tabular-nums"]},cardFoot:{flexDirection:"row",alignItems:"center",gap:t.space.xs,borderTopWidth:1,borderTopColor:t.color.borderSubtle,paddingTop:t.space.ms},caption:{fontSize:t.font.caption,lineHeight:18,color:t.color.muted},
 chartRow:{flexDirection:"row",alignItems:"center",gap:t.space.md},legend:{flex:1,minWidth:0,gap:t.space.xs},
});
