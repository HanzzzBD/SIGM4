import { useCallback, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { z } from "zod";
import { DamageReportDetailResponseSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { AssignmentFields, createWorkOrder, emptyAssignment, workOrderBody } from "../damage";
import { useResource } from "../../shared/api/useResource";
import { Button, Chips, EmptyState, EntityCard, Input, Label, Notice, Screen } from "../../shared/ui";
import { workOrderPriorities } from "./model";

type Priority = keyof typeof workOrderPriorities;
const Assets = z.object({ data: z.array(z.object({ id: z.string(), kode_barang: z.string(), nama: z.string() })) });
const Tree = z.object({ data: z.array(z.object({ nama: z.string(), areas: z.array(z.object({ rooms: z.array(z.object({ id: z.string(), nama: z.string(), status: z.string() })) })) })) });

/** MS-62 — padanan P-43: dari tiket terverifikasi, atau tepat satu aset/ruangan; teknisi, target, prioritas (FR-12.1). */
export function WorkOrderCreateScreen() {
    const params = useLocalSearchParams<{ tiket?: string; asset_id?: string }>(); const { state, api } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const perms = state.kind === "READY" ? state.session.permissions : {}, permitted = Object.hasOwn(perms, "workorder.create");
    const ticket = params.tiket && /^[1-9]\d*$/.test(params.tiket) ? params.tiket : "";
    const [kind, setKind] = useState<"ASET" | "RUANGAN">("ASET"), [asset, setAsset] = useState(params.asset_id && /^[1-9]\d*$/.test(params.asset_id) ? params.asset_id : ""), [room, setRoom] = useState(""), [q, setQ] = useState("");
    const [description, setDescription] = useState(""), [priority, setPriority] = useState<Priority>("SEDANG"), [assign, setAssign] = useState(emptyAssignment()), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const key = useRef<{ body: string; key: string } | null>(null);
    const report = useResource(`${account}:wo-ticket:${ticket}`, useCallback(async (s: AbortSignal) => { if (!ticket || !permitted) return null; const d = DamageReportDetailResponseSchema.parse((await api.get(`/damage-reports/${ticket}`, { signal: s })).data).data; setDescription((v) => v || d.deskripsi); setPriority((p) => d.urgensi === "KRITIS" ? "KRITIS" : d.urgensi === "TINGGI" ? "TINGGI" : p); return d; }, [api, ticket, permitted]));
    const assets = useResource(`${account}:wo-assets:${q}`, useCallback(async (s: AbortSignal) => !ticket && permitted && kind === "ASET" && q.trim().length >= 2 ? Assets.parse((await api.get("/assets", { params: { q: q.trim(), per_page: 10 }, signal: s })).data).data : null, [api, q, kind, ticket, permitted]));
    const rooms = useResource(`${account}:wo-rooms`, useCallback(async (s: AbortSignal) => !ticket && permitted && kind === "RUANGAN" && Object.hasOwn(perms, "location.view") ? Tree.parse((await api.get("/locations/tree", { signal: s })).data).data.flatMap((b) => b.areas.flatMap((a) => a.rooms.filter((r) => r.status === "AKTIF").map((r) => ({ value: r.id, label: `${r.nama} · ${b.nama}` })))) : null, [api, kind, ticket, permitted]));
    if (!permitted) return <Screen title="Buat Work Order"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Anda tidak memiliki izin membuat work order."/></Screen>;
    const save = async () => {
        const r = workOrderBody({ ticket, asset: kind === "ASET" ? asset : "", room: kind === "RUANGAN" ? room : "", description, priority, assign }); if ("error" in r) { setError(r.error); return; }
        const text = JSON.stringify(r.body); if (key.current?.body !== text) key.current = { body: text, key: randomUUID() };
        setBusy(true); setError(null); try { const wo = await createWorkOrder(api, r.body, key.current.key); router.replace(`/work-order/${wo.id}` as "/scan"); } catch (e) { setError(e instanceof Error ? e.message : "Work order belum tersimpan. Coba lagi dengan isian yang sama."); } finally { setBusy(false); }
    };
    return <Screen title="Buat Work Order" subtitle="Satu work order untuk satu aset atau ruangan. Teknisi menerima notifikasi penugasan setelah disimpan." footer={<Button icon="check" title="Simpan & tugaskan" busy={busy} onPress={() => void save()}/>}>
        {error && <Notice message={error}/>}
        {ticket ? report.data ? <EntityCard icon="hammer" title={report.data.objek.label} meta={[`Tiket ${report.data.nomor}`, report.data.objek.lokasi]}/> : <Label tone="muted">{report.error ?? "Memuat tiket…"}</Label> : <>
            <Chips label="Objek" value={kind} options={[{ value: "ASET", label: "Aset" }, { value: "RUANGAN", label: "Ruangan" }]} onChange={(v) => { setKind(v); setAsset(""); setRoom(""); }}/>
            {kind === "ASET" ? <><Input icon="search" label="Cari aset" value={q} onChangeText={setQ} placeholder="Kode atau nama (min. 2 huruf)"/>{assets.data && <Chips label="Aset" value={asset} options={assets.data.map((a) => ({ value: a.id, label: `${a.kode_barang} · ${a.nama}` }))} onChange={setAsset}/>}{asset && !assets.data && <Label tone="muted">Aset #{asset} terpilih.</Label>}</>
                : rooms.data ? <Chips label="Ruangan" value={room} options={rooms.data} onChange={setRoom}/> : <Label tone="muted">{rooms.error ?? "Memuat ruangan…"}</Label>}
        </>}
        <Input label="Deskripsi pekerjaan" value={description} multiline maxLength={5000} onChangeText={setDescription}/>
        <Chips label="Prioritas" value={priority} options={(Object.keys(workOrderPriorities) as Priority[]).map((p) => ({ value: p, label: workOrderPriorities[p] }))} onChange={setPriority}/>
        <AssignmentFields value={assign} onChange={setAssign} asset={kind === "ASET" || !!report.data && report.data.objek.jenis === "ASET"}/>
    </Screen>;
}
