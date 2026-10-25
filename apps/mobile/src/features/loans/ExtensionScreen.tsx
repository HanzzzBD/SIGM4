import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { BottomSheet, Button, Card, DateField, EmptyState, Input, Label, Notice, Screen, tokens as t } from "../../shared/ui";
import { dateWib, timeWib } from "../../shared/wib";
import { extend, loadLoan } from "./api";
import { extensionBody } from "./model";

/** MS-13 — tanggal baru + alasan (FR-09.5); jatuh tempo berubah hanya setelah disetujui; 409 menampilkan batas dari server (A1). */
export function ExtensionScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(); const { state, api, offlineOnly } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const valid = /^[1-9]\d*$/.test(id) && state.kind === "READY" && Object.hasOwn(state.session.permissions, "loan.extend");
    const resource = useResource(`${account}:loan-extend:${id}`, useCallback((signal: AbortSignal) => valid ? loadLoan(api, id, signal) : Promise.resolve(null), [api, id, valid]));
    const [date, setDate] = useState(""), [time, setTime] = useState(""), [reason, setReason] = useState(""), [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [done, setDone] = useState(false);
    const key = useRef<{ body: string; key: string } | null>(null);
    if (!valid) return <Screen title="Ajukan Perpanjangan"><EmptyState illustration="noAccess" title="Tidak dapat diajukan" description="Anda tidak memiliki izin mengajukan perpanjangan."/></Screen>;
    const loan = resource.data, due = loan ? new Date(loan.tanggal_jatuh_tempo) : null;
    const draft = loan ? extensionBody(date || dateWib(due!), time || timeWib(due!), reason, loan.tanggal_jatuh_tempo) : null;
    const send = async () => {
        if (!loan || !draft || "error" in draft || busy) return;
        const text = JSON.stringify(draft.body); if (key.current?.body !== text) key.current = { body: text, key: randomUUID() };
        setBusy(true); setError(null);
        try { await extend(api, loan.id, draft.body, key.current.key); setConfirm(false); setDone(true); }
        catch (e) { setError(e instanceof Error ? e.message : "Perpanjangan belum terkirim. Coba lagi dengan isian yang sama."); } finally { setBusy(false); }
    };
    return <Screen title="Ajukan Perpanjangan" subtitle="Jadwal baru berlaku setelah disetujui. Keterlambatan sebelum keputusan tetap dihitung.">
        {resource.loading && <Label tone="muted">Memuat peminjaman…</Label>}{resource.error && <Notice message={resource.error}/>}
        {offlineOnly && <Notice message="Perpanjangan memerlukan koneksi dan tidak akan diantrekan."/>}
        {done ? <><Notice tone="success" message="Perpanjangan diajukan dan menunggu persetujuan. Jatuh tempo belum berubah."/><Button icon="arrowLeft" title="Kembali ke peminjaman" onPress={() => router.back()}/></> : loan && !loan.aksi.perpanjang ? <Notice tone="info" message="Peminjaman ini tidak dapat diperpanjang saat ini."/> : loan && <>
            <Card><Label>{loan.nomor} · jatuh tempo kini {formatTime(loan.tanggal_jatuh_tempo)}</Label></Card>
            <View style={{ flexDirection: "row", gap: t.space.sm }}><View style={{ flex: 1 }}><DateField label="Jatuh tempo baru" value={date || dateWib(due!)} min={dateWib(due!)} onChange={setDate}/></View><View style={{ width: t.size.avatar * 2 }}><Input label="Jam" value={time || timeWib(due!)} maxLength={5} onChangeText={setTime}/></View></View>
            <Input label="Alasan perpanjangan" value={reason} multiline maxLength={1000} onChangeText={setReason}/>
            {draft && "error" in draft && (date || reason) ? <Label tone="muted">{draft.error}</Label> : null}
            {error && <Notice message={error}/>}
            <Button icon="send" title="Tinjau perpanjangan" disabled={!draft || "error" in draft || offlineOnly} onPress={() => { setError(null); setConfirm(true); }}/>
        </>}
        <BottomSheet visible={confirm} onClose={() => setConfirm(false)} title="Ajukan perpanjangan?"><View style={{ padding: t.space.md, gap: t.space.md }}>
            {draft && "body" in draft && <Label>{formatTime(draft.body.tanggal_jatuh_tempo)} · {draft.body.alasan}</Label>}
            <Label tone="muted">Slot tambahan ditahan selama menunggu persetujuan.</Label>{error && <Notice message={error}/>}
            <Button icon="send" title="Ajukan perpanjangan" busy={busy} onPress={() => void send()}/>
        </View></BottomSheet>
    </Screen>;
}
