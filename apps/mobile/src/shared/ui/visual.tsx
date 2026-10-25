// Komponen mobile visual-first C-31…C-35, C-37, C-38 (COMPONENTS.md; DSD-11, DSD-12, MOB-SCP-04).
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { tokens as t } from "./tokens";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { CountBadge } from "./Header";
import { GROUP_ACCENT, cardMeta, chartSeries, initials, ringColor, ringProgress, ringText, stepLabels, tileIconColor } from "./model";
import type { DomainGroup } from "./model";

/** C-31 — kotak ikon berisi accent grup; label wajib; entri ↗ web untuk MOB-SCP-02/03. */
export function ModuleTile({ label, icon, group, badge = 0, web = false, onPress }: { label: string; icon: IconName; group: DomainGroup; badge?: number; web?: boolean; onPress: () => void }) {
    return <Pressable accessibilityRole="button" accessibilityLabel={web ? `${label}, dibuka di web` : label} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
        <View style={[styles.tileIcon, { backgroundColor: GROUP_ACCENT[group] }]}><Icon name={icon} color={tileIconColor(group)}/></View>
        <Text numberOfLines={2} style={styles.tileLabel}>{label}</Text>
        {web && <View style={styles.webMark}><Icon name="externalLink" size={t.size.iconSmall} color={t.color.muted}/><Text style={styles.webText}>Web</Text></View>}
        <CountBadge count={badge} style={styles.tileBadge}/>
    </Pressable>;
}

import type { StatusTone } from "./status";
export type { StatusTone };
const STATUS: Readonly<Record<StatusTone, { icon: IconName; color: string; soft: string }>> = {
    // Ikon status wajib FOUNDATIONS §8 — status tidak pernah hanya warna (UX-03).
    success: { icon: "checkCircle", color: t.color.success, soft: t.color.successSoft }, warning: { icon: "alert", color: t.color.warning, soft: t.color.warningSoft },
    error: { icon: "circleX", color: t.color.error, soft: t.color.errorSoft }, info: { icon: "info", color: t.color.info, soft: t.color.infoSoft }, pending: { icon: "circleDashed", color: t.color.muted, soft: t.color.neutralSoft },
};
export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
    const s = STATUS[tone];
    return <View style={[styles.status, { backgroundColor: s.soft }]}><Icon name={s.icon} size={t.size.iconSmall} color={s.color}/><Text style={[styles.statusText, { color: s.color }]}>{label}</Text></View>;
}

/** C-32 — satu objek daftar: media · judul · ≤2 meta · ≤2 status · angka opsional. */
export function EntityCard({ title, meta = [], statuses = [], value, photo, icon, onPress }: { title: string; meta?: readonly (string | null | undefined)[]; statuses?: readonly { label: string; tone: StatusTone }[]; value?: string; photo?: string | null; icon?: IconName; onPress?: () => void }) {
    const line = cardMeta(meta);
    const body = <>
        <View style={styles.media}>{photo ? <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" accessible={false}/> : icon ? <Icon name={icon} color={t.color.iconDefault}/> : <Text style={styles.initials}>{initials(title)}</Text>}</View>
        <View style={styles.cardText}><Text numberOfLines={1} style={styles.cardTitle}>{title}</Text>{line !== "" && <Text numberOfLines={1} style={styles.cardMeta}>{line}</Text>}{statuses.length > 0 && <View style={styles.statusRow}>{statuses.slice(0, 2).map((s) => <StatusBadge key={s.label} {...s}/>)}</View>}</View>
        {value !== undefined && <Text style={styles.value}>{value}</Text>}{onPress && <Icon name="chevronRight" color={t.color.muted}/>}
    </>;
    return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={[title, line, ...statuses.slice(0, 2).map((s) => s.label), value].filter(Boolean).join(", ")} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>{body}</Pressable> : <View style={styles.card}>{body}</View>;
}

/** C-33 — SVG sendiri (DSD-10); tanpa sumbu; ringkasan satu kalimat sebagai label. */
export function MiniChart({ kind, values, summary, height = t.size.chart }: { kind: "bar" | "line" | "donut"; values: readonly number[]; summary: string; height?: number }) {
    const width = height * 3; const series = kind === "line" ? values.map((value) => ({ value: Number.isFinite(value) ? Math.max(0, value) : 0, color: t.color.accent.blue })) : chartSeries(values);
    const max = Math.max(1, ...series.map((s) => s.value)); const total = series.reduce((sum, s) => sum + s.value, 0);
    let shape: ReactNode;
    if (kind === "bar") { const w = width / Math.max(1, series.length); shape = series.map((s, i) => { const h = (s.value / max) * height; return <Rect key={i} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={h} rx={t.radius.sm} fill={s.color}/>; }); }
    else if (kind === "line") { const step = width / Math.max(1, series.length - 1); shape = <Path d={series.map((s, i) => `${i ? "L" : "M"}${i * step} ${height - (s.value / max) * (height - 4) - 2}`).join("")} stroke={t.color.accent.blue} strokeWidth={2} fill="none"/>; }
    else { const r = height / 2 - 6, c = 2 * Math.PI * r; let used = 0; shape = total === 0 ? <Circle cx={height / 2} cy={height / 2} r={r} stroke={t.color.track} strokeWidth={8} fill="none"/> : series.map((s, i) => { const len = (s.value / total) * c; const el = <Circle key={i} cx={height / 2} cy={height / 2} r={r} stroke={s.color} strokeWidth={8} fill="none" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-used} transform={`rotate(-90 ${height / 2} ${height / 2})`}/>; used += len; return el; }); }
    return <View accessible accessibilityRole="image" accessibilityLabel={summary}><Svg width={kind === "donut" ? height : width} height={height}>{shape}</Svg></View>;
}

/** C-34 — kemajuan target; warna status hanya bila maknanya status. */
export function ProgressRing({ value, max, large = false, tone = "default", format = "percent", label }: { value: number; max: number; large?: boolean; tone?: "default" | "warning" | "error"; format?: "percent" | "fraction"; label: string }) {
    const size = large ? t.size.ringLarge : t.size.ring, stroke = large ? 8 : 4, r = (size - stroke) / 2, c = 2 * Math.PI * r, p = ringProgress(value, max);
    return <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: Math.max(0, max), now: Math.max(0, Math.min(value, max)) }} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}><Circle cx={size / 2} cy={size / 2} r={r} stroke={t.color.track} strokeWidth={stroke} fill="none"/><Circle cx={size / 2} cy={size / 2} r={r} stroke={ringColor(tone)} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}/></Svg>
        <Text style={[styles.ringText, large && styles.ringLarge]}>{ringText(value, max, format)}</Text>
    </View>;
}

/** C-35 — langkah aktif teal, selesai centang, belum netral; langkah terakhir selalu Tinjau (UXD-04). */
export function Stepper({ steps, active, wide = false }: { steps: readonly string[]; active: number; wide?: boolean }) {
    const labels = stepLabels(steps, active, wide);
    return <View accessibilityRole="progressbar" accessibilityLabel={`Langkah ${active + 1} dari ${steps.length}: ${steps[active] ?? ""}`} style={styles.stepper}>
        <View style={styles.steps}>{steps.map((_, i) => <View key={i} style={styles.stepCell}>
            {i > 0 && <View style={[styles.stepLine, i <= active && styles.stepLineDone]}/>}
            <View style={[styles.dot, i === active && styles.dotActive, i < active && styles.dotDone]}>{i < active ? <Icon name="check" size={t.size.iconSmall} color={t.color.success}/> : <Text style={[styles.dotText, i === active && styles.dotTextActive]}>{i + 1}</Text>}</View>
        </View>)}</View>
        <View style={styles.steps}>{labels.map((label, i) => <Text key={i} numberOfLines={1} style={[styles.stepLabel, !wide && styles.stepLabelPhone]}>{label ?? ""}</Text>)}</View>
    </View>;
}

/** C-37 — ilustrasi datar netral + satu bidang accent; dekoratif, maknanya di judul C-21. */
export function StateIllustration({ kind, group = "SISTEM" }: { kind: "empty" | "error" | "noAccess" | "offline" | "success"; group?: DomainGroup }) {
    const s = t.size.illustration, mark: Record<typeof kind, string> = { empty: "M44 62h32M44 72h20", error: "M50 56l20 20M70 56 50 76", noAccess: "M50 64h20v16H50zM54 64v-6a6 6 0 0 1 12 0v6", offline: "M42 60a26 26 0 0 1 36 0M48 68a16 16 0 0 1 24 0M58 76h4", success: "m48 66 8 8 16-16" };
    return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignSelf: "center" }}><Svg width={s} height={s} viewBox="0 0 120 120">
        <Circle cx="60" cy="64" r="44" fill={t.color.neutralSoft}/><Rect x="30" y="34" width="60" height="62" rx="8" fill={t.color.surface} stroke={t.color.pending} strokeWidth={1.5}/>
        <Rect x="30" y="34" width="60" height="12" rx="6" fill={GROUP_ACCENT[group]}/><Path d={mark[kind]} stroke={t.color.iconDefault} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </Svg></View>;
}

/** C-38 — membuka chatbot dari layar mana pun (UXD-22). */
export function ChatFab({ onPress, bottom }: { onPress: () => void; bottom: number }) {
    return <Pressable accessibilityRole="button" accessibilityLabel="Tanya asisten SIGM4" onPress={onPress} style={({ pressed }) => [styles.fab, { bottom }, pressed && styles.fabPressed]}><Icon name="messageCircle" size={t.size.iconLarge} color={t.color.iconInverse}/></Pressable>;
}

const styles = StyleSheet.create({
    pressed: { backgroundColor: t.color.primarySoft },
    tile: { flexBasis: "30%", flexGrow: 1, maxWidth: "33%", minHeight: t.size.control * 2, padding: t.space.ms, gap: t.space.sm, backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.borderSubtle, borderRadius: t.radius.lg },
    tileIcon: { width: t.size.tileIcon, height: t.size.tileIcon, borderRadius: t.radius.md, alignItems: "center", justifyContent: "center" },
    tileLabel: { fontSize: t.font.small, fontWeight: "500", color: t.color.heading }, tileBadge: { position: "absolute", top: t.space.sm, right: t.space.sm },
    webMark: { flexDirection: "row", alignItems: "center", gap: t.space.xs }, webText: { fontSize: t.font.caption, color: t.color.muted },
    status: { flexDirection: "row", alignItems: "center", gap: t.space.xs, borderRadius: t.radius.full, paddingHorizontal: t.space.sm, paddingVertical: t.space.xs / 2 }, statusText: { fontSize: t.font.caption, fontWeight: "600" },
    card: { minHeight: t.size.rowMobile, flexDirection: "row", alignItems: "center", gap: t.space.ms, padding: t.space.ms, backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.borderSubtle, borderRadius: t.radius.lg },
    media: { width: t.size.media, height: t.size.media, borderRadius: t.radius.md, backgroundColor: t.color.neutralSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }, photo: { width: t.size.media, height: t.size.media },
    initials: { fontSize: t.font.title, fontWeight: "600", color: t.color.text }, cardText: { flex: 1, minWidth: 0, gap: t.space.xs },
    cardTitle: { fontSize: t.font.body, fontWeight: "600", color: t.color.heading }, cardMeta: { fontSize: t.font.small, color: t.color.muted }, statusRow: { flexDirection: "row", flexWrap: "wrap", gap: t.space.xs },
    value: { fontSize: t.font.title, fontWeight: "700", color: t.color.heading, fontVariant: ["tabular-nums"] },
    ringText: { fontSize: t.font.caption, fontWeight: "700", color: t.color.heading, fontVariant: ["tabular-nums"] }, ringLarge: { fontSize: t.font.heading },
    stepper: { gap: t.space.xs }, steps: { flexDirection: "row" }, stepCell: { flex: 1, alignItems: "center", justifyContent: "center" },
    stepLine: { position: "absolute", left: "-50%", right: "50%", top: "50%", height: t.space.xs / 2, backgroundColor: t.color.pending }, stepLineDone: { backgroundColor: t.color.success },
    dot: { width: t.size.iconLarge + t.space.xs, height: t.size.iconLarge + t.space.xs, borderRadius: t.radius.full, borderWidth: 2, borderColor: t.color.pending, backgroundColor: t.color.surface, alignItems: "center", justifyContent: "center" },
    dotActive: { borderColor: t.color.primary, backgroundColor: t.color.primary }, dotDone: { borderColor: t.color.success },
    dotText: { fontSize: t.font.caption, fontWeight: "700", color: t.color.muted }, dotTextActive: { color: t.color.inverse },
    stepLabel: { flex: 1, textAlign: "center", fontSize: t.font.caption, color: t.color.text }, stepLabelPhone: { fontWeight: "600", color: t.color.heading },
    fab: { position: "absolute", right: t.space.md, width: t.size.fab, height: t.size.fab, borderRadius: t.radius.full, backgroundColor: t.color.primary, alignItems: "center", justifyContent: "center", ...t.elevation.floating }, fabPressed: { backgroundColor: t.color.primaryPressed },
});
