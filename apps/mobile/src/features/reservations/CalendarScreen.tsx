import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { KeadaanSlot, RoomAvailability } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button, Card, Chips, DateField, EmptyState, Icon, Input, Label, Notice, ProgressRing, Screen, StatusBadge, tokens as t } from "../../shared/ui";
import { dateWib, longDate, midnightWib, rangeLabel, shiftDay, shortDate, timeWib, toMinutes } from "../../shared/wib";
import { loadRooms } from "./api";
import { CALENDAR_MODES, SLOT_LABEL, SLOT_TONE, WEEKDAYS, calendarDates, dayAgenda, dayClosure, dayUsage, hourTicks, shiftCalendar, stripSegments } from "./model";
import type { CalendarMode, StripSegment } from "./model";

/** Isi pita per keadaan slot (CAL-UI-05): warna semantic, selalu didampingi legenda dan teks slot di bawahnya (UX-03). */
const SLOT_FILL: Readonly<Record<KeadaanSlot, string>> = { MENUNGGU_PERSETUJUAN: t.color.warning, DISETUJUI: t.color.info, JADWAL_TETAP: t.color.borderStrong, PEMELIHARAAN: t.color.error };
const LEGEND: readonly { label: string; fill: string }[] = [
    { label: "Kosong", fill: t.color.successSoft }, { label: SLOT_LABEL.MENUNGGU_PERSETUJUAN, fill: SLOT_FILL.MENUNGGU_PERSETUJUAN }, { label: SLOT_LABEL.DISETUJUI, fill: SLOT_FILL.DISETUJUI },
    { label: SLOT_LABEL.JADWAL_TETAP, fill: SLOT_FILL.JADWAL_TETAP }, { label: "Pemeliharaan / Libur", fill: SLOT_FILL.PEMELIHARAAN },
];
const MONTH = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", month: "long", year: "numeric" });
const STEP_LABEL: Readonly<Record<CalendarMode, readonly [string, string]>> = { HARIAN: ["Hari sebelumnya", "Hari berikutnya"], MINGGUAN: ["Minggu sebelumnya", "Minggu berikutnya"], BULANAN: ["Bulan sebelumnya", "Bulan berikutnya"] };
const jam = (iso: string) => timeWib(iso).replace(":", ".");

function Strip({ segments, closed, thin = false, label }: { segments: readonly StripSegment[]; closed: boolean; thin?: boolean; label: string }) {
    return <View accessible accessibilityLabel={label} style={[styles.strip, thin && styles.stripThin, closed && styles.stripClosed]}>
        {!closed && segments.map((s) => <View key={`${s.slot.mulai}${s.slot.keadaan}`} style={[styles.segment, { left: `${s.start * 100}%`, width: `${Math.max(s.width * 100, 1)}%`, backgroundColor: SLOT_FILL[s.slot.keadaan] }]}/>)}
    </View>;
}

function Ticks({ data }: { data: RoomAvailability }) {
    return <View style={styles.ticks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{hourTicks(data).map((tick) => <Text key={tick.label} style={[styles.tick, { left: `${tick.at * 100}%` }]}>{tick.label}</Text>)}</View>;
}

/** MS-44 — padanan P-27 sebagai daftar per ruangan/hari (CAL-UI-07), dengan pita waktu, legenda, dan tampilan Harian/Mingguan/Bulanan (CAL-UI-01). */
export function CalendarScreen() {
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const [mode, setMode] = useState<CalendarMode>("HARIAN");
    const [date, setDate] = useState(() => dateWib(Date.now()));
    const [capacity, setCapacity] = useState("");
    const min = Number(capacity) > 0 ? Number(capacity) : undefined;
    const permitted = Object.hasOwn(permissions, "reservation.view"), canCreate = Object.hasOwn(permissions, "reservation.create");
    const dates = calendarDates(mode, date), first = dates[0] ?? date, last = dates[dates.length - 1] ?? date;
    const resource = useResource(`${account}:rooms:${mode}:${first}:${min ?? ""}`, useCallback((signal: AbortSignal) => permitted ? loadRooms(api, midnightWib(first).toISOString(), midnightWib(shiftDay(last, 1)).toISOString(), signal, min) : Promise.resolve(null), [api, first, last, min, permitted]));
    if (!permitted) return <Screen title="Kalender Ruangan"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat reservasi."/></Screen>;
    const data = resource.data;
    const openDay = (d: string) => { setDate(d); setMode("HARIAN"); };
    const heading = mode === "HARIAN" ? longDate(date) : mode === "MINGGUAN" ? rangeLabel(first, last) : MONTH.format(midnightWib(date));
    const [prevLabel, nextLabel] = STEP_LABEL[mode];
    return <Screen title="Kalender Ruangan" subtitle="Ketersediaan ruangan dalam WIB. Ketuk hari pada tampilan Mingguan atau Bulanan untuk melihat jam-jamnya.">
        <Chips label="Tampilan" options={CALENDAR_MODES} value={mode} onChange={setMode}/>
        <View style={styles.dayBar}>
            <Pressable accessibilityRole="button" accessibilityLabel={prevLabel} onPress={() => setDate(shiftCalendar(mode, date, -1))} style={styles.nav}><Icon name="arrowLeft" color={t.color.iconDefault}/></Pressable>
            <View style={styles.flex}>{mode === "HARIAN" ? <DateField label="Tanggal" value={date} onChange={setDate}/> : <Text accessibilityRole="header" style={styles.heading}>{heading}</Text>}</View>
            <Pressable accessibilityRole="button" accessibilityLabel={nextLabel} onPress={() => setDate(shiftCalendar(mode, date, 1))} style={styles.nav}><Icon name="arrowRight" color={t.color.iconDefault}/></Pressable>
        </View>
        <View style={styles.legend}>{LEGEND.map((item) => <View key={item.label} style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: item.fill }]}/><Text style={styles.legendText}>{item.label}</Text></View>)}</View>
        <Input icon="users" label="Kapasitas minimum" value={capacity} onChangeText={(v) => setCapacity(v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="Semua kapasitas"/>
        {resource.loading && <Label tone="muted">Memuat ketersediaan…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {data && data.ruangan.length === 0 && <EmptyState illustration="empty" title="Tidak ada ruangan" description="Ubah kapasitas minimum untuk melihat ruangan lain."/>}
        {data && data.ruangan.length > 0 && (mode === "HARIAN" ? <DayView data={data} date={date} canCreate={canCreate}/> : mode === "MINGGUAN" ? <WeekView data={data} dates={dates} onOpen={openDay}/> : <MonthView data={data} dates={dates} month={date.slice(0, 7)} onOpen={openDay}/>)}
    </Screen>;
}

function DayView({ data, date, canCreate }: { data: RoomAvailability; date: string; canCreate: boolean }) {
    const closed = dayClosure(date, data);
    const operating = toMinutes(data.jam_operasional.selesai) - toMinutes(data.jam_operasional.mulai);
    return <>
        {closed && <Notice tone="info" message={closed}/>}
        {dayAgenda(data, date).map(({ room, slots, freeMinutes }) => <Card key={room.id}>
            <View style={styles.head}><ProgressRing value={closed ? 0 : freeMinutes} max={closed ? 1 : operating} label={`${room.nama}: ${closed ? "tutup" : `${Math.round(freeMinutes / 60)} jam kosong`}`}/><View style={styles.flex}><Text numberOfLines={1} style={styles.title}>{room.nama}</Text><Text numberOfLines={1} style={styles.meta}>{room.gedung.nama}{room.kapasitas !== null ? ` · ${room.kapasitas} orang` : ""}</Text></View></View>
            <View><Strip segments={stripSegments(data, room.id, date)} closed={closed !== null} label={`${room.nama}: ${closed ?? (slots.length === 0 ? "kosong sepanjang hari" : `${slots.length} slot terpakai`)}`}/><Ticks data={data}/></View>
            {slots.length === 0 ? !closed && <StatusBadge label={`Kosong ${data.jam_operasional.mulai.replace(":", ".")}–${data.jam_operasional.selesai.replace(":", ".")}`} tone="success"/> : slots.map((slot) => {
                const body = <><Text style={styles.time}>{jam(slot.mulai)}–{jam(slot.selesai)}</Text><View style={styles.flex}><StatusBadge label={SLOT_LABEL[slot.keadaan]} tone={SLOT_TONE[slot.keadaan]}/>{slot.label && <Text numberOfLines={1} style={styles.meta}>{slot.label}</Text>}</View></>;
                return slot.reservasi ? <Pressable key={`${slot.mulai}${slot.reservasi.id}`} accessibilityRole="button" accessibilityLabel={`${slot.reservasi.nomor}, ${SLOT_LABEL[slot.keadaan]}`} onPress={() => router.push(`/reservasi/${slot.reservasi!.id}` as "/scan")} style={styles.slot}>{body}<Icon name="chevronRight" color={t.color.muted}/></Pressable> : <View key={`${slot.mulai}${slot.keadaan}`} style={styles.slot}>{body}</View>;
            })}
            {canCreate && !closed && <Button icon="calendarCheck" title="Ajukan di ruangan ini" secondary compact onPress={() => router.push(`/reservasi/baru?mode=RUANGAN&ruangan=${room.id}&tanggal=${date}` as "/scan")}/>}
        </Card>)}
    </>;
}

function WeekView({ data, dates, onOpen }: { data: RoomAvailability; dates: readonly string[]; onOpen: (date: string) => void }) {
    return <>{data.ruangan.map((room) => <Card key={room.id}>
        <View style={styles.flex}><Text numberOfLines={1} style={styles.title}>{room.nama}</Text><Text numberOfLines={1} style={styles.meta}>{room.gedung.nama}{room.kapasitas !== null ? ` · ${room.kapasitas} orang` : ""}</Text></View>
        {dates.map((d) => {
            const closed = dayClosure(d, data), segments = stripSegments(data, room.id, d);
            return <Pressable key={d} accessibilityRole="button" accessibilityLabel={`${room.nama}, ${shortDate(d)}: ${closed ?? (segments.length === 0 ? "kosong" : `${segments.length} slot terpakai`)}`} onPress={() => onOpen(d)} style={styles.weekRow}>
                <Text style={styles.weekDay}>{shortDate(d).replace(/\s\w+\.?$/, "")}</Text>
                <View style={styles.flex}><Strip thin segments={segments} closed={closed !== null} label=""/></View>
            </Pressable>;
        })}
        <Ticks data={data}/>
    </Card>)}</>;
}

function MonthView({ data, dates, month, onOpen }: { data: RoomAvailability; dates: readonly string[]; month: string; onOpen: (date: string) => void }) {
    return <Card>
        <View style={styles.monthRow}>{WEEKDAYS.map(([n, label]) => <Text key={n} style={styles.monthHead}>{label}</Text>)}</View>
        {Array.from({ length: dates.length / 7 }, (_, w) => <View key={w} style={styles.monthRow}>{dates.slice(w * 7, w * 7 + 7).map((d) => {
            const usage = dayUsage(data, d), outside = !d.startsWith(month), pct = usage === null ? 0 : Math.round(usage * 100);
            return <Pressable key={d} accessibilityRole="button" accessibilityLabel={`${longDate(d)}: ${usage === null ? "sekolah tutup" : `${pct}% terpakai`}`} onPress={() => onOpen(d)} style={[styles.monthCell, usage === null && styles.monthClosed]}>
                <Text style={[styles.monthDate, outside && styles.monthOutside]}>{Number(d.slice(8))}</Text>
                <View style={styles.usageTrack}>{usage !== null && <View style={[styles.usageFill, { width: `${Math.max(pct, usage > 0 ? 8 : 0)}%` }]}/>}</View>
            </Pressable>;
        })}</View>)}
    </Card>;
}

const styles = StyleSheet.create({
    dayBar: { flexDirection: "row", alignItems: "flex-end", gap: t.space.xs }, nav: { width: t.size.touch, height: t.size.control, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0, gap: t.space.xs },
    heading: { minHeight: t.size.control, textAlignVertical: "center", textAlign: "center", fontSize: t.font.body, fontWeight: "600", color: t.color.heading, paddingTop: t.space.ms },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: t.space.ms }, legendItem: { flexDirection: "row", alignItems: "center", gap: t.space.xs }, swatch: { width: t.space.ms, height: t.space.ms, borderRadius: t.radius.sm, borderWidth: 1, borderColor: t.color.border }, legendText: { fontSize: t.font.caption, color: t.color.text },
    head: { flexDirection: "row", alignItems: "center", gap: t.space.ms }, title: { fontSize: t.font.body, fontWeight: "600", color: t.color.heading }, meta: { fontSize: t.font.small, color: t.color.muted },
    strip: { height: t.space.lg, borderRadius: t.radius.sm, backgroundColor: t.color.successSoft, overflow: "hidden", borderWidth: 1, borderColor: t.color.borderSubtle }, stripThin: { height: t.space.ms }, stripClosed: { backgroundColor: t.color.neutralSoft },
    segment: { position: "absolute", top: 0, bottom: 0 },
    ticks: { height: t.space.md, marginTop: t.space.xs }, tick: { position: "absolute", fontSize: t.font.caption, color: t.color.muted, transform: [{ translateX: -t.space.sm }] },
    weekRow: { minHeight: t.size.touch, flexDirection: "row", alignItems: "center", gap: t.space.ms },
    weekDay: { width: t.size.avatar, fontSize: t.font.small, fontWeight: "600", color: t.color.text },
    monthRow: { flexDirection: "row", gap: t.space.xs }, monthHead: { flex: 1, textAlign: "center", fontSize: t.font.caption, fontWeight: "600", color: t.color.muted },
    monthCell: { flex: 1, minHeight: t.size.touch, alignItems: "center", justifyContent: "center", gap: t.space.xs, borderRadius: t.radius.sm, paddingVertical: t.space.xs }, monthClosed: { backgroundColor: t.color.neutralSoft },
    monthDate: { fontSize: t.font.small, fontWeight: "600", color: t.color.heading }, monthOutside: { color: t.color.muted },
    usageTrack: { width: "80%", height: t.space.xs, borderRadius: t.radius.full, backgroundColor: t.color.track, overflow: "hidden" }, usageFill: { height: "100%", backgroundColor: t.color.primary },
    slot: { minHeight: t.size.touch, flexDirection: "row", alignItems: "center", gap: t.space.ms, paddingVertical: t.space.xs, borderTopWidth: 1, borderTopColor: t.color.borderSubtle }, time: { width: t.size.avatar * 2, fontSize: t.font.small, fontWeight: "600", color: t.color.heading },
});
