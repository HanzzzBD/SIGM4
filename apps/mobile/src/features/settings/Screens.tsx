import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { MobileApiError } from "../../shared/api/client";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { shortDate } from "../../shared/wib";
import { BottomSheet, Button, Card, Chips, DateField, EmptyState, EntityCard, Input, Label, Notice, Screen, SectionHeading, StatusBadge, Toggle, tokens as t } from "../../shared/ui";
import { DAYS, GROUPS, HOLIDAY_TYPES, IMPACT, UNIT_TYPES, activateYear, deleteHoliday, holidayBody, loadHolidays, loadMaterialUnits, loadParameters, loadUnits, loadWorkDays, loadYears, materialUnitBody, parameterChanges, saveHoliday, saveParameters, saveUnit, saveWorkDays, saveYear, setUnitStatus, shownValue, unitBody, writeMaterialUnit, yearBody, yearForm } from "./model";
import type { Group, Holiday, Unit, Year, YearForm } from "./model";

const useSession = () => { const { api, state } = useAuth(); const perms = state.kind === "READY" ? state.session.permissions : {}; return { api, account: state.kind === "READY" ? state.session.user.id : "", role: state.kind === "READY" ? state.session.user.role_kode : "", can: (p: string) => Object.hasOwn(perms, p) }; };
const denied = (title: string) => <Screen title={title}><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat pengaturan."/></Screen>;
const message = (e: unknown, fallback: string) => e instanceof MobileApiError && e.details.length ? e.details.map((d) => d.message).join(" ") : e instanceof Error ? e.message : fallback;
const fieldErrors = (e: unknown) => e instanceof MobileApiError ? Object.fromEntries(e.details.map((d) => [d.field.replace(/^settings\./, ""), d.message])) : {};
const SettingsNav = ({ at }: { at: "parameter" | "kalender" | "unit" }) => <View style={styles.wrap}>{([["parameter", "Parameter", "/pengaturan"], ["kalender", "Kalender Akademik", "/pengaturan/kalender-akademik"], ["unit", "Unit Kerja", "/pengaturan/unit-kerja"]] as const).map(([k, l, p]) => <Button key={k} title={l} compact secondary={k !== at} onPress={() => { if (k !== at) router.replace(p as "/scan"); }}/>)}</View>;

function MaterialUnitsPanel() {
    const { api, account, role, can } = useSession(), admin = role === "R-01" && can("setting.manage"), [version, setVersion] = useState(0), [nama, setNama] = useState(""), [simbol, setSimbol] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), key = useRef<{ b: string; k: string } | null>(null);
    const r = useResource(`${account}:material-units:${version}`, useCallback((s: AbortSignal) => loadMaterialUnits(api, s), [api, version]));
    const write = async (path: string, method: "post" | "patch", body: unknown) => { const b = JSON.stringify([path, body]); if (key.current?.b !== b) key.current = { b, k: randomUUID() }; setBusy(true); setError(null); try { await writeMaterialUnit(api, path, method, body, key.current.k); key.current = null; setNama(""); setSimbol(""); setNote(""); setVersion((v) => v + 1); } catch (e) { setError(message(e, "Satuan belum tersimpan.")); } finally { setBusy(false); } };
    return <View style={styles.block}><Label tone="muted">Satuan nonaktif tidak dapat dipilih untuk bahan baru; saldo dan riwayat lama tetap memakai satuannya.</Label>
        {admin && <Card><Input label="Nama satuan" value={nama} maxLength={50} onChangeText={setNama}/><Input label="Simbol" value={simbol} maxLength={20} onChangeText={setSimbol}/><Input label="Keterangan (opsional)" value={note} onChangeText={setNote}/><Button icon="plus" title="Tambah satuan" busy={busy} onPress={() => { const b = materialUnitBody(nama, simbol, note); if ("error" in b) setError(b.error); else void write("/material-units", "post", b.body); }}/></Card>}
        {error && <Notice message={error}/>}{r.error && <Notice message={r.error}/>}
        {r.data?.map((u) => <EntityCard key={u.id} icon="boxes" title={`${u.nama} (${u.simbol})`} meta={[u.keterangan]} statuses={[{ label: u.status === "AKTIF" ? "Aktif" : "Nonaktif", tone: u.status === "AKTIF" ? "success" : "pending" }]} {...(admin ? { onPress: () => void write(`/material-units/${u.id}/status`, "patch", { status: u.status === "AKTIF" ? "NONAKTIF" : "AKTIF" }) } : {})}/>)}
        {admin && (r.data?.length ?? 0) > 0 && <Label tone="muted">Ketuk satuan untuk mengaktifkan atau menonaktifkannya.</Label>}
    </View>;
}

/** MS-85 — padanan P-70: parameter per kelompok + tab Satuan Bahan; dampak kode aset & denda diperingatkan (FR-20.1). */
export function ParameterScreen() {
    const { api, account, can } = useSession(), editable = can("setting.manage"), [group, setGroup] = useState<Group | "SATUAN">("IDENTITAS_SEKOLAH"), [draft, setDraft] = useState<Record<string, string | boolean>>({}), [errors, setErrors] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [confirm, setConfirm] = useState<Record<string, unknown> | null>(null), [version, setVersion] = useState(0);
    const r = useResource(`${account}:settings:${group}:${version}`, useCallback((s: AbortSignal) => can("setting.view") && group !== "SATUAN" ? loadParameters(api, group, s) : Promise.resolve(null), [api, group, version, account]));
    if (!can("setting.view")) return denied("Parameter Sistem");
    const params = r.data ?? [];
    const send = async (settings: Record<string, unknown>) => { setBusy(true); setError(null); try { await saveParameters(api, settings); setDraft({}); setConfirm(null); setVersion((v) => v + 1); setNotice(`Perubahan ${GROUPS[group as Group]} tersimpan dan berlaku pada transaksi berikutnya.`); } catch (e) { setErrors(fieldErrors(e)); setError(message(e, "Parameter belum tersimpan.")); setConfirm(null); } finally { setBusy(false); } };
    const submit = () => { const c = parameterChanges(params, draft); if ("errors" in c) { setErrors(c.errors); return; } setErrors({}); if (!Object.keys(c.settings).length) return; if (group !== "SATUAN" && IMPACT[group]) setConfirm(c.settings); else void send(c.settings); };
    const dirty = params.some((p) => p.key in draft && draft[p.key] !== shownValue(p));
    return <Screen title="Parameter Sistem" subtitle="Perubahan berlaku pada transaksi berikutnya; transaksi yang sudah berjalan memakai nilai tersimpan." {...(editable && group !== "SATUAN" ? { footer: <Button icon="check" title="Simpan perubahan" busy={busy} disabled={!dirty} onPress={submit}/> } : {})}>
        <SettingsNav at="parameter"/>
        <Chips label="Kelompok" value={group} options={[...(Object.keys(GROUPS) as Group[]).map((g) => ({ value: g, label: GROUPS[g] })), { value: "SATUAN" as const, label: "Satuan Bahan" }]} onChange={(g) => { setGroup(g); setDraft({}); setErrors({}); setNotice(null); setError(null); }}/>
        {!editable && <Notice tone="info" message="Anda dapat melihat parameter, tetapi tidak dapat mengubahnya (butuh setting.manage)."/>}
        {notice && <Notice tone="success" message={notice}/>}{error && <Notice message={error}/>}
        {group === "SATUAN" ? <MaterialUnitsPanel/> : <>
            {IMPACT[group] && <Notice tone="info" message={IMPACT[group]!}/>}
            {r.loading && <Label tone="muted">Memuat parameter…</Label>}{r.error && <Notice message={r.error}/>}
            {params.map((p) => { const v = draft[p.key] ?? shownValue(p), range = p.nilai_min !== null || p.nilai_maks !== null ? `Rentang ${p.nilai_min ?? "—"} – ${p.nilai_maks ?? "—"}. ` : ""; return <Card key={p.key}>
                {p.tipe === "BOOLEAN" ? <Toggle label={p.deskripsi} value={v === true} disabled={!editable} onChange={(on) => setDraft({ ...draft, [p.key]: on })}/> : <Input label={p.deskripsi} value={String(v)} editable={editable} keyboardType={p.tipe === "TEKS" ? "default" : p.tipe === "DESIMAL" ? "decimal-pad" : "number-pad"} multiline={p.tipe === "TEKS"} onChangeText={(x) => setDraft({ ...draft, [p.key]: x })}/>}
                {errors[p.key] && <Notice message={errors[p.key]!}/>}<Label tone="muted">{range}Diubah {formatTime(p.updated_at)}{p.updated_by ? ` oleh ${p.updated_by}` : ""}.</Label>
            </Card>; })}
        </>}
        <BottomSheet visible={confirm !== null} onClose={() => { if (!busy) setConfirm(null); }} title="Simpan perubahan parameter?"><View style={styles.sheet}><Label>{group !== "SATUAN" ? IMPACT[group] : ""}</Label><Button icon="check" title="Simpan" busy={busy} onPress={() => void send(confirm!)}/></View></BottomSheet>
    </Screen>;
}

function YearSheet({ year, onClose, onSaved }: { year: Year | "new" | null; onClose: () => void; onSaved: () => void }) {
    const { api } = useSession(), [f, setF] = useState<YearForm>(yearForm(year && year !== "new" ? year : undefined)), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const save = async () => { const b = yearBody(f); if ("error" in b) { setError(b.error); return; } setBusy(true); setError(null); try { await saveYear(api, year && year !== "new" ? year.id : null, b.body); onSaved(); } catch (e) { setError(message(e, "Tahun ajaran belum tersimpan.")); } finally { setBusy(false); } };
    return <BottomSheet visible={year !== null} full onClose={() => { if (!busy) onClose(); }} title={year === "new" ? "Tambah tahun ajaran" : "Ubah tahun ajaran"}><View style={styles.sheet}>
        <Input label="Nama (mis. 2026/2027)" value={f.nama} maxLength={20} onChangeText={(nama) => setF({ ...f, nama })}/>
        <DateField label="Mulai tahun ajaran" value={f.start} onChange={(start) => setF({ ...f, start })}/><DateField label="Selesai tahun ajaran" value={f.end} onChange={(end) => setF({ ...f, end })}/>
        <Label strong>Semester Ganjil</Label><DateField label="Mulai" value={f.ganjil[0]} onChange={(v) => setF({ ...f, ganjil: [v, f.ganjil[1]] })}/><DateField label="Selesai" value={f.ganjil[1]} onChange={(v) => setF({ ...f, ganjil: [f.ganjil[0], v] })}/>
        <Label strong>Semester Genap</Label><DateField label="Mulai" value={f.genap[0]} onChange={(v) => setF({ ...f, genap: [v, f.genap[1]] })}/><DateField label="Selesai" value={f.genap[1]} onChange={(v) => setF({ ...f, genap: [f.genap[0], v] })}/>
        {error && <Notice message={error}/>}<Button icon="check" title="Simpan tahun ajaran" busy={busy} onPress={() => void save()}/>
    </View></BottomSheet>;
}
function HolidaySheet({ holiday, years, onClose, onSaved }: { holiday: Holiday | "new" | null; years: readonly Year[]; onClose: () => void; onSaved: () => void }) {
    const { api } = useSession(), h = holiday && holiday !== "new" ? holiday : null, [f, setF] = useState({ tanggal: h?.tanggal.slice(0, 10) ?? "", nama: h?.nama ?? "", jenis: h?.jenis ?? "SEKOLAH" as keyof typeof HOLIDAY_TYPES, year: h?.academic_year_id ?? "" }), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); onSaved(); } catch (e) { setError(message(e, "Hari libur belum tersimpan.")); } finally { setBusy(false); } };
    return <BottomSheet visible={holiday !== null} onClose={() => { if (!busy) onClose(); }} title={h ? "Ubah hari libur" : "Tambah hari libur"}><View style={styles.sheet}>
        <DateField label="Tanggal" value={f.tanggal} onChange={(tanggal) => setF({ ...f, tanggal })}/><Input label="Nama" value={f.nama} maxLength={150} onChangeText={(nama) => setF({ ...f, nama })}/>
        <Chips label="Jenis" value={f.jenis} options={(Object.keys(HOLIDAY_TYPES) as (keyof typeof HOLIDAY_TYPES)[]).map((value) => ({ value, label: HOLIDAY_TYPES[value] }))} onChange={(jenis) => setF({ ...f, jenis })}/>
        <Chips label="Tahun ajaran" value={f.year} options={[{ value: "", label: "Berlaku umum" }, ...years.map((y) => ({ value: y.id, label: y.nama }))]} onChange={(year) => setF({ ...f, year })}/>
        {error && <Notice message={error}/>}<Button icon="check" title="Simpan" busy={busy} onPress={() => { const b = holidayBody(f); if ("error" in b) setError(b.error); else void run(() => saveHoliday(api, h?.id ?? null, b.body)); }}/>
        {h && <Button icon="close" title="Hapus hari libur" secondary disabled={busy} onPress={() => void run(() => deleteHoliday(api, h.id))}/>}<Label tone="muted">Tanggal yang dihapus kembali dihitung sebagai hari kerja bila jatuh pada hari kerja sekolah.</Label>
    </View></BottomSheet>;
}

/** MS-86 — padanan P-71: tahun ajaran & semester, tepat satu aktif (AC-YR-01/02), hari libur, hari kerja sekolah (FR-20.2). */
export function CalendarScreen() {
    const { api, account, can } = useSession(), editable = can("setting.manage"), [version, setVersion] = useState(0), [selected, setSelected] = useState(""), [yearSheet, setYearSheet] = useState<Year | "new" | null>(null), [holidaySheet, setHolidaySheet] = useState<Holiday | "new" | null>(null), [days, setDays] = useState<Record<number, boolean> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
    const data = useResource(`${account}:calendar:${version}`, useCallback(async (s: AbortSignal) => can("setting.view") ? { years: await loadYears(api, s), holidays: await loadHolidays(api, s), days: await loadWorkDays(api, s) } : null, [api, version, account]));
    if (!can("setting.view")) return denied("Kalender Akademik");
    const years = data.data?.years ?? [], year = years.find((y) => y.id === selected) ?? years.find((y) => y.is_active) ?? years[0];
    const holidays = (data.data?.holidays ?? []).filter((h) => h.academic_year_id === null || h.academic_year_id === year?.id).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    const work = days ?? Object.fromEntries((data.data?.days ?? []).map((d) => [d.hari, d.aktif]));
    const done = (msg: string) => { setYearSheet(null); setHolidaySheet(null); setVersion((v) => v + 1); setNotice(msg); };
    const run = async (fn: () => Promise<unknown>, msg: string) => { setBusy(true); setError(null); try { await fn(); done(msg); } catch (e) { setError(message(e, "Perubahan belum tersimpan.")); } finally { setBusy(false); } };
    return <Screen title="Kalender Akademik" subtitle="Tahun ajaran, semester, hari libur, dan hari kerja sekolah. Tepat satu tahun ajaran aktif.">
        <SettingsNav at="kalender"/>{notice && <Notice tone="success" message={notice}/>}{error && <Notice message={error}/>}{data.error && <Notice message={data.error}/>}{data.loading && <Label tone="muted">Memuat kalender…</Label>}
        <SectionHeading title="Tahun ajaran" {...(editable ? { action: <Button icon="plus" title="Tambah" compact secondary onPress={() => setYearSheet("new")}/> } : {})}/>
        {data.data && !years.length && <EmptyState illustration="empty" title="Belum ada tahun ajaran" description="Tahun ajaran pertama otomatis menjadi tahun ajaran aktif."/>}
        {years.length > 1 && <Chips label="Tampilkan" value={year?.id ?? ""} options={years.map((y) => ({ value: y.id, label: y.is_active ? `${y.nama} (aktif)` : y.nama }))} onChange={setSelected}/>}
        {year && <Card><EntityCard icon="calendarDays" title={year.nama} meta={[`${shortDate(year.tanggal_mulai.slice(0, 10))} – ${shortDate(year.tanggal_selesai.slice(0, 10))}`, ...year.semester.map((s) => `${s.nama === "GANJIL" ? "Ganjil" : "Genap"}: ${shortDate(s.tanggal_mulai.slice(0, 10))} – ${shortDate(s.tanggal_selesai.slice(0, 10))}`)]} statuses={year.is_active ? [{ label: "Aktif", tone: "success" }] : []}/>
            {editable && <View style={styles.wrap}><Button icon="settings" title="Ubah" compact secondary onPress={() => setYearSheet(year)}/>{!year.is_active && <Button icon="checkCircle" title="Jadikan aktif" compact secondary busy={busy} onPress={() => void run(() => activateYear(api, year.id), `${year.nama} kini tahun ajaran aktif.`)}/>}</View>}</Card>}
        <SectionHeading title="Hari libur" {...(editable ? { action: <Button icon="plus" title="Tambah" compact secondary onPress={() => setHolidaySheet("new")}/> } : {})}/>
        {holidays.map((h) => <EntityCard key={h.id} icon="calendar" title={h.nama} meta={[shortDate(h.tanggal.slice(0, 10)), h.academic_year_id === null ? "Berlaku umum" : year?.nama]} statuses={[{ label: HOLIDAY_TYPES[h.jenis], tone: "info" }]} {...(editable ? { onPress: () => setHolidaySheet(h) } : {})}/>)}
        {data.data && !holidays.length && <Label tone="muted">Belum ada hari libur.</Label>}
        <SectionHeading title="Hari kerja sekolah"/>
        <Card>{DAYS.map((d, i) => <Toggle key={d} label={d} value={work[i + 1] === true} disabled={!editable} onChange={(on) => setDays({ ...work, [i + 1]: on })}/>)}
            {editable && <Button icon="check" title="Simpan hari kerja" compact busy={busy} disabled={days === null} onPress={() => void run(async () => { await saveWorkDays(api, DAYS.map((_d, i) => ({ hari: i + 1, aktif: work[i + 1] === true }))); setDays(null); }, "Hari kerja sekolah tersimpan.")}/>}</Card>
        {yearSheet !== null && <YearSheet year={yearSheet} onClose={() => setYearSheet(null)} onSaved={() => done("Tahun ajaran tersimpan.")}/>}
        {holidaySheet !== null && <HolidaySheet holiday={holidaySheet} years={years} onClose={() => setHolidaySheet(null)} onSaved={() => done("Hari libur tersimpan.")}/>}
    </Screen>;
}

/** MS-87 — padanan P-72: unit kerja per jenis & status; penugasan lama ke unit nonaktif tetap sah (WU-02). */
export function WorkUnitScreen() {
    const { api, account, can } = useSession(), editable = can("setting.manage"), [jenis, setJenis] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1), [version, setVersion] = useState(0), [edit, setEdit] = useState<Unit | "new" | null>(null), [f, setF] = useState({ nama: "", kode: "", jenis: "MANAJEMEN" as keyof typeof UNIT_TYPES }), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const r = useResource(`${account}:units:${jenis}:${status}:${page}:${version}`, useCallback((s: AbortSignal) => can("setting.view") ? loadUnits(api, { page, jenis, status }, s) : Promise.resolve(null), [api, page, jenis, status, version, account]));
    if (!can("setting.view")) return denied("Unit Kerja");
    const open = (u: Unit | "new") => { setError(null); setF(u === "new" ? { nama: "", kode: "", jenis: "MANAJEMEN" } : { nama: u.nama, kode: u.kode, jenis: u.jenis }); setEdit(u); };
    const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); setEdit(null); setVersion((v) => v + 1); } catch (e) { setError(message(e, "Unit kerja belum tersimpan.")); } finally { setBusy(false); } };
    const u = edit && edit !== "new" ? edit : null;
    return <Screen title="Unit Kerja" subtitle="Unit nonaktif tidak dapat dipilih untuk penugasan baru; penugasan lama tetap sah." {...(editable ? { footer: <Button icon="plus" title="Tambah unit kerja" onPress={() => open("new")}/> } : {})}>
        <SettingsNav at="unit"/>
        <Chips label="Jenis" value={jenis} options={[{ value: "", label: "Semua" }, ...(Object.keys(UNIT_TYPES) as (keyof typeof UNIT_TYPES)[]).map((value) => ({ value, label: UNIT_TYPES[value] }))]} onChange={(v) => { setJenis(v); setPage(1); }}/>
        <Chips label="Status" value={status} options={[{ value: "", label: "Semua" }, { value: "AKTIF", label: "Aktif" }, { value: "NONAKTIF", label: "Nonaktif" }]} onChange={(v) => { setStatus(v); setPage(1); }}/>
        {r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat unit kerja…</Label>}
        {r.data?.data.map((x) => <EntityCard key={x.id} icon="users" title={x.nama} meta={[`${x.kode} · ${UNIT_TYPES[x.jenis]}`]} statuses={[{ label: x.status === "AKTIF" ? "Aktif" : "Nonaktif", tone: x.status === "AKTIF" ? "success" : "pending" }]} {...(editable ? { onPress: () => open(x) } : {})}/>)}
        {r.data && !r.data.data.length && <EmptyState illustration="empty" title="Tidak ada unit kerja" description="Ubah saringan atau tambah unit kerja."/>}
        {r.data && r.data.meta.total_pages > 1 && <View style={styles.row}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1} onPress={() => setPage(page - 1)}/><Label tone="muted">{page}/{r.data.meta.total_pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= r.data.meta.total_pages} onPress={() => setPage(page + 1)}/></View>}
        <BottomSheet visible={edit !== null} onClose={() => { if (!busy) setEdit(null); }} title={u ? `Ubah ${u.nama}` : "Tambah unit kerja"}><View style={styles.sheet}>
            <Input label="Nama unit" value={f.nama} maxLength={150} onChangeText={(nama) => setF({ ...f, nama })}/><Input label="Kode" value={f.kode} maxLength={20} autoCapitalize="characters" onChangeText={(kode) => setF({ ...f, kode })}/>
            <Chips label="Jenis" value={f.jenis} options={(Object.keys(UNIT_TYPES) as (keyof typeof UNIT_TYPES)[]).map((value) => ({ value, label: UNIT_TYPES[value] }))} onChange={(v) => setF({ ...f, jenis: v })}/>
            {error && <Notice message={error}/>}<Button icon="check" title="Simpan" busy={busy} onPress={() => { const b = unitBody(f, u ?? undefined); if ("error" in b) setError(b.error); else void run(() => saveUnit(api, u?.id ?? null, b.body)); }}/>
            {u && <Button icon={u.status === "AKTIF" ? "circleX" : "checkCircle"} title={u.status === "AKTIF" ? "Nonaktifkan unit" : "Aktifkan unit"} secondary disabled={busy} onPress={() => void run(() => setUnitStatus(api, u.id, u.status === "AKTIF" ? "NONAKTIF" : "AKTIF"))}/>}
            {u && <StatusBadge label={u.status === "AKTIF" ? "Aktif" : "Nonaktif"} tone={u.status === "AKTIF" ? "success" : "pending"}/>}
        </View></BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: t.space.sm }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, block: { gap: t.space.sm }, sheet: { padding: t.space.md, gap: t.space.md } });
