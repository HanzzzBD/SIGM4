import { useCallback, useState } from "react";
import { router } from "expo-router";
import { ListPendingResponseSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Button, EmptyState, EntityCard, Label, Notice, Screen } from "../../shared/ui";
import { approvalLabel, slaLabel, slaTone } from "./model";

export function ApprovalInboxScreen() {
    const { state, api } = useAuth(); const [page, setPage] = useState(1);
    const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const permitted = Object.hasOwn(permissions, "approval.decide");
    const canRead = Object.hasOwn(permissions, "approval.view");
    const load = useCallback(async (signal: AbortSignal) => permitted ? ListPendingResponseSchema.parse((await api.get("/approvals/pending", { params: { page, per_page: 10 }, signal })).data) : null, [api, page, permitted]);
    const resource = useResource(`${account}:approvals:${page}`, load);
    return <Screen title="Persetujuan Saya" subtitle="Pengajuan yang menunggu keputusan Anda, termasuk penugasan delegasi. Urutan mengikuti tenggat dari server." action={<Button icon="arrowLeft" title="Kembali ke Tugas" secondary onPress={() => router.replace("/tugas" as "/scan")} />}>
        {!permitted && <Notice message="Anda tidak memiliki izin menerima antrean keputusan persetujuan." />}
        {permitted && <><Button icon="refresh" title="Muat ulang" secondary onPress={resource.reload} />
            {resource.loading && <Label>Memuat persetujuan...</Label>}{resource.error && <><Notice message={resource.error} /><Button icon="refresh" title="Coba lagi" onPress={resource.reload} /></>}
            {resource.data?.data.length === 0 && <EmptyState illustration="success" title="Sudah beres" description="Tidak ada pengajuan yang menunggu keputusan Anda."/>}
            {!canRead && resource.data && resource.data.data.length > 0 && <Notice tone="info" message="Izin membaca konteks pengajuan belum tersedia." />}
            {resource.data?.data.map((item) => <EntityCard key={item.instance_id} icon="badgeCheck" title={`#${item.instance_id} · ${approvalLabel(item.jenis_pengajuan)}`} meta={[item.pemohon.nama ?? "Nama belum tersedia", item.sla_deadline ? `Tenggat ${formatTime(item.sla_deadline)}` : `Diajukan ${formatTime(item.created_at)}`]} statuses={[{ label: slaLabel(item.sla), tone: slaTone(item.sla) }, ...(item.atas_nama_user_id !== null ? [{ label: "Delegasi", tone: "info" as const }] : [])]} value={`L${item.urutan}`} {...(canRead ? { onPress: () => router.push(`/persetujuan/${item.instance_id}` as "/scan") } : {})} />)}
            {resource.data && resource.data.meta.total_pages > 1 && <><Label>Halaman {page} dari {resource.data.meta.total_pages}</Label><Button icon="arrowLeft" title="Sebelumnya" secondary disabled={page === 1 || resource.loading} onPress={() => setPage((value) => value - 1)} /><Button icon="arrowRight" title="Berikutnya" secondary disabled={page >= resource.data!.meta.total_pages || resource.loading} onPress={() => setPage((value) => value + 1)} /></>}
        </>}
    </Screen>;
}
