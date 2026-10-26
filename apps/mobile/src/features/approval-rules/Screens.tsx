import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { FIELD_DSL, JENIS_PENGAJUAN, KEDALAMAN_GRUP_MAKS, LABEL_JENIS_PENGAJUAN, OPERATOR_PER_TIPE, fieldBerlaku } from "@sigm4/schemas";
import type { JenisPengajuan, Operator } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { BottomSheet, Button, Card, Chips, EmptyState, EntityCard, Input, Label, Notice, Screen, SectionHeading, StatusBadge, tokens as t } from "../../shared/ui";
import { BREACH_LABEL, FIELD_LABEL, OPERATOR_LABEL, TERMINAL_LABEL, checkModel, conditionCount, definitionErrors, emptyApprover, emptyGroup, loadApproverRoles, loadRules, loadUserBrief, modelFrom, newPredicate, newStep, runPreview, saveRule, setRuleStatus, sortRules, swap, toDefinition, userIds } from "./model";
import type { Errors, Group, Node, Predicate, PreviewResult, RuleModel, SavedRule, StepModel, Terminal } from "./model";
import { ApproverPicker, RequesterPicker, UserPicker, ValueInput } from "./pickers";
import type { ApproverRole } from "./pickers";

const useSession = () => { const { api, state } = useAuth(); const perms = state.kind === "READY" ? state.session.permissions : {}; return { api, account: state.kind === "READY" ? state.session.user.id : "", can: (p: string) => Object.hasOwn(perms, p) }; };
const label = (j: JenisPengajuan) => (LABEL_JENIS_PENGAJUAN as Readonly<Record<string, string>>)[j] ?? j;
const message = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;
const STEP_MAX = 10;

/** MS-83 — padanan P-68: aturan per jenis pengajuan urut RE-04; aturan bawaan sebagai baris terkunci (BR-036, RE-06). */
export function RuleListScreen() {
    const { api, account, can } = useSession(), manage = can("approval_rule.manage"), { disimpan } = useLocalSearchParams<{ disimpan?: string }>();
    const r = useResource(`${account}:approval-rules`, useCallback((s: AbortSignal) => can("approval_rule.view") ? loadRules(api, s) : Promise.resolve(null), [api, account]));
    if (!can("approval_rule.view")) return <Screen title="Approval Rules"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin melihat approval rule."/></Screen>;
    const rules = sortRules(r.data ?? []);
    return <Screen title="Approval Rules" subtitle="Bila beberapa aturan cocok, prioritas terbesar dipakai. Instance berjalan tetap memakai snapshot lama." {...(manage ? { footer: <Button icon="plus" title="Buat aturan" onPress={() => router.push("/approval-rules/baru" as "/scan")}/> } : {})}>
        {disimpan && /^d+$/.test(disimpan) && <Notice tone="success" message={`Approval rule #${disimpan} tersimpan dan berlaku pada pengajuan berikutnya.`}/>}
        {r.error && <Notice message={r.error}/>}{r.loading && <Label tone="muted">Memuat approval rule…</Label>}
        {JENIS_PENGAJUAN.map((j) => <View key={j} style={styles.block}><SectionHeading title={label(j)}/>
            {rules.filter((x) => x.jenis_pengajuan === j).map((x) => { const n = conditionCount(x.kondisi); return <EntityCard key={x.id} icon="workflow" title={`Aturan #${x.id}`} meta={[`Prioritas ${x.prioritas} · versi ${x.versi}`, `${n === 0 ? "Selalu cocok" : `${n} syarat`} · ${x.steps.length} langkah`]} statuses={[{ label: x.status_aktif ? "Aktif" : "Nonaktif", tone: x.status_aktif ? "success" : "pending" }]} {...(manage ? { onPress: () => router.push(`/approval-rules/${x.id}` as "/scan") } : {})}/>; })}
            <EntityCard icon="lock" title="Aturan bawaan" meta={["Berlaku bila tidak ada aturan yang cocok (BR-036)"]} statuses={[{ label: "Terkunci", tone: "pending" }]}/>
        </View>)}
    </Screen>;
}

interface Ctx { jenis: JenisPengajuan; errors: Errors; roles: readonly ApproverRole[] }
function PredicateCard({ node, path, ctx, onChange, onRemove }: { node: Predicate; path: string; ctx: Ctx; onChange: (n: Predicate) => void; onRemove: () => void }) {
    const fields = fieldBerlaku(ctx.jenis), invalid = !fields.includes(node.field), type = FIELD_DSL[node.field]?.tipe;
    const fieldError = ctx.errors[`${path}.field`] ?? (invalid ? "Field ini tidak berlaku bagi jenis pengajuan terpilih — ganti atau hapus syarat ini." : undefined);
    return <Card><Chips label="Field" value={node.field} options={[...fields, ...(invalid ? [node.field] : [])].map((f) => ({ value: f, label: `${FIELD_LABEL[f] ?? f}${fields.includes(f) ? "" : " (tidak berlaku)"}` }))} onChange={(field) => onChange(newPredicate(field))}/>{fieldError && <Notice message={fieldError}/>}
        <Chips label="Operator" value={node.op} options={(type === undefined ? [] : OPERATOR_PER_TIPE[type]).map((o) => ({ value: o, label: OPERATOR_LABEL[o] }))} onChange={(op: Operator) => onChange({ kind: "predikat", key: node.key, field: node.field, op })}/>{ctx.errors[`${path}.op`] && <Notice message={ctx.errors[`${path}.op`]!}/>}
        <ValueInput key={`${node.key}:${node.op}`} field={node.field} op={node.op} value={node.value} roles={ctx.roles} error={ctx.errors[`${path}.value`] ?? ctx.errors[path]} onChange={(v) => onChange(v === undefined ? { kind: "predikat", key: node.key, field: node.field, op: node.op } : { ...node, value: v })}/>
        <Button icon="close" title="Hapus syarat" compact secondary onPress={onRemove}/></Card>;
}
/** Grup AND/OR bersarang; grup tingkat keempat tidak ditawarkan (D.1). */
function GroupEditor({ node, path, level, ctx, onChange, onRemove }: { node: Group; path: string; level: number; ctx: Ctx; onChange: (n: Group) => void; onRemove?: () => void }) {
    const set = (i: number, n: Node | null) => onChange({ ...node, children: n === null ? node.children.filter((_x, j) => j !== i) : node.children.map((x, j) => j === i ? n : x) });
    const first = fieldBerlaku(ctx.jenis)[0] ?? "requester_role", error = ctx.errors[path] ?? ctx.errors[`${path}.conditions`];
    return <View style={[styles.group, level > 1 && styles.nested]}>
        <Label strong>{level === 1 ? "Kondisi aturan" : `Grup tingkat ${level}`}</Label>
        <Chips label="Gabungan syarat" value={node.operator} options={[{ value: "AND", label: "Semua terpenuhi (AND)" }, { value: "OR", label: "Salah satu terpenuhi (OR)" }]} onChange={(operator) => onChange({ ...node, operator })}/>
        {error && <Notice message={error}/>}
        {node.children.length === 0 && <Label tone="muted">{level === 1 ? "Tanpa syarat — aturan ini cocok untuk setiap pengajuan berjenis ini." : "Grup kosong — tambahkan syarat atau hapus grup ini."}</Label>}
        {node.children.map((c, i) => { const p = `${path}.conditions.${i}`; return c.kind === "grup" ? <GroupEditor key={c.key} node={c} path={p} level={level + 1} ctx={ctx} onChange={(n) => set(i, n)} onRemove={() => set(i, null)}/> : <PredicateCard key={c.key} node={c} path={p} ctx={ctx} onChange={(n) => set(i, n)} onRemove={() => set(i, null)}/>; })}
        <View style={styles.wrap}><Button icon="plus" title="Tambah syarat" compact secondary onPress={() => onChange({ ...node, children: [...node.children, newPredicate(first)] })}/>
            {level < KEDALAMAN_GRUP_MAKS && <Button icon="plus" title="Tambah grup" compact secondary onPress={() => onChange({ ...node, children: [...node.children, emptyGroup(node.operator === "AND" ? "OR" : "AND")] })}/>}
            {onRemove && <Button icon="close" title="Hapus grup" compact secondary onPress={onRemove}/>}</View>
    </View>;
}
function StepsEditor({ steps, onChange, errors, roles }: { steps: StepModel[]; onChange: (s: StepModel[]) => void; errors: Errors; roles: readonly ApproverRole[] }) {
    const set = (i: number, l: StepModel) => onChange(steps.map((x, j) => j === i ? l : x));
    return <View style={styles.block}><SectionHeading title="Langkah persetujuan"/>{errors["steps"] && <Notice message={errors["steps"]}/>}
        {steps.map((l, i) => { const p = `steps.${i}.`; return <Card key={l.key}><Label strong>Langkah {i + 1}</Label>
            <ApproverPicker legend="Approver" path={p} value={l.approver} errors={errors} roles={roles} onChange={(a) => set(i, { ...l, approver: a ?? emptyApprover() })}/>
            <Input label="SLA (jam kerja, 1–720)" value={l.sla} keyboardType="number-pad" onChangeText={(sla) => set(i, { ...l, sla })}/>{errors[`${p}sla_hours`] && <Notice message={errors[`${p}sla_hours`]!}/>}
            <Chips label="Bila SLA terlampaui" value={l.breach} options={(["remind", "escalate"] as const).map((x) => ({ value: x, label: BREACH_LABEL[x] }))} onChange={(breach) => set(i, { ...l, breach, escalate: null })}/>
            {l.breach === "escalate" && <UserPicker label="Eskalasi ke" value={l.escalate} roles={roles} error={errors[`${p}escalate_to_user_id`]} onChange={(escalate) => set(i, { ...l, escalate })}/>}
            <View style={styles.wrap}><Button icon="arrowLeft" title="Naikkan" compact secondary disabled={i === 0} onPress={() => onChange(swap(steps, i, i - 1))}/><Button icon="arrowRight" title="Turunkan" compact secondary disabled={i === steps.length - 1} onPress={() => onChange(swap(steps, i, i + 1))}/><Button icon="close" title="Hapus" compact secondary disabled={steps.length === 1} onPress={() => onChange(steps.filter((_x, j) => j !== i))}/></View>
        </Card>; })}
        {steps.length < STEP_MAX && <Button icon="plus" title="Tambah langkah" secondary onPress={() => onChange([...steps, newStep()])}/>}
    </View>;
}

function PreviewPanel({ model, id, roles, onErrors }: { model: RuleModel; id: number | null; roles: readonly ApproverRole[]; onErrors: (g: Errors) => void }) {
    const { api, account } = useSession(), [facts, setFacts] = useState<Record<string, unknown>>({}), [requester, setRequester] = useState<number | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [result, setResult] = useState<{ r: PreviewResult; ran: string } | null>(null);
    const ids = userIds(model).join(",");
    // RE-13: approver bertipe pengguna yang kini nonaktif — peringatan, bukan penghalang simpan.
    const inactive = useResource(`${account}:rule-inactive:${ids}`, useCallback(async (s: AbortSignal) => (await Promise.all(userIds(model).map((u) => loadUserBrief(api, u, s).catch(() => null)))).filter((u) => u && u.status !== "AKTIF").map((u) => u!.nama), [api, ids]));
    const current = JSON.stringify(toDefinition(model));
    const run = async () => { const g = checkModel(model); onErrors(g); if (Object.keys(g).length) return; setBusy(true); setError(null); try { const fields = fieldBerlaku(model.jenis); const fakta = Object.fromEntries(Object.entries(facts).filter(([f, v]) => v !== undefined && fields.includes(f))); const r = await runPreview(api, { jenis_pengajuan: model.jenis, fakta: requester === null ? fakta : { ...fakta, requester_id: requester }, ...(requester === null ? {} : { pemohon_id: requester }), aturan_draf: { ...toDefinition(model), ...(id === null ? {} : { id }) } }); setResult({ r, ran: current }); onErrors({}); } catch (e) { const d = definitionErrors(e); if (d) onErrors(d); setError(d ? "Aturan belum valid — periksa isian yang ditandai." : message(e, "Pratinjau belum dapat dijalankan.")); } finally { setBusy(false); } };
    const name = (x: { rule_id: number | null; draf: boolean }) => x.draf ? "Aturan yang sedang disusun ini" : `Aturan #${x.rule_id}`;
    return <Card><Label strong>Pratinjau</Label><Label tone="muted">Isi skenario pengajuan contoh. Isian kosong dianggap tidak diketahui.</Label>
        {(inactive.data?.length ?? 0) > 0 && <Notice tone="info" message={`${inactive.data!.join(", ")} sedang nonaktif — langkahnya akan dilewati saat pengajuan. Aturan tetap dapat disimpan.`}/>}
        <RequesterPicker value={requester} onChange={setRequester}/>
        {fieldBerlaku(model.jenis).filter((f) => f !== "requester_id").map((f) => <ValueInput key={`${model.jenis}:${f}`} label={FIELD_LABEL[f] ?? f} field={f} op={FIELD_DSL[f]?.tipe === "integer_array" ? "in" : "eq"} value={facts[f]} roles={roles} onChange={(v) => setFacts((x) => ({ ...x, [f]: v }))}/>)}
        <Button icon="refresh" title="Jalankan pratinjau" secondary busy={busy} onPress={() => void run()}/>{error && <Notice message={error}/>}
        {result && <>{result.ran !== current && <Notice tone="info" message="Aturan telah berubah sejak pratinjau ini — jalankan ulang."/>}
            <Label strong>Aturan terpilih: {result.r.terpilih.bawaan ? "aturan bawaan — tidak ada yang cocok" : `${name(result.r.terpilih)} · prioritas ${result.r.terpilih.prioritas}`}</Label>
            <Label tone="muted">Cocok: {result.r.cocok.length ? result.r.cocok.map((c) => `${name(c)} (${c.prioritas})`).join("; ") : "tidak ada"}</Label>
            {result.r.langkah.map((l) => <EntityCard key={l.urutan} icon="badgeCheck" title={`Langkah ${l.urutan}: ${l.approver.tipe === "role" ? l.approver.role?.nama ?? "Role tidak dikenal" : l.approver.user?.nama ?? "Pengguna tidak dikenal"}`} meta={[`SLA ${l.sla_jam} jam · ${BREACH_LABEL[l.on_sla_breach]}${l.eskalasi_ke ? ` · eskalasi ke ${l.eskalasi_ke.nama ?? "pengguna"}` : ""}`]} statuses={[...(l.fallback ? [{ label: "Approver cadangan", tone: "info" as const }] : []), ...(l.akan_dilewati ? [{ label: `Dilewati — ${l.akan_dilewati}`, tone: "warning" as const }] : [])]}/>)}</>}
    </Card>;
}

function Editor({ initial, roles }: { initial: SavedRule | null; roles: readonly ApproverRole[] }) {
    const { api } = useSession(), [m, setM] = useState<RuleModel>(() => modelFrom(initial)), [errors, setErrors] = useState<Errors>({}), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [rule, setRule] = useState(initial), [statusSheet, setStatusSheet] = useState(false), [reason, setReason] = useState(""), [notice, setNotice] = useState<string | null>(null);
    const set = (p: Partial<RuleModel>) => { setM({ ...m, ...p }); setNotice(null); };
    const save = async () => { const g = checkModel(m); setErrors(g); if (Object.keys(g).length) { setError("Periksa isian yang ditandai."); return; } setBusy(true); setError(null); try { const a = await saveRule(api, rule?.id ?? null, toDefinition(m)); router.replace(`/approval-rules?disimpan=${a.id}` as "/scan"); } catch (e) { const d = definitionErrors(e); if (d) setErrors(d); setError(d ? `Aturan belum valid: ${Object.keys(d).length} isian bermasalah.` : message(e, "Aturan belum tersimpan.")); } finally { setBusy(false); } };
    const status = async () => { if (!rule) return; setBusy(true); setError(null); try { const a = await setRuleStatus(api, rule.id, !rule.status_aktif, rule.status_aktif ? reason.trim() : undefined); setRule(a); setStatusSheet(false); setNotice(a.status_aktif ? "Aturan diaktifkan kembali." : "Aturan dinonaktifkan. Instance berjalan tetap memakai snapshot lama hingga selesai."); } catch (e) { setError(message(e, "Status aturan belum berubah.")); } finally { setBusy(false); } };
    const ctx: Ctx = { jenis: m.jenis, errors, roles }, problems = Object.keys(errors);
    return <Screen title={rule ? `Aturan #${rule.id}` : "Buat Approval Rule"} subtitle="Aturan tersimpan berlaku pada pengajuan berikutnya. Jalankan pratinjau untuk melihat aturan dan langkah yang terbentuk." footer={<Button icon="check" title="Simpan aturan" busy={busy} onPress={() => void save()}/>}>
        {rule && <View style={styles.row}><StatusBadge label={rule.status_aktif ? "Aktif" : "Nonaktif"} tone={rule.status_aktif ? "success" : "pending"}/><Label tone="muted">Versi {rule.versi}</Label><Button icon={rule.status_aktif ? "circleX" : "checkCircle"} title={rule.status_aktif ? "Nonaktifkan" : "Aktifkan"} compact secondary onPress={() => { setReason(""); setError(null); setStatusSheet(true); }}/></View>}
        {notice && <Notice tone="success" message={notice}/>}{error && <Notice message={error}/>}
        {problems.length > 0 && <Notice message={`Isian bermasalah: ${problems.map((p) => p.replace(/^kondisi/, "kondisi").replace(/^steps\.(\d+)/, (_x, n: string) => `langkah ${Number(n) + 1}`)).join(", ")}.`}/>}
        <Chips label="Jenis pengajuan" value={m.jenis} options={JENIS_PENGAJUAN.map((j) => ({ value: j, label: label(j) }))} onChange={(jenis) => set({ jenis })}/>{errors["jenis_pengajuan"] && <Notice message={errors["jenis_pengajuan"]}/>}
        <Input label="Prioritas" value={m.prioritas} keyboardType="number-pad" onChangeText={(prioritas) => set({ prioritas })}/>{errors["prioritas"] && <Notice message={errors["prioritas"]}/>}<Label tone="muted">Bila beberapa aturan cocok, prioritas terbesar yang dipakai.</Label>
        <GroupEditor node={m.kondisi} path="kondisi" level={1} ctx={ctx} onChange={(kondisi) => set({ kondisi })}/>
        <StepsEditor steps={m.steps} errors={errors} roles={roles} onChange={(steps) => set({ steps })}/>
        <SectionHeading title="Approver cadangan"/><ApproverPicker legend="Dipakai bila seluruh langkah dilewati" allowDefault path="fallback_approver." value={m.fallback} errors={errors} roles={roles} onChange={(fallback) => set({ fallback })}/>
        <Chips label="Bila eskalasi habis" value={m.terminal} options={(Object.keys(TERMINAL_LABEL) as Terminal[]).map((value) => ({ value, label: TERMINAL_LABEL[value] }))} onChange={(terminal) => set({ terminal })}/>
        <PreviewPanel model={m} id={rule?.id ?? null} roles={roles} onErrors={setErrors}/>
        <BottomSheet visible={statusSheet} onClose={() => { if (!busy) setStatusSheet(false); }} title={rule?.status_aktif ? "Nonaktifkan aturan?" : "Aktifkan aturan?"}><View style={styles.sheet}>
            <Label>{rule?.status_aktif ? "Pengajuan berikutnya tidak lagi memakai aturan ini; instance yang berjalan tetap memakai snapshot lama." : "Aturan kembali dievaluasi pada pengajuan berikutnya."}</Label>
            {rule?.status_aktif && <Input label="Alasan penonaktifan" value={reason} multiline maxLength={500} onChangeText={setReason}/>}{error && <Notice message={error}/>}
            <Button icon="check" title={rule?.status_aktif ? "Nonaktifkan" : "Aktifkan"} busy={busy} disabled={!!rule?.status_aktif && !reason.trim()} onPress={() => void status()}/>
        </View></BottomSheet>
    </Screen>;
}
/** MS-84 — padanan P-69: pohon kondisi D.1–D.3, langkah & SLA, cadangan, terminal, pratinjau RE-07 (keputusan 26). */
export function RuleEditorScreen() {
    const { id = "" } = useLocalSearchParams<{ id: string }>(), { api, account, can } = useSession(), fresh = id === "baru", valid = (fresh || /^[1-9]\d*$/.test(id)) && can("approval_rule.manage");
    const rules = useResource(`${account}:approval-rules`, useCallback((s: AbortSignal) => valid && !fresh ? loadRules(api, s) : Promise.resolve(null), [api, valid, fresh]));
    const roles = useResource(`${account}:approver-roles`, useCallback((s: AbortSignal) => valid ? loadApproverRoles(api, s) : Promise.resolve(null), [api, valid]));
    if (!valid) return <Screen title="Editor Approval Rule"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Menyunting aturan memerlukan izin approval_rule.manage."/></Screen>;
    if (!roles.data || (!fresh && !rules.data)) return <Screen title="Editor Approval Rule">{roles.error || rules.error ? <Notice message={roles.error ?? rules.error!}/> : <Label tone="muted">Memuat aturan…</Label>}</Screen>;
    const rule = fresh ? null : rules.data!.find((x) => x.id === Number(id)) ?? null;
    if (!fresh && !rule) return <Screen title="Editor Approval Rule"><EmptyState illustration="empty" title="Aturan tidak ditemukan" description="Aturan ini tidak ada atau sudah tidak tersedia."/></Screen>;
    return <Editor key={id} initial={rule} roles={roles.data}/>;
}
const styles = StyleSheet.create({ block: { gap: t.space.sm }, row: { flexDirection: "row", alignItems: "center", gap: t.space.sm, flexWrap: "wrap" }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, group: { gap: t.space.sm }, nested: { paddingLeft: t.space.md, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: t.color.border }, sheet: { padding: t.space.md, gap: t.space.md } });
