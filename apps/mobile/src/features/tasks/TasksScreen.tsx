import { useCallback } from "react";
import { router } from "expo-router";
import { z } from "zod";
import { approvalScreensReady } from "../../shared/capabilities";
import { DamageReportListResponseSchema, ReservationListResponseSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button, Card, Label, Notice, Screen } from "../../shared/ui";
import { taskSections } from "./model";
function QueueSection({ kind, label }: { kind: string; label: string }) {
    const { api, state } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const load = useCallback(async (signal: AbortSignal) => {
        if (kind === "damage") { const result = DamageReportListResponseSchema.parse((await api.get("/damage-reports", { params: { status: "DILAPORKAN", per_page: 5 }, signal })).data); return { count: result.meta.total, rows: result.data.map((item) => `${item.nomor} · ${item.objek.label}`) }; }
        if (kind === "requests") { const result = ReservationListResponseSchema.parse((await api.get("/reservations", { params: { pemohon: "saya", per_page: 5 }, signal })).data); return { count: result.meta.total, rows: result.data.map((item) => `${item.nomor} · ${item.status.replaceAll("_", " ")}`) }; }
        if (kind === "approval") { const result = z.object({ data: z.array(z.object({ instance_id: z.number(), jenis_pengajuan: z.string() })), meta: z.object({ total: z.number() }) }).parse((await api.get("/approvals/pending", { params: { per_page: 5 }, signal })).data); return { count: result.meta.total, rows: result.data.map((item) => `Pengajuan #${item.instance_id} · ${item.jenis_pengajuan.replaceAll("_", " ")}`) }; }
        return null;
    }, [api, kind]);
    const resource = useResource(`${account}:tasks:${kind}`, load);
    return <Card><Label>{label}</Label>{resource.loading && <Label>Memuat antrean…</Label>}{resource.error && <><Notice message={resource.error} /><Button title="Coba lagi" secondary onPress={resource.reload} /></>}
        {resource.data && <><Label>{resource.data.count === 0 ? "Tidak ada yang menunggu tindakan Anda." : `${resource.data.count} item pada antrean.`}</Label>{resource.data.rows.map((row, index) => <Label key={index}>{row}</Label>)}</>}
        {kind === "approval" ? <><Button title="Buka persetujuan saya" disabled={!approvalScreensReady} onPress={() => router.push("/persetujuan" as "/scan")} />{!approvalScreensReady && <Label>Layar keputusan persetujuan belum tersedia di aplikasi.</Label>}</> : <><Button title={`Buka ${label.toLowerCase()}`} disabled onPress={() => undefined} /><Label>{kind === "damage" || kind === "requests" ? "Detail/aksi antrean ini belum tersedia di aplikasi." : "Antrean ini belum tersedia di aplikasi. Bagian ini aktif setelah modul terkait tersedia."}</Label></>}
    </Card>;
}
export function TasksScreen() {
    const { state } = useAuth(); const permissions = state.kind === "READY" ? state.session.permissions : {};
    const sections = taskSections(permissions);
    return <Screen title="Tugas">{sections.length === 0 && <Label>Belum ada antrean yang tersedia untuk izin akun Anda.</Label>}{sections.map((section) => <QueueSection key={section.kind} {...section} />)}</Screen>;
}
