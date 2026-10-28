// Kontrol isian ponsel yang dirakit dari komponen yang ada (C-36, tombol, chip) — tanpa pustaka pemilih asli.
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { tokens as t } from "./tokens";
import { Icon } from "./Icon";
import { BottomSheet } from "./BottomSheet";
import { isoWeekday, longDate, monthDates, shiftMonth } from "../wib";

/** Pilihan tunggal berbentuk chip; terpilih teal, ikon centang (status tidak hanya warna, UX-03). */
export function Chips<T extends string>({ label, options, value, onChange, disabled = false }: { label: string; options: readonly { value: T; label: string }[]; value: T | null; onChange: (value: T) => void; disabled?: boolean }) {
    return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => { const on = option.value === value; return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: on, disabled }} disabled={disabled} onPress={() => onChange(option.value)} style={[styles.chip, on && styles.chipOn, disabled && styles.disabled]}>{on && <Icon name="check" size={t.size.iconSmall} color={t.color.inverse}/>}<Text style={[styles.chipText, on && styles.chipTextOn]}>{option.label}</Text></Pressable>; })}
    </View></View>;
}

/** Pilihan ganda berbentuk chip (mis. hari pengulangan, unit manual). */
export function MultiChips<T extends string | number>({ label, options, value, onChange, disabled = false }: { label: string; options: readonly { value: T; label: string }[]; value: readonly T[]; onChange: (value: T[]) => void; disabled?: boolean }) {
    return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.wrap} accessibilityLabel={label}>
        {options.map((option) => { const on = value.includes(option.value); return <Pressable key={String(option.value)} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={() => onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])} style={[styles.chip, on && styles.chipOn, disabled && styles.disabled]}>{on && <Icon name="check" size={t.size.iconSmall} color={t.color.inverse}/>}<Text style={[styles.chipText, on && styles.chipTextOn]}>{option.label}</Text></Pressable>; })}
    </View></View>;
}

export function Toggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
    return <View style={styles.toggle}><Text style={styles.toggleText}>{label}</Text><Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: t.color.pending, true: t.color.primary }} thumbColor={t.color.surface}/></View>;
}

/** Tanggal WIB `YYYY-MM-DD` dipilih dari kalender bulan di C-36; `min` membatasi tanggal awal. */
export function DateField({ label, value, onChange, min, disabled = false }: { label: string; value: string; onChange: (value: string) => void; min?: string; disabled?: boolean }) {
    const [open, setOpen] = useState(false), [month, setMonth] = useState((value || min || "2026-01-01").slice(0, 7));
    const days = monthDates(month), lead = days[0] ? isoWeekday(days[0]) - 1 : 0;
    return <View style={styles.field}><Text style={styles.label}>{label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? longDate(value) : "belum dipilih"}`} disabled={disabled} onPress={() => { setMonth((value || min || month).slice(0, 7)); setOpen(true); }} style={[styles.input, disabled && styles.disabled]}><Icon name="calendar" color={t.color.iconDefault}/><Text style={styles.inputText}>{value ? longDate(value) : "Pilih tanggal"}</Text></Pressable>
        <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}><View style={styles.sheet}>
            <View style={styles.monthBar}><Pressable accessibilityRole="button" accessibilityLabel="Bulan sebelumnya" onPress={() => setMonth(shiftMonth(month, -1))} style={styles.nav}><Icon name="arrowLeft" color={t.color.iconDefault}/></Pressable><Text style={styles.month}>{new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00Z`))}</Text><Pressable accessibilityRole="button" accessibilityLabel="Bulan berikutnya" onPress={() => setMonth(shiftMonth(month, 1))} style={styles.nav}><Icon name="arrowRight" color={t.color.iconDefault}/></Pressable></View>
            <View style={styles.grid}>{["S", "S", "R", "K", "J", "S", "M"].map((d, i) => <Text key={i} style={styles.weekday}>{d}</Text>)}{Array.from({ length: lead }, (_, i) => <View key={`k${i}`} style={styles.day}/>)}
                {days.map((day) => { const off = min !== undefined && day < min, on = day === value; return <Pressable key={day} accessibilityRole="button" accessibilityLabel={longDate(day)} accessibilityState={{ selected: on, disabled: off }} disabled={off} onPress={() => { onChange(day); setOpen(false); }} style={[styles.day, on && styles.dayOn, off && styles.disabled]}><Text style={[styles.dayText, on && styles.chipTextOn]}>{Number(day.slice(8))}</Text></Pressable>; })}</View>
        </View></BottomSheet>
    </View>;
}

const styles = StyleSheet.create({
    field: { gap: t.space.sm }, label: { fontSize: t.font.small, fontWeight: "600", color: t.color.heading }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
    chip: { minHeight: t.size.touch, flexDirection: "row", alignItems: "center", gap: t.space.xs, paddingHorizontal: t.space.ms, borderRadius: t.radius.full, borderWidth: 1, borderColor: t.color.borderStrong, backgroundColor: t.color.surface },
    chipOn: { backgroundColor: t.color.primary, borderColor: t.color.primary }, chipText: { fontSize: t.font.small, color: t.color.heading }, chipTextOn: { color: t.color.inverse, fontWeight: "600" }, disabled: { opacity: 0.45 },
    toggle: { minHeight: t.size.touch, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm }, toggleText: { flex: 1, fontSize: t.font.body, color: t.color.heading },
    input: { minHeight: t.size.control, flexDirection: "row", alignItems: "center", gap: t.space.sm, paddingHorizontal: t.space.ms, borderWidth: 1, borderColor: t.color.borderStrong, borderRadius: t.radius.md, backgroundColor: t.color.surface }, inputText: { flex: 1, fontSize: t.font.body, color: t.color.heading },
    sheet: { padding: t.space.md, gap: t.space.sm }, monthBar: { flexDirection: "row", alignItems: "center" }, month: { flex: 1, textAlign: "center", fontSize: t.font.body, fontWeight: "600", color: t.color.heading },
    nav: { width: t.size.touch, height: t.size.touch, alignItems: "center", justifyContent: "center" }, grid: { flexDirection: "row", flexWrap: "wrap" },
    weekday: { width: "14.28%", textAlign: "center", fontSize: t.font.caption, color: t.color.muted, paddingVertical: t.space.xs },
    day: { width: "14.28%", height: t.size.touch, alignItems: "center", justifyContent: "center", borderRadius: t.radius.full }, dayOn: { backgroundColor: t.color.primary }, dayText: { fontSize: t.font.body, color: t.color.heading },
});
