import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AssetDetailSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { discardPreparedPhoto, useUploads } from "../uploads";
import type { PreparedPhoto } from "../uploads";
import { MobileApiError } from "../../shared/api/client";
import { useResource } from "../../shared/api/useResource";
import { Button, Card, Input, Label, Notice, Screen } from "../../shared/ui";
import { formatTime } from "../../shared/time";
import { DamageSubmission, openReport, statusLabels, urgencyLabels } from "./model";
import type { DamageObject, SubmissionResult } from "./model";
import { ObjectPicker } from "./ObjectPicker";
import { PhotoPicker } from "./PhotoPicker";

export function DamageReportScreen() {
    const { asset_id: assetId } = useLocalSearchParams<{ asset_id?: string }>();
    const { state, api } = useAuth(); const uploads = useUploads();
    const account = state.kind === "READY" ? state.session.user.id : ""; const permissions = state.kind === "READY" ? state.session.permissions : {};
    const canCreate = Object.hasOwn(permissions, "damage.create"); const canView = Object.hasOwn(permissions, "damage.view");
    const accountRef = useRef(account); accountRef.current = account;
    const focused = useRef(false); const abort = useRef<AbortController | null>(null);
    const submitting = useRef(false);
    const [object, setObject] = useState<DamageObject | null>(null); const [description, setDescription] = useState("");
    const [urgency, setUrgency] = useState<keyof typeof urgencyLabels>("SEDANG"); const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
    const [addInfo, setAddInfo] = useState(false); const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false);
    const [message, setMessage] = useState<string | null>(null); const [prefillLoading, setPrefillLoading] = useState(false);
    const [receipt, setReceipt] = useState<SubmissionResult | null>(null);
    const attempt = useMemo(() => uploads.queue ? new DamageSubmission(api, uploads.queue, account, () => accountRef.current) : null, [api, uploads.queue, account]);
    const photosRef = useRef(photos); photosRef.current = photos;
    const attemptRef = useRef(attempt); attemptRef.current = attempt;
    const isCurrent = useCallback(() => focused.current && accountRef.current === account, [account]);
    useEffect(() => () => { for (const photo of photosRef.current) if (!attemptRef.current?.hasStaged(photo.id)) void discardPreparedPhoto(photo).catch(() => undefined); }, []);
    useFocusEffect(useCallback(() => {
        focused.current = true; abort.current = new AbortController(); setBusy(false); setUncertain(attempt?.uncertain ?? false);
        const listener = AppState.addEventListener("change", (next) => { if (next === "background") abort.current?.abort(); else if (next === "active" && abort.current?.signal.aborted) { abort.current = new AbortController(); setBusy(false); setUncertain(attempt?.uncertain ?? false); } });
        return () => { focused.current = false; abort.current?.abort(); listener.remove(); };
    }, [account, attempt]));
    const canReadAsset = Object.hasOwn(permissions, "asset.view");
    useEffect(() => {
        if (!assetId) return;
        if (!/^[1-9]\d*$/.test(assetId) || !canReadAsset) { setMessage("Aset dari tautan tidak valid atau tidak dapat Anda akses. Pilih objek yang tersedia."); return; }
        const current = new AbortController(); setPrefillLoading(true);
        void api.get(`/assets/${assetId}`, { signal: current.signal }).then((response) => { const asset = AssetDetailSchema.parse(response.data.data); if (asset.id !== assetId || asset.dihapuskan) throw new Error("Aset sudah tidak tersedia untuk laporan."); if (!current.signal.aborted) setObject({ kind: "ASET", id: asset.id, label: `${asset.kode_barang} · ${asset.nama}` }); }).catch((e: unknown) => { if (!current.signal.aborted) setMessage(e instanceof Error ? e.message : "Aset belum dapat dibaca."); }).finally(() => { if (!current.signal.aborted) setPrefillLoading(false); });
        return () => current.abort();
    }, [api, assetId, account, canReadAsset]);
    const load = useCallback((signal: AbortSignal) => object && canView ? openReport(api, object, signal) : Promise.resolve(null), [api, object, canView]);
    const existing = useResource(`${account}:open-damage:${object?.kind}:${object?.id}`, load);
    useEffect(() => { if (!existing.data) setAddInfo(false); }, [existing.data]);
    const locked = busy || uncertain;
    const remove = async (id: string) => {
        const photo = photos.find((item) => item.id === id); if (!photo || locked) return;
        try { if (attempt?.hasStaged(id)) await uploads.queue?.cancel(id, account); else await discardPreparedPhoto(photo); setPhotos((value) => value.filter((item) => item.id !== id)); uploads.refresh(); }
        catch { setMessage("Foto belum dapat dihapus. Coba lagi."); }
    };
    const choose = (value: DamageObject) => { setObject(value); setAddInfo(false); setMessage(null); };
    const submit = async () => {
        const signal = abort.current?.signal;
        if (!object || !attempt || !signal || signal.aborted || locked || submitting.current || !canCreate || existing.loading || existing.error || (existing.data && !addInfo)) return;
        submitting.current = true;
        setBusy(true); setMessage(null);
        try {
            const result = await attempt.send({ object, description, urgency, photos, existingId: addInfo ? existing.data?.id ?? null : null }, signal);
            if (!signal.aborted && isCurrent()) { setPhotos([]); setReceipt(result); uploads.refresh(); setMessage(result.queueWarning ? "Informasi tersimpan. Metadata antrean belum diperbarui, unggahan foto tetap dilanjutkan." : result.pending ? "Informasi tersimpan. Foto belum terunggah dan akan dicoba kembali saat tersambung." : "Informasi tersimpan."); }
        } catch (e) {
            if (!signal.aborted && isCurrent()) { setMessage(attempt.uncertain ? "Hasil pengiriman belum pasti. Periksa tiket sebelum mengirim informasi lagi." : e instanceof Error ? e.message : "Laporan belum dapat dikirim."); if (e instanceof MobileApiError && e.code === "DUPLICATE_CODE") { setAddInfo(false); existing.reload(); } }
        } finally { submitting.current = false; uploads.refresh(); if (!signal.aborted && isCurrent()) { setBusy(false); setUncertain(attempt.uncertain); } }
    };
    if (!canCreate) return <Screen title="Lapor Kerusakan"><Notice message="Anda tidak memiliki izin melaporkan kerusakan." /><Button title="Tugas" onPress={() => router.replace("/tugas" as "/scan")} /></Screen>;
    if (receipt) return <Screen title={receipt.note ? "Informasi Ditambahkan" : "Laporan Tersimpan"}><Card><Label>Tiket {receipt.number ?? existing.data?.nomor ?? `#${receipt.reportId}`}</Label><Label>{description.trim()}</Label><Label>{message}</Label></Card>{canView && (!receipt.note || existing.data?.milik_sendiri || permissions["damage.view"] === "all") && <Button title="Lihat detail tiket" onPress={() => router.replace(`/kerusakan/${receipt.reportId}` as "/scan")} />}<Button title="Antrean foto" secondary onPress={() => router.replace("/kerusakan/unggahan" as "/scan")} /><Button title="Tiket saya" secondary onPress={() => router.replace("/kerusakan" as "/scan")} /></Screen>;
    return <Screen title="Lapor Kerusakan" action={<Button title="Tiket saya" secondary disabled={busy} onPress={() => router.push("/kerusakan" as "/scan")} />}>
        <Label>Laporan dikirim saat tersambung. Foto yang belum terunggah dilanjutkan melalui antrean perangkat. Isi formulir belum tersimpan sampai laporan dikirim.</Label>
        {!canView && <Notice message="Laporan baru tetap dapat dikirim. Izin membaca tiket belum tersedia untuk memeriksa laporan sebelumnya dan memantau status. Server tetap mencegah tiket berulang." />}
        {prefillLoading && <Label>Memuat aset dari hasil scan...</Label>}
        {!locked && !prefillLoading && !object && <ObjectPicker onChoose={choose} />}
        {object && <><Card><Label>{object.label}</Label><Label>Jenis: {object.kind === "ASET" ? "Aset" : "Ruangan"}</Label><Button title="Ganti objek" secondary disabled={locked || photos.length > 0} onPress={() => { setObject(null); setAddInfo(false); }} />{photos.length > 0 && <Label>Hapus foto sebelum mengganti objek.</Label>}</Card>
            {existing.loading && <Label>Memeriksa tiket terbuka...</Label>}{existing.error && <Notice message={existing.error} />}<Button title={uncertain ? "Periksa tiket tanpa mengirim ulang" : "Periksa ulang tiket"} secondary disabled={busy || !canView} onPress={existing.reload} />
            {existing.data && <Card><Label>Sudah ada tiket {existing.data.nomor}</Label><Label>{statusLabels[existing.data.status]} · {urgencyLabels[existing.data.urgensi]} · {formatTime(existing.data.dilaporkan_pada)}</Label><Label>Tambahkan informasi ke tiket ini agar laporan tidak berulang.</Label><Button title="Tambahkan informasi ke tiket yang ada" disabled={locked} onPress={() => setAddInfo(true)} />{existing.data.milik_sendiri && <Button title="Lihat tiket saya" secondary onPress={() => router.push(`/kerusakan/${existing.data!.id}` as "/scan")} />}</Card>}
            <Input label={addInfo ? "Informasi tambahan" : "Deskripsi kerusakan"} multiline maxLength={2000} value={description} editable={!locked} onChangeText={setDescription} />
            {!addInfo && <Card><Label>Tingkat urgensi</Label>{(Object.keys(urgencyLabels) as Array<keyof typeof urgencyLabels>).map((value) => <Button key={value} title={`${urgency === value ? "Dipilih: " : ""}${urgencyLabels[value]}`} secondary={urgency !== value} disabled={locked} onPress={() => setUrgency(value)} />)}</Card>}
            <PhotoPicker photos={photos} disabled={locked || !uploads.queue} isCurrent={isCurrent} onAdd={(photo) => setPhotos((value) => [...value, photo])} onRemove={(id) => { void remove(id); }} />
            <Button title={addInfo ? "Kirim informasi tambahan" : "Kirim laporan kerusakan"} busy={busy} disabled={uncertain || !attempt || existing.loading || !!existing.error || (!!existing.data && !addInfo) || !description.trim() || (!addInfo && photos.length < 1)} onPress={() => { void submit(); }} />
        </>}{uncertain && <Notice message="Hasil pengiriman belum pasti. Pengiriman ulang dihentikan agar informasi tidak berulang. Periksa tiket; bila tiket bukan milik Anda, minta Petugas Sarpras memastikan catatan telah diterima." />}
        {message && <Notice message={message} />}{uploads.error && <Notice message={uploads.error} />}{uploads.discarded > 0 && <Notice message={`${uploads.discarded} foto dibuang karena batas antrean atau retensi. Periksa foto tiket terkait.`} />}<Button title="Antrean foto" secondary disabled={busy} onPress={() => router.push("/kerusakan/unggahan" as "/scan")} />
    </Screen>;
}
