import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button, Card, DateField, EmptyState, Icon, Input, Label, Notice, ProgressRing, Screen, StatusBadge, tokens as t } from "../../shared/ui";
import { dateWib, midnightWib, shiftDay, timeWib, toMinutes } from "../../shared/wib";
import { loadRooms } from "./api";
import { SLOT_LABEL, SLOT_TONE, dayAgenda, dayClosure } from "./model";

/** MS-44 — padanan P-27 dalam tampilan daftar per hari (CAL-UI-07): ruangan dan slot terpakainya. */
export function CalendarScreen() {
    const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const [date, setDate] = useState(dateWib(Date.now())), [capacity, setCapacity] = useState("");
    const min = Number(capacity) > 0 ? Number(capacity) : undefined;
    const permitted = Object.hasOwn(permissions, "reservation.view"), canCreate = Object.hasOwn(permissions, "reservation.create");
    const resource = useResource(`${account}:rooms:${date}:${min ?? ""}`, useCallback((signal: AbortSignal) => permitted ? loadRooms(api, midnightWib(date).toISOString(), midnightWib(shiftDay(date, 1)).toISOString(), signal, min) : Promise.resolve(null), [api, date, min, permitted]));
    if (!permitted) return <Screen title="Kalender Ruangan"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat reservasi."/></Screen>;
    const data = resource.data, closed = data ? dayClosure(date, data) : null;
    const operating = data ? toMinutes(data.jam_operasional.selesai) - toMinutes(data.jam_operasional.mulai) : 0;
    return <Screen title="Kalender Ruangan" subtitle="Ketersediaan ruangan per hari dalam WIB. Ketuk Ajukan untuk memesan ruangan pada tanggal ini.">
        <View style={styles.dayBar}><Pressable accessibilityRole="button" accessibilityLabel="Hari sebelumnya" onPress={() => setDate(shiftDay(date, -1))} style={styles.nav}><Icon name="arrowLeft" color={t.color.iconDefault}/></Pressable><View style={styles.flex}><DateField label="Tanggal" value={date} onChange={setDate}/></View><Pressable accessibilityRole="button" accessibilityLabel="Hari berikutnya" onPress={() => setDate(shiftDay(date, 1))} style={styles.nav}><Icon name="arrowRight" color={t.color.iconDefault}/></Pressable></View>
        <Input icon="users" label="Kapasitas minimum" value={capacity} onChangeText={(v) => setCapacity(v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="Semua kapasitas"/>
        {resource.loading && <Label tone="muted">Memuat ketersediaan…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {closed && <Notice tone="info" message={closed}/>}
        {data && data.ruangan.length === 0 && <EmptyState illustration="empty" title="Tidak ada ruangan" description="Ubah kapasitas minimum untuk melihat ruangan lain."/>}
        {data && dayAgenda(data, date).map(({ room, slots, freeMinutes }) => <Card key={room.id}>
            <View style={styles.head}><ProgressRing value={closed ? 0 : freeMinutes} max={closed ? 1 : operating} label={`${room.nama}: ${closed ? "tutup" : `${Math.round(freeMinutes / 60)} jam kosong`}`}/><View style={styles.flex}><Text numberOfLines={1} style={styles.title}>{room.nama}</Text><Text numberOfLines={1} style={styles.meta}>{room.gedung.nama}{room.kapasitas !== null ? ` · ${room.kapasitas} orang` : ""}</Text></View></View>
            {slots.length === 0 ? !closed && <StatusBadge label={`Kosong ${data.jam_operasional.mulai.replace(":", ".")}–${data.jam_operasional.selesai.replace(":", ".")}`} tone="success"/> : slots.map((slot) => {
                const body = <><Text style={styles.time}>{timeWib(slot.mulai).replace(":", ".")}–{timeWib(slot.selesai).replace(":", ".")}</Text><View style={styles.flex}><StatusBadge label={SLOT_LABEL[slot.keadaan]} tone={SLOT_TONE[slot.keadaan]}/>{slot.label && <Text numberOfLines={1} style={styles.meta}>{slot.label}</Text>}</View></>;
                return slot.reservasi ? <Pressable key={`${slot.mulai}${slot.reservasi.id}`} accessibilityRole="button" accessibilityLabel={`${slot.reservasi.nomor}, ${SLOT_LABEL[slot.keadaan]}`} onPress={() => router.push(`/reservasi/${slot.reservasi!.id}` as "/scan")} style={styles.slot}>{body}<Icon name="chevronRight" color={t.color.muted}/></Pressable> : <View key={`${slot.mulai}${slot.keadaan}`} style={styles.slot}>{body}</View>;
            })}
            {canCreate && !closed && <Button icon="calendarCheck" title="Ajukan di ruangan ini" secondary compact onPress={() => router.push(`/reservasi/baru?mode=RUANGAN&ruangan=${room.id}&tanggal=${date}` as "/scan")}/>}
        </Card>)}
    </Screen>;
}
const styles = StyleSheet.create({
    dayBar: { flexDirection: "row", alignItems: "flex-end", gap: t.space.xs }, nav: { width: t.size.touch, height: t.size.control, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0, gap: t.space.xs },
    head: { flexDirection: "row", alignItems: "center", gap: t.space.ms }, title: { fontSize: t.font.body, fontWeight: "600", color: t.color.heading }, meta: { fontSize: t.font.small, color: t.color.muted },
    slot: { minHeight: t.size.touch, flexDirection: "row", alignItems: "center", gap: t.space.ms, paddingVertical: t.space.xs, borderTopWidth: 1, borderTopColor: t.color.borderSubtle }, time: { width: t.size.avatar * 2, fontSize: t.font.small, fontWeight: "600", color: t.color.heading, fontVariant: ["tabular-nums"] },
});
