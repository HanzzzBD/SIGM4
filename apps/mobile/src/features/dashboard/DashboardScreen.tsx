import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DashboardCardResponseSchema, DashboardManifestResponseSchema } from "@sigm4/schemas";
import type { DashboardCard, DashboardPeriod } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Badge, Button, Card, EmptyState, Icon, Label, Notice, Screen, SectionHeading, tokens as t } from "../../shared/ui";
import type { IconName } from "../../shared/ui";
import { cardLines, quickActions, visibleCards } from "./model";

function CardView({ card, period, refreshKey }: { card: DashboardCard; period: DashboardPeriod; refreshKey: number }) {
    const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const lastRefresh = useRef(0);
    const load = useCallback(async (signal: AbortSignal) => { const fresh = lastRefresh.current !== refreshKey; lastRefresh.current = refreshKey; return DashboardCardResponseSchema.parse((await api.get(`/dashboard/cards/${card.id}`, { params: { rentang: period, segarkan: fresh ? "true" : "false" }, signal })).data).data; }, [api, card.id, period, refreshKey]);
    const resource = useResource(`${account}:${card.id}:${period}`, load);
    const data = resource.data;
    if (card.id === "efek-tertunda-gagal" && data && typeof data.isi === "object" && data.isi !== null && (data.isi as { jumlah?: number }).jumlah === 0) return null;
    const lines = data ? cardLines(card.id, data.isi) : [];
    const icon: IconName = /aset/.test(card.id) ? "box" : /pengajuan|persetujuan/.test(card.id) ? "tasks" : /kondisi|kerusakan/.test(card.id) ? "wrench" : /pengguna|role/.test(card.id) ? "user" : "chart";
    return <Card><View style={styles.cardHeading}><View style={styles.smallIcon}><Icon name={icon} color={t.color.primary}/></View><Text style={styles.cardTitle}>{card.judul}</Text></View>
        {resource.loading && <Label tone="muted">Memuat ringkasan...</Label>}{resource.error && <><Notice message={resource.error}/><Button title="Coba lagi" icon="refresh" secondary onPress={resource.reload}/></>}
        {data && <><Text style={styles.metric}>{lines[0]}</Text>{lines.slice(1).map((line, index) => <Label tone="muted" key={index}>{line}</Label>)}<View style={styles.cardFoot}><Icon name="clock" size={t.size.iconSmall} color={t.color.muted}/><Text style={styles.caption}>{formatTime(data.diperbarui_pada)}</Text></View></>}
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
    const actionIcons: Record<string, IconName> = { "asset.view": "scan", "material.view": "scan", "approval.decide": "tasks", "reservation.create": "calendar", "damage.create": "wrench", "chat.use": "chat" };
    return <Screen title="Beranda" icon="home" subtitle="Pantau fasilitas dan lanjutkan pekerjaan Anda." action={canView ? <Button title={periods.find(([value]) => value === period)![1]} icon="calendar" compact secondary onPress={() => setPeriodMenu(value => !value)}/> : undefined}>
        <View style={styles.welcome}><View style={styles.welcomeText}><Text style={styles.caption}>Selamat datang kembali,</Text><Text style={styles.welcomeName}>{name}</Text></View><View style={styles.avatar}><Text style={styles.initials}>{name.split(" ").slice(0,2).map(part => part[0]).join("").toUpperCase()}</Text></View></View>
        {periodMenu && <Card><SectionHeading title="Rentang ringkasan"/>{periods.map(([value, label]) => <Button key={value} title={label} icon={period === value ? "check" : "calendar"} secondary onPress={() => { setPeriod(value); setPeriodMenu(false); }}/>)}</Card>}
        {cards.filter(card => card.zona === 1).map(card => <CardView key={card.id} card={card} period={period} refreshKey={refreshKey}/>)}
        <SectionHeading title="Aksi cepat" description="Fitur yang tersedia untuk peran Anda"/>
        <View style={styles.actions}>{actions.map(action => <Pressable key={action.permission} accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{disabled:action.path === null}} disabled={action.path === null} onPress={() => { if (action.path) router.push(action.path as "/scan"); }} style={({pressed}) => [styles.action, pressed && styles.actionPressed, action.path === null && styles.unavailable]}><View style={styles.actionIcon}><Icon name={actionIcons[action.permission] ?? "arrowRight"} color={t.color.primary} size={t.size.iconLarge}/></View><Text style={styles.actionLabel}>{action.label === "Chatbot" ? "Tanya SIGM4" : action.label}</Text>{action.path === null && <Text style={styles.caption}>Tersedia di web</Text>}</Pressable>)}</View>
        {!canView && <EmptyState title="Fitur Anda siap digunakan" icon="shield" description="Pilih aksi cepat atau buka tab Tugas untuk memulai."/>}
        {canView && <><SectionHeading title="Ringkasan operasional" action={<Button title="Segarkan" icon="refresh" compact secondary onPress={() => { setRefreshKey(value => value + 1); resource.reload(); }}/>}/>
        {resource.loading && <Label tone="muted">Memuat dashboard...</Label>}{resource.error && <><Notice message={resource.error}/><Button title="Coba lagi" icon="refresh" onPress={resource.reload}/></>}
        {resource.data && cards.length === 0 && <EmptyState title="Belum ada ringkasan" description="Antrean pekerjaan yang tersedia dapat dilihat di tab Tugas."/>}
        {[2,4].map(zone => cards.filter(card => card.zona === zone).map(card => <CardView key={card.id} card={card} period={period} refreshKey={refreshKey}/>))}
        {cards.some(card => card.zona === 3) && <><Button title={trends ? "Tutup tren aktivitas" : "Lihat tren aktivitas"} icon="chart" secondary onPress={() => setTrends(value => !value)}/>{trends && cards.filter(card => card.zona === 3).map(card => <CardView key={card.id} card={card} period={period} refreshKey={refreshKey}/>)}</>}
        <Badge label="Data mengikuti hak akses akun" tone="neutral"/></>}
    </Screen>;
}
const styles = StyleSheet.create({
 welcome: {flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:t.space.md,paddingVertical:t.space.sm}, welcomeText:{flex:1,gap:t.space.xs},welcomeName:{fontSize:t.font.heading,fontWeight:"600",color:t.color.heading},avatar:{height:t.size.avatar,width:t.size.avatar,borderRadius:t.radius.full,backgroundColor:t.color.primarySoft,alignItems:"center",justifyContent:"center"},initials:{color:t.color.primary,fontSize:t.font.title,fontWeight:"600"},
 actions:{flexDirection:"row",flexWrap:"wrap",gap:t.space.ms},action:{flexBasis:"45%",flexGrow:1,minHeight:t.size.control*2,padding:t.space.md,backgroundColor:t.color.surface,borderWidth:1,borderColor:t.color.border,borderRadius:t.radius.lg,gap:t.space.ms},actionPressed:{backgroundColor:t.color.primarySoft,borderColor:t.color.primaryBorder},unavailable:{opacity:.5},actionIcon:{width:t.size.touch,height:t.size.touch,backgroundColor:t.color.primarySoft,borderRadius:t.radius.md,justifyContent:"center",alignItems:"center"},actionLabel:{fontSize:t.font.small,fontWeight:"600",color:t.color.heading},
 cardHeading:{flexDirection:"row",alignItems:"center",gap:t.space.sm},smallIcon:{padding:t.space.sm,borderRadius:t.radius.md,backgroundColor:t.color.primarySoft},cardTitle:{flex:1,fontSize:t.font.small,fontWeight:"600",color:t.color.text},metric:{fontSize:t.font.heading,lineHeight:32,fontWeight:"700",color:t.color.heading,fontVariant:["tabular-nums"]},cardFoot:{flexDirection:"row",alignItems:"center",gap:t.space.xs,borderTopWidth:1,borderTopColor:t.color.border,paddingTop:t.space.ms},caption:{fontSize:t.font.caption,lineHeight:18,color:t.color.muted},
});
