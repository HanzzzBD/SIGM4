// Lampiran daring: kamera, galeri, atau berkas ponsel (keputusan 21 log phase-07). Status pemindaian AV ditampilkan;
// berkas PENDING dapat diperiksa ulang lewat konfirmasi idempoten (SDD-FS-03).
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { AxiosInstance } from "axios";
import { Button, EntityCard, Label, Notice, tokens as t } from "../ui";
import { pickAndUploadDocument, recheckDocument } from "./document";
import type { DocumentKind, UploadedDocument } from "./document";
import { pickAndUploadPhoto } from "./photo";
import type { PhotoKind } from "./photo";

export type Attached = Pick<UploadedDocument, "file_id" | "nama_berkas" | "scan_status"> & { checksum?: string | undefined };
export const scanLabel = (s: string) => s === "CLEAN" ? "Terverifikasi" : s === "PENDING" ? "Sedang diperiksa" : "Tidak dapat dipakai";
export const scanTone = (s: string) => s === "CLEAN" ? "success" as const : s === "PENDING" ? "pending" as const : "error" as const;

/** `documents` hanya untuk jenis yang juga menerima PDF/DOCX/XLSX; foto penolakan/pelaksanaan cukup kamera/galeri. */
export function AttachmentField({ api, label, help, kind, files, onChange, max, documents = true, disabled = false }: { api: AxiosInstance; label: string; help?: string; kind: PhotoKind; files: readonly Attached[]; onChange: (files: Attached[]) => void; max: number; documents?: boolean; disabled?: boolean }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const run = async (pick: () => Promise<UploadedDocument | null>) => { setBusy(true); setError(null); try { const f = await pick(); if (f) onChange([...files, f]); } catch (e) { setError(e instanceof Error ? e.message : "Lampiran belum terunggah."); } finally { setBusy(false); } };
    const recheck = async () => { setBusy(true); setError(null); try { const next: Attached[] = []; for (const f of files) next.push(f.scan_status === "PENDING" && f.checksum ? { ...f, scan_status: await recheckDocument(api, { file_id: f.file_id, checksum: f.checksum }) } : f); onChange(next); } catch (e) { setError(e instanceof Error ? e.message : "Status lampiran belum diperiksa."); } finally { setBusy(false); } };
    const off = disabled || busy || files.length >= max;
    return <View style={styles.block}><Label strong>{label}</Label>{help && <Label tone="muted">{help}</Label>}
        {files.map((f) => <View key={f.file_id} style={styles.row}><View style={styles.flex}><EntityCard icon="fileText" title={f.nama_berkas} statuses={[{ label: scanLabel(f.scan_status), tone: scanTone(f.scan_status) }]}/></View><Button icon="close" title="Lepas" compact secondary disabled={disabled || busy} onPress={() => onChange(files.filter((x) => x.file_id !== f.file_id))}/></View>)}
        {error && <Notice message={error}/>}
        <View style={styles.row}><View style={styles.flex}><Button icon="plus" title="Kamera" compact secondary busy={busy} disabled={off} onPress={() => void run(() => pickAndUploadPhoto(api, kind, true))}/></View><View style={styles.flex}><Button icon="plus" title="Galeri" compact secondary disabled={off} onPress={() => void run(() => pickAndUploadPhoto(api, kind, false))}/></View>{documents && <View style={styles.flex}><Button icon="fileText" title="Berkas" compact secondary disabled={off} onPress={() => void run(() => pickAndUploadDocument(api, kind as DocumentKind))}/></View>}</View>
        {files.some((f) => f.scan_status === "PENDING") && <Button icon="refresh" title="Periksa status lampiran" compact secondary disabled={busy} onPress={() => void recheck()}/>}
        <Label tone="muted">{files.length}/{max} lampiran.</Label>
    </View>;
}
const styles = StyleSheet.create({ block: { gap: t.space.sm }, row: { flexDirection: "row", alignItems: "center", gap: t.space.sm }, flex: { flex: 1 } });
