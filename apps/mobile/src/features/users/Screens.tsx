import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { BottomSheet, Button, Card, Chips, EmptyState, EntityCard, Input, Label, Notice, Screen, Toggle, tokens as t } from "../../shared/ui";
import { METHODS, PROMOTION_LIMIT, SECRET_ACTIONS, STATUS, STUDENT_ROLE, createUser, formFromUser, issueReset, loadResetRequests, loadRoles, loadUnits, loadUser, loadUsers, loadYears, lockedSelf, promote, promotionItems, rejectReset, remainingChoices, secretAction, setStatus, updateUser, userBody } from "./model";
import type { Method, PromotionChoice, ResetRequest, SecretAction, UserForm, UserRow } from "./model";
import { SecretPanel } from "./SecretPanel";
import type { Secret } from "./SecretPanel";

const useSession = () => { const { api, state } = useAuth(); const perms = state.kind === "READY" ? state.session.permissions : {}; return { api, me: state.kind === "READY" ? state.session.user.id : "", can: (p: string) => Object.hasOwn(perms, p) }; };
const denied = (title: string) => <Screen title={title}><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin membuka halaman ini."/></Screen>;
const openWeb = (path: string) => { const o = process.env.EXPO_PUBLIC_APP_URL ?? ""; if (o.startsWith("https://")) void Linking.openURL(`${new URL(o).origin}${path}`).catch(() => undefined); };
const message = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;
function useLookups() {
    const { api, me, can } = useSession();
    const roles = useResource(`${me}:roles`, useCallback((s: AbortSignal) => can("role.view") ? loadRoles(api, s) : Promise.resolve(null), [api, me]));
    const units = useResource(`${me}:work-units`, useCallback((s: AbortSignal) => can("setting.view") ? loadUnits(api, s) : Promise.resolve(null), [api, me]));
    return { roles: roles.data ?? [], units: units.data ?? [] };
}

/** MS-76 — padanan P-60: saring role/status; impor ↗ web (MOB-SCP-03). */
export function UserListScreen() {
    const { api, me, can } = useSession(), { roles } = useLookups(), [role, setRole] = useState(""), [status, setStatusFilter] = useState(""), [page, setPage] = useState(1), [web, setWeb] = useState(false);
    const r = useResource(`${me}:users:${role}:${status}:${page}`, useCallback((s: AbortSignal) => can("user.view") ? loadUsers(api, { page, role, status }, s) : Promise.resolve(null), [api, page, role, status, me]));
    if (!can("user.view")) return denied("Pengguna");
    return <Screen title="Pengguna" subtitle="Kelola akun, role, dan status pengguna. Impor massal berkas hanya tersedia di web sekolah." {...(can("user.create") ? { footer: <Button icon="plus" title="Tambah pengguna" onPress={() => router.push("/pengguna/baru" as "/scan")}/> } : {})}>
        <View style={styles.wrap}>{can("user.update") && <Button icon="users" title="Kenaikan kelas" compact secondary onPress={() => router.push("/pengguna/kenaikan-kelas" as "/scan")}/>}{can("user.create") && <Button icon="externalLink" title="Impor pengguna" compact secondary onPress={() => setWeb(true)}/>}</View>
        {roles.length > 0 && <Chips label="Role" value={role} options={[{ value: "", label: "Semua" }, ...roles.map((x) => ({ value: x.id, label: x.nama }))]} onChange={(v) => { setRole(v); setPage(1); }}/>}
        <Chips label="Status" value={status} options={[{ value: "", label: "Semua" }, ...Object.entries(STATUS).map(([value, label]) => ({ value, label }))]} onChange={(v) => { setStatusFilter(v); setPage(1); }}/>
        {r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat pengguna…</Label>}
        {r.data?.data.map((u) => <EntityCard key={u.id} icon="circleUser" title={u.nama} meta={[u.email, `${roles.find((x) => x.id === u.role_id)?.nama ?? "Role"} · ${u.nip_nis ?? "—"}`]} statuses={[{ label: STATUS[u.status], tone: u.status === "AKTIF" ? "success" : "pending" }]} onPress={() => router.push(`/pengguna/${u.id}` as "/scan")}/>)}
        {r.data && !r.data.data.length && <EmptyState illustration="empty" title="Tidak ada pengguna" description="Ubah saringan atau tambah pengguna."/>}
        {r.data && r.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{r.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= r.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
        <BottomSheet visible={web} onClose={() => setWeb(false)} title="Impor pengguna"><View style={styles.sheet}><Label>Impor massal berkas XLSX hanya tersedia di web sekolah (MOB-SCP-03).</Label><Button icon="externalLink" title="Buka di web sekolah" onPress={() => { openWeb("/pengguna/impor"); setWeb(false); }}/></View></BottomSheet>
    </Screen>;
}

function UserFields({ f, set, original }: { f: UserForm; set: (p: Partial<UserForm>) => void; original?: UserRow | undefined }) {
    const { me, can } = useSession(), { roles, units } = useLookups(), self = lockedSelf(original, me), student = roles.find((r) => r.id === f.role)?.kode === STUDENT_ROLE;
    return <>
        {!can("role.view") && <Notice message="Akun Anda tidak memiliki izin melihat role (role.view), sehingga pengguna tidak dapat disimpan."/>}
        <Input label="Nama lengkap" value={f.nama} maxLength={150} onChangeText={(nama) => set({ nama })}/>
        <Input label="Email" value={f.email} maxLength={150} keyboardType="email-address" autoCapitalize="none" editable={!self} onChangeText={(email) => set({ email })}/>{self && <Label tone="muted">Email dan role akun sendiri tidak dapat diubah.</Label>}
        <Input label="NIP/NIS" value={f.nip} maxLength={30} onChangeText={(nip) => set({ nip })}/>
        {can("role.view") && <Chips label="Role" value={f.role} disabled={self} options={roles.map((r) => ({ value: r.id, label: r.nama }))} onChange={(role) => set({ role })}/>}
        {can("setting.view") && <Chips label="Unit kerja" value={f.unit} options={[{ value: "", label: "Tanpa unit" }, ...units.filter((u) => u.status === "AKTIF" || u.id === original?.work_unit_id).map((u) => ({ value: u.id, label: u.status === "AKTIF" ? u.nama : `${u.nama} (nonaktif)` }))]} onChange={(unit) => set({ unit })}/>}
        <Input label="Telepon" value={f.telepon} maxLength={20} keyboardType="phone-pad" onChangeText={(telepon) => set({ telepon })}/>
        {student && <Toggle label="Persetujuan wali sudah dikumpulkan sekolah" value={f.consent} disabled={!!original?.consent_guardian_at} onChange={(consent) => set({ consent })}/>}
    </>;
}
const useStudent = (role: string) => { const { roles } = useLookups(); return roles.find((r) => r.id === role)?.kode === STUDENT_ROLE; };

/** MS-77 — padanan P-61: password sementara tampil sekali di layar ini (keputusan 25). */
export function UserCreateScreen() {
    const { api, can } = useSession(), [f, setF] = useState<UserForm>(formFromUser()), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [done, setDone] = useState<{ id: string; secret: Secret } | null>(null), student = useStudent(f.role);
    if (!can("user.create")) return denied("Tambah Pengguna");
    if (done) return <Screen title="Pengguna dibuat"><SecretPanel secret={done.secret} onDone={() => router.replace(`/pengguna/${done.id}` as "/scan")}/></Screen>;
    const save = async () => { const r = userBody(f, { student, canSetting: can("setting.view") }); if ("error" in r) { setError(r.error); return; } setBusy(true); setError(null); try { const u = await createUser(api, r.body); setDone({ id: u.id, secret: { title: `Akun ${u.nama} dibuat`, label: "Password sementara", value: u.password_sementara, until: null } }); } catch (e) { setError(message(e, "Pengguna belum tersimpan.")); } finally { setBusy(false); } };
    return <Screen title="Tambah Pengguna" subtitle="Password sementara diterbitkan sekali dan wajib diganti saat pengguna pertama kali masuk." footer={<Button icon="check" title="Simpan pengguna" busy={busy} disabled={!can("role.view")} onPress={() => void save()}/>}>
        {error && <Notice message={error}/>}<UserFields f={f} set={(p) => { setError(null); setF({ ...f, ...p }); }}/>
    </Screen>;
}

/** MS-78 — padanan P-63: ubah, aktif/nonaktif beralasan, reset password/2FA, kode aktivasi (FR-02.1, FR-01.3 A5, FR-01.5). */
export function UserDetailScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(), { api, me, can } = useSession(), valid = /^[1-9]\d*$/.test(id) && can("user.view"), { roles, units } = useLookups();
    const [version, setVersion] = useState(0), [sheet, setSheet] = useState<"edit" | "status" | SecretAction | null>(null), [f, setF] = useState<UserForm>(formFromUser()), [reason, setReason] = useState(""), [method, setMethod] = useState<Method | "">(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [secret, setSecret] = useState<Secret | null>(null);
    const r = useResource(`${me}:user:${id}:${version}`, useCallback((s: AbortSignal) => valid ? loadUser(api, id, s) : Promise.resolve(null), [api, id, valid, version]));
    const u = r.data, student = useStudent(f.role);
    useEffect(() => { if (sheet === "edit" && u) setF(formFromUser(u)); }, [sheet, u]);
    if (!valid) return denied("Detail Pengguna");
    const run = async (fn: () => Promise<string>) => { setBusy(true); setError(null); try { setNotice(await fn()); setSheet(null); setVersion((v) => v + 1); } catch (e) { setError(message(e, "Aksi belum dapat dijalankan.")); } finally { setBusy(false); } };
    const save = () => { const b = userBody(f, { student, canSetting: can("setting.view"), original: u ?? undefined }); if ("error" in b) { setError(b.error); return; } void run(async () => { await updateUser(api, id, b.body); return "Perubahan pengguna tersimpan."; }); };
    const active = u?.status === "AKTIF", locked = !!u?.pseudonymized_at;
    const issue = (action: SecretAction) => { if (!method) { setError("Metode verifikasi wajib dipilih."); return; } void run(async () => { const h = await secretAction(api, id, action, method); if (h.secret) setSecret({ title: `${SECRET_ACTIONS[action].title} untuk ${u!.nama}`, label: SECRET_ACTIONS[action].label, value: h.secret, until: h.until }); return `${SECRET_ACTIONS[action].title} berhasil.${h.revoked === null ? "" : ` ${h.revoked} sesi dicabut.`}`; }); };
    return <Screen title={u?.nama ?? "Detail Pengguna"} subtitle="Setiap aksi hanya tampil bila izinnya dipegang; server tetap memeriksa ulang.">
        {r.loading && <Label tone="muted">Memuat pengguna…</Label>}{r.error && <Notice message={r.error}/>}{notice && <Notice tone="success" message={notice}/>}
        {secret && <SecretPanel secret={secret} onDone={() => setSecret(null)}/>}
        {u && !secret && <>
            <EntityCard icon="circleUser" title={u.nama} meta={[u.email, `NIP/NIS ${u.nip_nis ?? "—"}`]} statuses={[{ label: STATUS[u.status], tone: active ? "success" : "pending" }, ...(u.must_change_password ? [{ label: "Wajib ganti password", tone: "warning" as const }] : [])]}/>
            {locked && <Notice tone="info" message={`Akun dipseudonimkan pada ${formatTime(u.pseudonymized_at!)}. Identitas tidak dapat dipulihkan dan akun tidak dapat disunting.`}/>}
            <Card><Label>Role: {roles.find((x) => x.id === u.role_id)?.nama ?? "—"}</Label><Label>Unit kerja: {u.work_unit_id === null ? "—" : units.find((x) => x.id === u.work_unit_id)?.nama ?? "—"}</Label><Label>Telepon: {u.telepon ?? "—"}</Label><Label>Login terakhir: {u.login_terakhir_pada ? formatTime(u.login_terakhir_pada) : "Belum pernah"}</Label>{u.consent_guardian_at && <Label>Persetujuan wali: {formatTime(u.consent_guardian_at)}</Label>}</Card>
            {!locked && <View style={styles.wrap}>
                {can("user.update") && <Button icon="settings" title="Ubah" compact secondary onPress={() => { setError(null); setSheet("edit"); }}/>}
                {can("user.update") && <Button icon={active ? "circleX" : "checkCircle"} title={active ? "Nonaktifkan" : "Aktifkan"} compact secondary onPress={() => { setError(null); setReason(""); setSheet("status"); }}/>}
                {(Object.keys(SECRET_ACTIONS) as SecretAction[]).filter((a) => can(SECRET_ACTIONS[a].permission)).map((a) => <Button key={a} icon="keyRound" title={SECRET_ACTIONS[a].title} compact secondary onPress={() => { setError(null); setMethod(""); setSheet(a); }}/>)}
                {can("activity_log.view") && <Button icon="history" title="Riwayat perubahan" compact secondary onPress={() => router.push(`/activity-log?entitas=users&entitas_id=${u.id}` as "/scan")}/>}
            </View>}
        </>}
        <BottomSheet visible={sheet !== null} full={sheet === "edit"} onClose={() => { if (!busy) setSheet(null); }} title={sheet === "edit" ? "Ubah pengguna" : sheet === "status" ? (active ? "Nonaktifkan pengguna?" : "Aktifkan pengguna?") : sheet ? `${SECRET_ACTIONS[sheet].title}: ${u?.nama ?? ""}` : ""}><View style={styles.sheet}>
            {sheet === "edit" && <><UserFields f={f} set={(p) => { setError(null); setF({ ...f, ...p }); }} original={u ?? undefined}/><Button icon="check" title="Simpan perubahan" busy={busy} disabled={!can("role.view")} onPress={save}/></>}
            {sheet === "status" && <><Label>{active ? "Pengguna tidak dapat masuk dan seluruh sesinya dicabut." : "Pengguna dapat masuk kembali."}</Label>{active && <Input label="Alasan penonaktifan" value={reason} multiline maxLength={500} onChangeText={setReason}/>}<Button icon="check" title={active ? "Nonaktifkan" : "Aktifkan"} busy={busy} disabled={active && !reason.trim()} onPress={() => void run(async () => { const x = await setStatus(api, id, active ? "NONAKTIF" : "AKTIF", active ? reason.trim() : undefined); return `Pengguna ${STATUS[x.status].toLowerCase()}.`; })}/></>}
            {sheet && sheet !== "edit" && sheet !== "status" && <><Label>{SECRET_ACTIONS[sheet].impact}</Label><Chips label="Metode verifikasi identitas" value={method} options={(Object.keys(METHODS) as Method[]).map((value) => ({ value, label: METHODS[value] }))} onChange={setMethod}/><Button icon="keyRound" title={SECRET_ACTIONS[sheet].title} busy={busy} onPress={() => issue(sheet)}/></>}
            {error && <Notice message={error}/>}
        </View></BottomSheet>
    </Screen>;
}

/** MS-79 — padanan P-64: tetapkan kelas atau luluskan siswa aktif per tahun ajaran; ≤ 200 per proses (SL-02, SL-04). */
export function ClassPromotionScreen() {
    const { api, me, can } = useSession(), missing = ["user.view", "role.view", "setting.view", "user.update"].filter((p) => !can(p)), ready = missing.length === 0;
    const [year, setYear] = useState(""), [page, setPage] = useState(1), [choices, setChoices] = useState<Record<string, PromotionChoice>>({}), [bulk, setBulk] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [result, setResult] = useState<Awaited<ReturnType<typeof promote>> | null>(null);
    const meta = useResource(`${me}:promotion-meta`, useCallback(async (s: AbortSignal) => ready ? { roles: await loadRoles(api, s), years: await loadYears(api, s), classes: (await loadUnits(api, s, "KELAS")).filter((k) => k.status === "AKTIF") } : null, [api, ready]));
    const studentRole = meta.data?.roles.find((r) => r.kode === STUDENT_ROLE)?.id ?? "";
    const students = useResource(`${me}:promotion-students:${studentRole}:${page}`, useCallback((s: AbortSignal) => studentRole ? loadUsers(api, { page, role: studentRole, status: "AKTIF", perPage: 100 }, s) : Promise.resolve(null), [api, studentRole, page]));
    if (!ready) return <Screen title="Kenaikan Kelas Massal"><Notice message={`Halaman ini membutuhkan izin ${missing.join(", ")}. Hubungi Administrator.`}/></Screen>;
    const classes = meta.data?.classes ?? [], rows = students.data?.data ?? [], names = new Map(rows.map((x) => [Number(x.id), x.nama]));
    const send = async () => { const p = promotionItems(choices); if ("error" in p) { setError(p.error); return; } setBusy(true); setError(null); try { const h = await promote(api, Number(year), p.items); setResult(h); setChoices((c) => remainingChoices(c, h.baris)); } catch (e) { setError(message(e, "Kenaikan kelas belum diproses.")); } finally { setBusy(false); } };
    const count = Object.keys(choices).length;
    return <Screen title="Kenaikan Kelas Massal" subtitle={`Tetapkan kelas pada tahun ajaran terpilih atau tandai lulus. Maksimal ${PROMOTION_LIMIT} siswa per proses.`} footer={<Button icon="send" title={`Proses ${count} siswa`} busy={busy} disabled={!year || !count} onPress={() => void send()}/>}>
        {meta.error && <Notice message={meta.error}/>}{error && <Notice message={error}/>}
        <Chips label="Tahun ajaran" value={year} disabled={busy} options={(meta.data?.years ?? []).map((y) => ({ value: y.id, label: y.is_active ? `${y.nama} (aktif)` : y.nama }))} onChange={(v) => { setYear(v); setChoices({}); setResult(null); }}/>
        {year && <Card><Chips label="Kelas untuk semua siswa di halaman ini" value={bulk} disabled={busy} options={classes.map((k) => ({ value: k.id, label: k.nama }))} onChange={setBulk}/><View style={styles.row}><View style={styles.flex}><Button title="Naikkan semua" compact secondary disabled={busy || !bulk} onPress={() => setChoices((c) => ({ ...c, ...Object.fromEntries(rows.map((x) => [x.id, { action: "NAIK", kelas: bulk } as const])) }))}/></View><View style={styles.flex}><Button title="Luluskan semua" compact secondary disabled={busy} onPress={() => setChoices((c) => ({ ...c, ...Object.fromEntries(rows.map((x) => [x.id, { action: "LULUS" } as const])) }))}/></View></View></Card>}
        {result && <Card><Label strong>{result.sukses} berhasil · {result.gagal} gagal dari {result.total}</Label>{result.baris.filter((b) => b.status === "GAGAL").map((b) => <Label key={b.user_id}>{names.get(b.user_id) ?? `#${b.user_id}`}: {b.pesan}{b.kewajiban.length ? ` — ${b.kewajiban.map((k) => k.keterangan).join("; ")}` : ""}</Label>)}</Card>}
        {students.error && <Notice message={students.error}/>}{students.loading && <Label tone="muted">Memuat siswa…</Label>}
        {year && rows.map((s) => { const c = choices[s.id]; return <Card key={s.id}><Label strong>{s.nama}</Label><Label tone="muted">NIS {s.nip_nis ?? "—"}</Label>
            <Chips label="Tindakan" value={c ? (c.action === "LULUS" ? "LULUS" : c.kelas || "NAIK") : ""} disabled={busy} options={[{ value: "", label: "Lewati" }, { value: "LULUS", label: "Lulus" }, ...classes.map((k) => ({ value: k.id, label: k.nama }))]} onChange={(v) => setChoices((old) => { const n = { ...old }; if (!v) delete n[s.id]; else n[s.id] = v === "LULUS" ? { action: "LULUS" } : { action: "NAIK", kelas: v }; return n; })}/></Card>; })}
        {year && students.data && !rows.length && <EmptyState illustration="empty" title="Belum ada siswa aktif" description="Siswa aktif akan tampil di sini."/>}
        {students.data && students.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={busy || page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{students.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={busy || page >= students.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
    </Screen>;
}

/** MS-82 — padanan P-67: terbitkan password sementara setelah verifikasi identitas, atau tolak beralasan (FR-01.3). */
export function ResetRequestsScreen() {
    const { api, me, can } = useSession(), [status, setStatusFilter] = useState("MENUNGGU"), [page, setPage] = useState(1), [version, setVersion] = useState(0), [pick, setPick] = useState<{ r: ResetRequest; action: "issue" | "reject" } | null>(null), [method, setMethod] = useState<Method | "">(""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [secret, setSecret] = useState<Secret | null>(null);
    const r = useResource(`${me}:reset-requests:${status}:${page}:${version}`, useCallback((s: AbortSignal) => can("user.reset_password") ? loadResetRequests(api, status, page, s) : Promise.resolve(null), [api, status, page, version, me]));
    if (!can("user.reset_password")) return denied("Permintaan Reset Password");
    const act = async () => { if (!pick) return; setBusy(true); setError(null); try { if (pick.action === "issue") { if (!method) throw new Error("Metode verifikasi wajib dipilih."); const h = await issueReset(api, pick.r.id, method); setSecret({ title: `Password untuk ${h.permintaan.pemohon.nama}`, label: "Password sementara", value: h.password_sementara, until: h.permintaan.kedaluwarsa_pada }); } else await rejectReset(api, pick.r.id, reason.trim()); setPick(null); setVersion((v) => v + 1); } catch (e) { setError(message(e, "Permintaan belum diproses.")); } finally { setBusy(false); } };
    return <Screen title="Permintaan Reset Password" subtitle="Verifikasi identitas pemilik akun secara langsung sebelum menerbitkan password sementara.">
        {secret && <SecretPanel secret={secret} onDone={() => setSecret(null)}/>}
        <Chips label="Status" value={status} options={["MENUNGGU", "DITERBITKAN", "DITOLAK", "SELESAI", "KEDALUWARSA"].map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))} onChange={(v) => { setStatusFilter(v); setPage(1); }}/>
        {r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat permintaan…</Label>}
        {r.data?.data.map((x) => <Card key={x.id}><EntityCard icon="keyRound" title={x.pemohon.nama} meta={[x.pemohon.email, `${x.pemohon.nip_nis} · ${x.pemohon.role_kode}`, `Diminta ${formatTime(x.diminta_pada)}`]} statuses={[{ label: x.status.charAt(0) + x.status.slice(1).toLowerCase(), tone: x.status === "MENUNGGU" ? "warning" : x.status === "DITOLAK" ? "error" : "info" }]}/>{x.alasan_penolakan && <Label tone="muted">Alasan: {x.alasan_penolakan}</Label>}
            {x.status === "MENUNGGU" && <View style={styles.row}><View style={styles.flex}><Button icon="keyRound" title="Terbitkan" compact disabled={secret !== null} onPress={() => { setError(null); setMethod(""); setPick({ r: x, action: "issue" }); }}/></View><View style={styles.flex}><Button icon="close" title="Tolak" compact secondary onPress={() => { setError(null); setReason(""); setPick({ r: x, action: "reject" }); }}/></View></View>}</Card>)}
        {r.data && !r.data.data.length && <EmptyState illustration="empty" title="Tidak ada permintaan" description="Permintaan dengan status ini akan tampil di sini."/>}
        {r.data && r.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{r.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= r.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
        <BottomSheet visible={pick !== null} onClose={() => { if (!busy) setPick(null); }} title={pick?.action === "reject" ? "Tolak permintaan reset?" : "Terbitkan password sementara?"}><View style={styles.sheet}>
            <Label>Permintaan {pick?.r.pemohon.nama}. {pick?.action === "issue" ? "Verifikasi identitas pemilik akun sebelum menerbitkan password." : "Pemohon diberi tahu alasan penolakan."}</Label>
            {pick?.action === "issue" ? <Chips label="Metode verifikasi identitas" value={method} options={(Object.keys(METHODS) as Method[]).map((value) => ({ value, label: METHODS[value] }))} onChange={setMethod}/> : <Input label="Alasan penolakan" value={reason} multiline maxLength={500} onChangeText={setReason}/>}
            {error && <Notice message={error}/>}<Button icon="check" title={pick?.action === "reject" ? "Tolak permintaan" : "Terbitkan password"} busy={busy} disabled={pick?.action === "issue" ? !method : !reason.trim()} onPress={() => void act()}/>
        </View></BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: t.space.sm }, flex: { flex: 1 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, sheet: { padding: t.space.md, gap: t.space.md } });

