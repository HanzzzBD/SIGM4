import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { BottomSheet, Button, Card, Chips, EmptyState, EntityCard, Input, Label, Notice, Screen, SectionHeading, StatusBadge, Toggle, tokens as t } from "../../shared/ui";
import { ACTION_LABEL, ADMIN_ROLE, NOT_TEMPLATE, SCOPES, changed, copyRole, coreLocked, heldFrom, loadCatalog, loadRoles, matrixPayload, modules, saveMatrix, toggle } from "./model";
import type { Held, RoleDetail, Scope } from "./model";

const useSession = () => { const { api, state, controller } = useAuth(); const perms = state.kind === "READY" ? state.session.permissions : {}; return { api, controller, me: state.kind === "READY" ? state.session.user : { id: "", role_kode: "" }, can: (p: string) => Object.hasOwn(perms, p) }; };
const message = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

/** MS-80 — padanan P-65: role beserta jumlah pengguna & permission; salin sebagai templat (BR-069a). */
export function RoleListScreen() {
    const { api, me, can } = useSession(), [source, setSource] = useState<RoleDetail | null>(null), [name, setName] = useState(""), [desc, setDesc] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const r = useResource(`${me.id}:roles-full`, useCallback((s: AbortSignal) => can("role.view") ? loadRoles(api, s) : Promise.resolve(null), [api, me.id]));
    if (!can("role.view")) return <Screen title="Role & Permission"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat role."/></Screen>;
    const copy = async () => { if (!source) return; setBusy(true); setError(null); try { const x = await copyRole(api, { sumber_role_id: Number(source.id), nama: name.trim(), deskripsi: desc.trim() || null }); setSource(null); router.push(`/role/${x.id}` as "/scan"); } catch (e) { setError(message(e, "Role belum dibuat.")); } finally { setBusy(false); } };
    return <Screen title="Role & Permission" subtitle="Perubahan permission berlaku pada permintaan berikutnya tanpa masuk ulang.">
        {r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat role…</Label>}
        {r.data?.map((x) => <Card key={x.id}><EntityCard icon="shield" title={x.nama} meta={[x.kode, x.deskripsi, `${x.jumlah_pengguna} pengguna · ${x.permissions.length} permission`]} statuses={x.is_system ? [{ label: "Bawaan", tone: "info" }] : [{ label: "Kustom", tone: "pending" }]} onPress={() => router.push(`/role/${x.id}` as "/scan")}/>
            {can("role.update") && !NOT_TEMPLATE.has(x.kode) && <Button icon="plus" title="Salin sebagai templat" compact secondary onPress={() => { setError(null); setName(`${x.nama} (salinan)`); setDesc(""); setSource(x); }}/>}</Card>)}
        <BottomSheet visible={source !== null} onClose={() => { if (!busy) setSource(null); }} title={`Salin ${source?.nama ?? ""} sebagai role baru`}><View style={styles.sheet}>
            <Input label="Nama role baru" value={name} maxLength={100} onChangeText={setName}/><Input label="Deskripsi (opsional)" value={desc} multiline maxLength={500} onChangeText={setDesc}/>
            {error && <Notice message={error}/>}<Button icon="check" title="Buat role" busy={busy} disabled={!name.trim()} onPress={() => void copy()}/>
        </View></BottomSheet>
    </Screen>;
}

/** MS-81 — padanan P-66: matriks modul × aksi + cakupan data; inti Administrator terkunci (FR-02.2 A1). */
export function PermissionMatrixScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(), { api, controller, me, can } = useSession(), editable = can("role.update");
    const [version, setVersion] = useState(0), [held, setHeld] = useState<Held | null>(null), [base, setBase] = useState<RoleDetail | null>(null), [open, setOpen] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
    const roles = useResource(`${me.id}:roles-full:${version}`, useCallback((s: AbortSignal) => can("role.view") ? loadRoles(api, s) : Promise.resolve(null), [api, me.id, version]));
    const catalog = useResource(`${me.id}:permissions`, useCallback((s: AbortSignal) => can("role.view") ? loadCatalog(api, s) : Promise.resolve(null), [api, me.id]));
    const latest = roles.data?.find((x) => x.id === id) ?? null, role = base ?? latest, h = held ?? (role ? heldFrom(role) : {});
    if (!can("role.view")) return <Screen title="Matriks Permission"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat role."/></Screen>;
    if (!role || !catalog.data) return <Screen title="Matriks Permission">{roles.error || catalog.error ? <Notice message={roles.error ?? catalog.error!}/> : roles.data ? <EmptyState illustration="empty" title="Role tidak ditemukan" description="Role ini tidak ada atau sudah tidak tersedia."/> : <Label tone="muted">Memuat matriks…</Label>}</Screen>;
    const stale = !!latest && latest.role_version !== role.role_version, dirty = changed(h, role, catalog.data);
    const edit = (next: Held) => { if (!base) setBase(role); setHeld(next); setNotice(null); };
    const save = async () => { setBusy(true); setError(null); try { await saveMatrix(api, role.id, matrixPayload(h)); setBase(null); setHeld(null); setVersion((v) => v + 1); setNotice("Matriks tersimpan."); if (me.role_kode === role.kode) await controller.restore(); } catch (e) { setError(message(e, "Matriks belum tersimpan.")); } finally { setBusy(false); } };
    return <Screen title={`Matriks: ${role.nama}`} subtitle={`${role.jumlah_pengguna} pengguna memakai role ini. Perubahan berlaku pada permintaan berikutnya.`} {...(editable ? { footer: <Button icon="check" title="Simpan matriks" busy={busy} disabled={!dirty} onPress={() => void save()}/> } : {})}>
        {stale && <Card><Notice tone="info" message="Role ini baru saja diubah di tempat lain. Menyimpan sekarang menimpa perubahan tersebut."/><Button icon="refresh" title="Muat versi terbaru" compact secondary onPress={() => { setBase(null); setHeld(null); }}/></Card>}
        {!editable && <Notice tone="info" message="Anda dapat melihat matriks ini, tetapi tidak dapat mengubahnya (butuh izin role.update)."/>}
        {role.kode === ADMIN_ROLE && <Notice tone="info" message="Permission inti tidak dapat dicabut dari Administrator (FR-02.2 A1)."/>}
        {error && <Notice message={error}/>}{notice && <Notice tone="success" message={notice}/>}
        {modules(catalog.data).map((m) => { const count = m.items.filter((p) => (h[p.kode] ?? null) !== null).length; return <View key={m.modul} style={styles.block}>
            <SectionHeading title={m.modul} action={<Button icon={open === m.modul ? "chevronDown" : "chevronRight"} title={`${count}/${m.items.length}`} compact secondary onPress={() => setOpen(open === m.modul ? "" : m.modul)}/>}/>
            {open === m.modul && m.items.map((p) => { const scope = h[p.kode] ?? null, locked = coreLocked(role, p); return <Card key={p.kode}>
                <View style={styles.row}><View style={styles.flex}><Toggle label={`${ACTION_LABEL[p.aksi] ?? p.aksi} — ${p.deskripsi}`} value={scope !== null} disabled={!editable || locked} onChange={(on) => edit(toggle(h, role, p.kode, on))}/></View>{p.inti && <StatusBadge label={locked ? "Inti · terkunci" : "Inti"} tone="info"/>}</View>
                {scope !== null && <Chips label="Cakupan data" value={scope} disabled={!editable || locked} options={(Object.keys(SCOPES) as Scope[]).map((value) => ({ value, label: SCOPES[value] }))} onChange={(v) => edit({ ...h, [p.kode]: v })}/>}
            </Card>; })}
        </View>; })}
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: t.space.sm }, flex: { flex: 1 }, block: { gap: t.space.sm }, sheet: { padding: t.space.md, gap: t.space.md } });
