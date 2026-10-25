import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Button, Chips, EmptyState, EntityCard, Input, Label, Notice, Screen, Toggle, tokens as t } from "../../shared/ui";
import { statusLabels, statusTones, urgencyLabels, urgencyTones } from "./model";
import { loadReports } from "./staff";

type Status = keyof typeof statusLabels;
/** MS-59 — padanan P-39: tiket tersaring scope; pelapor melihat tiketnya, petugas menyaring status/urgensi/SLA (FR-11.3). */
export function DamageTicketsScreen() {
    const { state, api } = useAuth(); const [page, setPage] = useState(1);
    const permissions = state.kind === "READY" ? state.session.permissions : {}; const account = state.kind === "READY" ? state.session.user.id : "";
    const permitted = Object.hasOwn(permissions, "damage.view"), broad = permissions["damage.view"] === "all";
    const [q, setQ] = useState(""), [status, setStatus] = useState<Status | "">(""), [urgent, setUrgent] = useState(false), [late, setLate] = useState(false), [mine, setMine] = useState(!broad);
    const load = useCallback(async (signal: AbortSignal) => permitted ? loadReports(api, { page, per_page: 20, ...(q.trim() ? { q: q.trim() } : {}), ...(status ? { status } : {}), ...(urgent ? { urgensi: "KRITIS" as const } : {}), ...(late ? { melampaui_sla: "true" } : {}), ...(mine ? { pelapor: "saya" as const } : {}), urut: urgent ? "urgensi" : "dilaporkan" } as Parameters<typeof loadReports>[1], signal) : null, [api, page, q, status, urgent, late, mine, permitted]);
    const resource = useResource(`${account}:damage-list:${page}:${q}:${status}:${urgent}:${late}:${mine}`, load);
    const reset = () => setPage(1);
    return <Screen title={broad ? "Laporan Kerusakan" : "Tiket Kerusakan Saya"}><View style={{ flexDirection: "row", gap: t.space.sm }}><View style={{ flex: 1 }}><Button icon="hammer" title="Lapor kerusakan" disabled={!Object.hasOwn(permissions, "damage.create")} onPress={() => router.push("/kerusakan/lapor" as "/scan")} /></View><View style={{ flex: 1 }}><Button title="Antrean foto" secondary onPress={() => router.push("/kerusakan/unggahan" as "/scan")} /></View></View>
        {!permitted && <Notice message="Anda tidak memiliki izin membaca tiket kerusakan." />}{permitted && <>
            {broad && <><Input icon="search" label="Cari" value={q} onChangeText={(v) => { setQ(v); reset(); }} placeholder="Nomor tiket atau kode aset"/>
                <Chips label="Status" value={status} options={[{ value: "" as const, label: "Semua" }, ...(Object.keys(statusLabels) as Status[]).map((s) => ({ value: s, label: statusLabels[s] }))]} onChange={(v) => { setStatus(v); reset(); }}/>
                <Toggle label="Hanya urgensi kritis" value={urgent} onChange={(v) => { setUrgent(v); reset(); }}/><Toggle label="Melewati tenggat tindak lanjut" value={late} onChange={(v) => { setLate(v); reset(); }}/><Toggle label="Hanya laporan saya" value={mine} onChange={(v) => { setMine(v); reset(); }}/></>}
            {resource.loading && <Label>Memuat tiket...</Label>}{resource.error && <><Notice message={resource.error} /><Button icon="refresh" title="Coba lagi" onPress={resource.reload} /></>}
            {resource.data?.data.length === 0 && <EmptyState illustration="empty" title="Belum ada tiket" description={mine ? "Tiket yang Anda laporkan akan tampil di sini." : "Tidak ada tiket pada saringan ini."}/>}{resource.data?.data.map((ticket) => <EntityCard key={ticket.id} icon="hammer" title={ticket.objek.label} meta={[ticket.nomor, formatTime(ticket.dilaporkan_pada)]} statuses={[{ label: statusLabels[ticket.status], tone: statusTones[ticket.status] }, ticket.melampaui_sla ? { label: "Melewati tenggat", tone: "error" } : { label: urgencyLabels[ticket.urgensi], tone: urgencyTones[ticket.urgensi] }]} onPress={() => router.push(`/kerusakan/${ticket.id}` as "/scan")} />)}
            {resource.data && resource.data.meta.total_pages > 1 && <><Label>Halaman {page} dari {resource.data.meta.total_pages}</Label><Button title="Tiket sebelumnya" secondary disabled={page === 1 || resource.loading} onPress={() => setPage((value) => value - 1)} /><Button title="Tiket berikutnya" secondary disabled={page >= resource.data!.meta.total_pages || resource.loading} onPress={() => setPage((value) => value + 1)} /></>}
        </>}
    </Screen>;
}
