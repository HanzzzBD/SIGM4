// Isian nilai predikat (D.3) dan pemilih approver/pengguna MS-84 — padanan kondisi.tsx/langkah.tsx/EntityPickers web.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { z } from "zod";
import { FIELD_DSL, LABEL_ALASAN_PENGHAPUSAN, LABEL_JENIS_RUANGAN, LABEL_PRIORITAS } from "@sigm4/schemas";
import type { Operator } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Chips, Input, Label, MultiChips, Notice, tokens as t } from "../../shared/ui";
import { loadRoleUsers, loadUserBrief } from "./model";
import type { ApproverModel, Errors } from "./model";

export type ApproverRole = { id: string; kode: string; nama: string; permissions: readonly { kode: string }[] };
const ENUM_LABEL: Readonly<Record<string, Readonly<Record<string, string>>>> = { room_type: LABEL_JENIS_RUANGAN, disposal_reason: LABEL_ALASAN_PENGHAPUSAN, priority: LABEL_PRIORITAS };
const Named = z.object({ data: z.array(z.object({ id: z.string(), nama: z.string() })) });
const Tree = z.object({ data: z.array(z.object({ nama: z.string(), areas: z.array(z.object({ nama: z.string(), rooms: z.array(z.object({ id: z.string(), nama: z.string() })) })) })) });
const useCan = () => { const { state } = useAuth(); const p = state.kind === "READY" ? state.session.permissions : {}; return (x: string) => Object.hasOwn(p, x); };
/** Opsi enum: himpunan tertutup Bab 11.3, atau kode role bagi `requester_role`. */
export function enumOptions(field: string, roles: readonly { kode: string; nama: string }[]) {
    const valid = FIELD_DSL[field]?.nilaiSah;
    return valid === undefined ? roles.map((r) => ({ value: r.kode, label: r.nama })) : valid.map((k) => ({ value: k, label: ENUM_LABEL[field]?.[k] ?? k }));
}
const num = (s: string): number | undefined => s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s);

/** Pilihan bernama untuk field ID (ruangan, kategori aset/bahan) — butuh izin baca data terkait. */
function NamedPicker({ field, label, value, onChange }: { field: string; label: string; value: unknown; onChange: (v: unknown) => void }) {
    const { api, state } = useAuth(), can = useCan(), permission = field === "room_id" ? "location.view" : field === "asset_category_id" ? "asset.view" : "material.view", allowed = can(permission), [q, setQ] = useState("");
    const r = useResource(`${state.kind === "READY" ? state.session.user.id : ""}:rule-options:${field}`, useCallback(async (s: AbortSignal) => { if (!allowed) return null; if (field !== "room_id") return Named.parse((await api.get(field === "asset_category_id" ? "/asset-categories" : "/material-categories", { signal: s })).data).data; return Tree.parse((await api.get("/locations/tree", { signal: s })).data).data.flatMap((b) => b.areas.flatMap((a) => a.rooms.map((x) => ({ id: x.id, nama: `${b.nama} / ${a.nama} / ${x.nama}` })))); }, [api, field, allowed]));
    if (!allowed) return <Notice tone="info" message="Pilihan memerlukan izin membaca data terkait."/>;
    const chosen = Array.isArray(value) ? (value as number[]).map(String) : [], options = (r.data ?? []).filter((o) => chosen.includes(o.id) || o.nama.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
    return <View style={styles.block}><Input icon="search" label={`Cari ${label.toLowerCase()}`} value={q} onChangeText={setQ}/>{r.error && <Notice message={r.error}/>}<MultiChips label={label} value={chosen} options={options.map((o) => ({ value: o.id, label: o.nama }))} onChange={(v) => onChange(v.length ? v.map(Number) : undefined)}/></View>;
}
/** Pemohon tertentu: cari nama/email lalu pilih (butuh `user.view`). */
export function RequesterPicker({ label = "Pemohon (opsional)", value, onChange }: { label?: string; value: number | null; onChange: (v: number | null) => void }) {
    const { api, state } = useAuth(), can = useCan(), [q, setQ] = useState(""), [term, setTerm] = useState("");
    useEffect(() => { const timer = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(timer); }, [q]);
    const r = useResource(`${state.kind === "READY" ? state.session.user.id : ""}:rule-requesters:${term}`, useCallback(async (s: AbortSignal) => can("user.view") && term.length >= 2 ? z.object({ data: z.array(z.object({ id: z.string(), nama: z.string(), email: z.string() })) }).parse((await api.get("/users", { params: { q: term, per_page: 25 }, signal: s })).data).data : null, [api, term]));
    if (!can("user.view")) return <Notice tone="info" message="Pemilihan pemohon memerlukan izin membaca pengguna."/>;
    return <View style={styles.block}><Input icon="search" label={`${label}: cari nama atau email`} value={q} onChangeText={setQ}/>{value !== null && <Label tone="muted">Terpilih: pengguna #{value}</Label>}{r.data && <Chips label={label} value={value === null ? "" : String(value)} options={[{ value: "", label: "Tanpa pemohon" }, ...r.data.map((u) => ({ value: u.id, label: `${u.nama} · ${u.email}` }))]} onChange={(v) => onChange(v ? Number(v) : null)}/>}</View>;
}

/** Isian `value` menurut tipe field dan operator (D.3); juga dipakai skenario pratinjau. */
export function ValueInput({ label = "Nilai", field, op, value, onChange, roles, error }: { label?: string; field: string; op: Operator; value: unknown; onChange: (v: unknown) => void; roles: readonly ApproverRole[]; error?: string | undefined }) {
    const type = FIELD_DSL[field]?.tipe, err = error ? <Notice message={error}/> : null;
    if (field === "requester_id" && (op === "eq" || op === "neq")) return <>{<RequesterPicker label={label} value={typeof value === "number" ? value : null} onChange={(v) => onChange(v ?? undefined)}/>}{err}</>;
    if (["room_id", "asset_category_id", "material_category_id"].includes(field)) return <>{<NamedPicker field={field} label={label} value={value} onChange={onChange}/>}{err}</>;
    if (op === "is_true" || op === "is_false" || type === undefined) return err;
    if (type === "boolean") return <><Chips label={label} value={value === undefined ? "" : String(value)} options={[{ value: "", label: "Tidak diketahui" }, { value: "true", label: "Ya" }, { value: "false", label: "Tidak" }]} onChange={(v) => onChange(v === "" ? undefined : v === "true")}/>{err}</>;
    if (type === "enum") {
        const options = enumOptions(field, roles);
        if (op === "eq" || op === "neq") return <><Chips label={label} value={typeof value === "string" ? value : ""} options={options} onChange={(v) => onChange(v || undefined)}/>{err}</>;
        return <><MultiChips label={label} value={Array.isArray(value) ? value as string[] : []} options={options} onChange={(v) => onChange(v.length ? v : undefined)}/>{err}</>;
    }
    if (type === "integer_array") return <><Input label={`${label} (daftar ID, pisahkan koma)`} keyboardType="numbers-and-punctuation" defaultValue={Array.isArray(value) ? value.join(", ") : ""} onChangeText={(s) => { const ids = s.split(",").map((x) => x.trim()).filter(Boolean); onChange(ids.length ? ids.map(Number) : undefined); }}/>{err}</>;
    const kb = type === "decimal" ? "decimal-pad" : "number-pad";
    if (op === "between") { const [a, b] = Array.isArray(value) ? value as (number | undefined)[] : [undefined, undefined]; const set = (x: number | undefined, y: number | undefined) => onChange(x === undefined && y === undefined ? undefined : [x, y]); return <><View style={styles.row}><View style={styles.flex}><Input label="Dari" keyboardType={kb} defaultValue={a === undefined ? "" : String(a)} onChangeText={(s) => set(num(s), b)}/></View><View style={styles.flex}><Input label="Sampai" keyboardType={kb} defaultValue={b === undefined ? "" : String(b)} onChangeText={(s) => set(a, num(s))}/></View></View>{err}</>; }
    return <><Input label={label} keyboardType={kb} defaultValue={typeof value === "number" ? String(value) : ""} onChangeText={(s) => onChange(num(s))}/>{err}</>;
}

/** Pengguna approver/eskalasi: role pemegang `approval.decide` dulu, lalu pengguna AKTIF role itu. */
export function UserPicker({ label, value, onChange, roles, error }: { label: string; value: number | null; onChange: (id: number | null) => void; roles: readonly ApproverRole[]; error?: string | undefined }) {
    const { api, state } = useAuth(), account = state.kind === "READY" ? state.session.user.id : "", [role, setRole] = useState<string | null>(null);
    const saved = useResource(`${account}:rule-user:${value ?? 0}`, useCallback((s: AbortSignal) => value === null ? Promise.resolve(null) : loadUserBrief(api, value, s), [api, value]));
    const roleId = role ?? saved.data?.role_id ?? "";
    const users = useResource(`${account}:rule-role-users:${roleId}`, useCallback((s: AbortSignal) => roleId ? loadRoleUsers(api, roleId, s) : Promise.resolve(null), [api, roleId]));
    const options = (users.data ?? []).map((u) => ({ value: u.id, label: u.nama }));
    if (value !== null && saved.data && saved.data.role_id === roleId && !options.some((o) => o.value === String(value))) options.push({ value: String(value), label: `${saved.data.nama} (nonaktif)` });
    return <View style={styles.block}><Chips label={`${label}: role`} value={roleId} options={roles.filter((r) => r.permissions.some((p) => p.kode === "approval.decide")).map((r) => ({ value: r.id, label: r.nama }))} onChange={(v) => { setRole(v); onChange(null); }}/>
        {roleId && <Chips label={`${label}: pengguna`} value={value === null ? "" : String(value)} options={options} onChange={(v) => onChange(v ? Number(v) : null)}/>}{users.loading && <Label tone="muted">Memuat pengguna…</Label>}{error && <Notice message={error}/>}</View>;
}
export function ApproverPicker({ legend, value, onChange, errors, path, roles, allowDefault = false }: { legend: string; value: ApproverModel | null; onChange: (a: ApproverModel | null) => void; errors: Errors; path: string; roles: readonly ApproverRole[]; allowDefault?: boolean }) {
    const choice = value === null ? "default" : value.type;
    return <View style={styles.block}><Chips label={legend} value={choice} options={[...(allowDefault ? [{ value: "default", label: "Bawaan: Administrator" }] : []), { value: "role", label: "Role" }, { value: "user", label: "Pengguna tertentu" }]} onChange={(v) => onChange(v === "default" ? null : { type: v === "user" ? "user" : "role", role: "", user: null })}/>
        {value?.type === "role" && <><Chips label="Role approver" value={value.role} options={roles.map((r) => ({ value: r.kode, label: r.nama }))} onChange={(role) => onChange({ ...value, role })}/>{errors[`${path}approver_role`] && <Notice message={errors[`${path}approver_role`]!}/>}</>}
        {value?.type === "user" && <UserPicker label="Approver" value={value.user} roles={roles} error={errors[`${path}approver_user_id`]} onChange={(user) => onChange({ ...value, user })}/>}
    </View>;
}
const styles = StyleSheet.create({ block: { gap: t.space.sm }, row: { flexDirection: "row", gap: t.space.sm }, flex: { flex: 1 } });
