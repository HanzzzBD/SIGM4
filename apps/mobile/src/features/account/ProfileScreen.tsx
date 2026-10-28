import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { roleLabel } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useUploads } from "../uploads";
import { useStocktakeQueue } from "../stocktake";
import { useResource } from "../../shared/api/useResource";
import { Badge, Button, Card, Input, Label, ListRow, Notice, Screen, SectionHeading, StatusBadge, tokens as t } from "../../shared/ui";
import { initials } from "../../shared/ui/model";
import { loadProfile, updateProfile, uploadProfilePhoto } from "./api";
import { profileError, profileLinks } from "./model";
import { prepareProfilePhoto } from "./photo";

/** MS-30 — padanan P-76: nama, telepon, foto (FR-01.4); email dan role dikelola Administrator (BR-069). */
export function ProfileScreen() {
    const { state, controller, api } = useAuth(); const uploads = useUploads(); const stocktake = useStocktakeQueue();
    const account = state.kind === "READY" ? state.session.user.id : "";
    const resource = useResource(`${account}:profile`, useCallback((signal: AbortSignal) => loadProfile(api, signal), [api]));
    const [draft, setDraft] = useState<{ nama: string; telepon: string } | null>(null);
    const [photo, setPhoto] = useState<Awaited<ReturnType<typeof prepareProfilePhoto>> | null>(null); const [removePhoto, setRemovePhoto] = useState(false);
    const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false), [logoutError, setLogoutError] = useState<string | null>(null);
    const exit = (discardPending = false) => { if (busy) return; setBusy(true); setLogoutError(null); void controller.logout({ discardPending }).catch((e: unknown) => setLogoutError(e instanceof Error ? e.message : "Keluar belum berhasil.")).finally(() => setBusy(false)); };
    if (state.kind !== "READY") return null;
    const profile = resource.data; const form = draft ?? { nama: profile?.nama ?? state.session.user.nama, telepon: profile?.telepon ?? "" };
    const invalid = profileError(form.nama, form.telepon);
    const pick = async () => {
        setError(null); setSaved(false);
        try {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], exif: false, base64: false, allowsEditing: true, aspect: [1, 1], quality: 1 });
            if (result.canceled || !result.assets[0]) return;
            photo?.discard(); setPhoto(await prepareProfilePhoto(result.assets[0].uri)); setRemovePhoto(false);
        } catch (e) { setError(e instanceof Error ? e.message : "Foto belum dapat dipilih."); }
    };
    const save = async () => {
        if (saving || invalid) return; setSaving(true); setError(null); setSaved(false);
        try {
            const foto = removePhoto ? null : photo ? await uploadProfilePhoto(api, photo) : undefined;
            await updateProfile(api, form.nama.trim(), form.telepon.trim() || null, foto);
            photo?.discard(); setPhoto(null); setRemovePhoto(false); setDraft(null); setSaved(true); resource.reload(); void controller.restore().catch(() => undefined);
        } catch (e) { setError(e instanceof Error ? e.message : "Profil belum tersimpan. Coba lagi."); } finally { setSaving(false); }
    };
    const shownPhoto = removePhoto ? null : photo?.uri ?? (profile?.foto_status === "CLEAN" ? profile.foto_url : null);
    return <Screen title="Profil" subtitle="Email dan role dikelola Administrator. Foto JPG atau PNG paling besar 2 MB.">
        <Card><View style={styles.identity}>
            <View style={styles.avatar}>{shownPhoto ? <Image source={{ uri: shownPhoto }} style={styles.avatar} contentFit="cover" accessibilityLabel="Foto profil Anda"/> : <Text style={styles.initials}>{initials(form.nama)}</Text>}</View>
            <View style={styles.nameBlock}><Text numberOfLines={1} style={styles.name}>{state.session.user.nama}</Text><Badge label={roleLabel(state.session.user.role_kode)}/></View>
        </View><ListRow title="Email" subtitle={state.session.user.email} icon="mail"/>
            {profile?.foto_status === "PENDING" && !photo && <StatusBadge label="Foto sedang diperiksa" tone="pending"/>}{(profile?.foto_status === "INFECTED" || profile?.foto_status === "FAILED") && !photo && <StatusBadge label="Foto belum lolos pemeriksaan" tone="error"/>}
        </Card>
        <SectionHeading title="Ubah profil"/>
        <Card>{error && <Notice message={error}/>}{saved && <Notice tone="success" message="Profil tersimpan."/>}{resource.error && <Notice message={resource.error}/>}
            <Input icon="user" label="Nama" value={form.nama} maxLength={200} editable={!saving} onChangeText={(nama) => { setSaved(false); setDraft({ ...form, nama }); }}/>
            <Input label="Telepon" value={form.telepon} maxLength={30} keyboardType="phone-pad" editable={!saving} onChangeText={(telepon) => { setSaved(false); setDraft({ ...form, telepon }); }}/>
            {invalid && draft && <Label tone="muted">{invalid}</Label>}
            <View style={styles.row}><View style={styles.flex}><Button icon="plus" title="Pilih foto" secondary disabled={saving} onPress={() => void pick()}/></View><View style={styles.flex}><Button icon="close" title="Hapus foto" secondary disabled={saving || (!shownPhoto && !profile?.foto_status)} onPress={() => { photo?.discard(); setPhoto(null); setRemovePhoto(true); setSaved(false); }}/></View></View>
            {removePhoto && <Label tone="muted">Foto dihapus saat profil disimpan.</Label>}
            <Button icon="check" title="Simpan profil" busy={saving} disabled={invalid !== null || (draft === null && !photo && !removePhoto)} onPress={() => void save()}/>
        </Card>
        {profileLinks(state.session.permissions).length > 0 && <Card>{profileLinks(state.session.permissions).map((link) => <ListRow key={link.id} title={link.label} icon={link.icon} onPress={() => router.push(link.path as "/scan")}/>)}</Card>}
        <SectionHeading title="Perangkat ini"/>
        <Card>
            <ListRow title="Foto belum terunggah" subtitle={String(uploads.count)} icon="history"/>{uploads.discarded > 0 && <Notice message={`${uploads.discarded} foto tertua dibuang karena batas antrean. Ambil ulang foto yang diperlukan.`} />}
            {uploads.error && <Notice message={uploads.error} />}{uploads.message && <Label>{uploads.message}</Label>}
            {stocktake.entries.length > 0 && <ListRow title="Hasil opname belum tersinkron" subtitle={String(stocktake.entries.length)} icon="clipboardCheck"/>}
            {logoutError && <Card><Notice message={logoutError} /><Label>Hapus data dan keluar menghapus hasil lokal beserta foto yang belum diterima server. Tindakan ini tidak dapat dibatalkan.</Label><Button title="Sinkronkan sekarang" disabled={busy} onPress={() => { uploads.refresh(); stocktake.refresh(); setLogoutError("Sinkronisasi dicoba; saat luring hasil tetap disimpan. Periksa antrean sebelum keluar kembali."); }} /><Button title="Kembali" secondary disabled={busy} onPress={() => setLogoutError(null)} /><Button title="Hapus data dan keluar" secondary disabled={busy} onPress={() => exit(true)} /></Card>}
            <Button icon="logout" title="Keluar dari akun" secondary busy={busy} onPress={() => exit()} />
        </Card>
    </Screen>;
}
const styles = StyleSheet.create({
    identity: { flexDirection: "row", alignItems: "center", gap: t.space.md, paddingVertical: t.space.sm },
    avatar: { height: t.size.tabBar, width: t.size.tabBar, borderRadius: t.radius.full, backgroundColor: t.color.primarySoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    initials: { fontSize: t.font.heading, fontWeight: "600", color: t.color.primary }, nameBlock: { flex: 1, gap: t.space.sm }, name: { fontSize: t.font.title, fontWeight: "600", color: t.color.heading },
    row: { flexDirection: "row", gap: t.space.sm }, flex: { flex: 1 },
});
