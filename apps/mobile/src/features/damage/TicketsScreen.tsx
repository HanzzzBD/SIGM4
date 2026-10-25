import { useCallback, useState } from "react";
import { router } from "expo-router";
import { DamageReportListResponseSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Button, EmptyState, EntityCard, Label, Notice, Screen } from "../../shared/ui";
import { statusLabels, statusTones, urgencyLabels, urgencyTones } from "./model";

export function DamageTicketsScreen() {
    const { state, api } = useAuth(); const [page, setPage] = useState(1);
    const permissions = state.kind === "READY" ? state.session.permissions : {}; const account = state.kind === "READY" ? state.session.user.id : "";
    const permitted = Object.hasOwn(permissions, "damage.view");
    const load = useCallback(async (signal: AbortSignal) => permitted ? DamageReportListResponseSchema.parse((await api.get("/damage-reports", { params: { page, per_page: 10, pelapor: "saya" }, signal })).data) : null, [api, page, permitted]);
    const resource = useResource(`${account}:my-damage:${page}`, load);
    return <Screen title="Tiket Kerusakan Saya"><Button icon="alert" title="Lapor kerusakan" disabled={!Object.hasOwn(permissions, "damage.create")} onPress={() => router.push("/kerusakan/lapor" as "/scan")} /><Button title="Antrean foto" secondary onPress={() => router.push("/kerusakan/unggahan" as "/scan")} />
        {!permitted && <Notice message="Anda tidak memiliki izin membaca tiket kerusakan." />}{permitted && <><Button icon="refresh" title="Muat ulang" secondary onPress={resource.reload} />{resource.loading && <Label>Memuat tiket...</Label>}{resource.error && <><Notice message={resource.error} /><Button icon="refresh" title="Coba lagi" onPress={resource.reload} /></>}
            {resource.data?.data.length === 0 && <EmptyState illustration="empty" title="Belum ada tiket" description="Tiket yang Anda laporkan akan tampil di sini."/>}{resource.data?.data.map((ticket) => <EntityCard key={ticket.id} icon="hammer" title={ticket.objek.label} meta={[ticket.nomor, formatTime(ticket.dilaporkan_pada)]} statuses={[{ label: statusLabels[ticket.status], tone: statusTones[ticket.status] }, ticket.melampaui_sla ? { label: "Melewati tenggat", tone: "error" } : { label: urgencyLabels[ticket.urgensi], tone: urgencyTones[ticket.urgensi] }]} onPress={() => router.push(`/kerusakan/${ticket.id}` as "/scan")} />)}
            {resource.data && resource.data.meta.total_pages > 1 && <><Label>Halaman {page} dari {resource.data.meta.total_pages}</Label><Button title="Tiket sebelumnya" secondary disabled={page === 1 || resource.loading} onPress={() => setPage((value) => value - 1)} /><Button title="Tiket berikutnya" secondary disabled={page >= resource.data!.meta.total_pages || resource.loading} onPress={() => setPage((value) => value + 1)} /></>}
        </>}
    </Screen>;
}
