import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Label, Notice, tokens as t } from "../ui";
import type { ExportFormat } from "./format";

/** Tombol ekspor langsung (keputusan 24): unduh lalu simpan lewat lembar bagikan perangkat. */
export function ExportButtons({ formats, onExport, label = "Ekspor" }: { formats: readonly ExportFormat[]; onExport: (format: ExportFormat) => Promise<void>; label?: string }) {
    const [busy, setBusy] = useState<ExportFormat | null>(null), [error, setError] = useState<string | null>(null);
    const run = async (format: ExportFormat) => { setBusy(format); setError(null); try { await onExport(format); } catch (e) { setError(e instanceof Error ? e.message : "Berkas belum dapat diekspor."); } finally { setBusy(null); } };
    return <View style={styles.block}><View style={styles.row}>{formats.map((f) => <View key={f} style={styles.flex}><Button icon="fileText" title={`${label} ${f.toUpperCase()}`} compact secondary busy={busy === f} disabled={busy !== null} onPress={() => void run(f)}/></View>)}</View>
        <Label tone="muted">Berkas disimpan lewat lembar bagikan perangkat.</Label>{error && <Notice message={error}/>}</View>;
}
const styles = StyleSheet.create({ block: { gap: t.space.xs }, row: { flexDirection: "row", gap: t.space.sm }, flex: { flex: 1 } });
