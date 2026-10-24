import { useCallback, useState } from "react";
import { router } from "expo-router";
import { ListPendingResponseSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Button, Card, Label, Notice, Screen } from "../../shared/ui";
import { approvalLabel, slaLabel } from "./model";

export function ApprovalInboxScreen() {
    const { state, api } = useAuth(); const [page, setPage] = useState(1);
    const account = state.kind === "READY" ? state.session.user.id : "";
    const permissions = state.kind === "READY" ? state.session.permissions : {};
    const permitted = Object.hasOwn(permissions, "approval.decide");
    const canRead = Object.hasOwn(permissions, "approval.view");
    const load = useCallback(async (signal: AbortSignal) => permitted ? ListPendingResponseSchema.parse((await api.get("/approvals/pending", { params: { page, per_page: 10 }, signal })).data) : null, [api, page, permitted]);
    const resource = useResource(`${account}:approvals:${page}`, load);
    return <Screen title="Persetujuan Saya" action={<Button title="Kembali ke Tugas" secondary onPress={() => router.replace("/tugas" as "/scan")} />}>
        {!permitted && <Notice message="Anda tidak memiliki izin menerima antrean keputusan persetujuan." />}
        {permitted && <><Label>Pengajuan yang menunggu keputusan Anda, termasuk penugasan delegasi. Urutan mengikuti tenggat dari server.</Label><Button title="Muat ulang" secondary onPress={resource.reload} />
            {resource.loading && <Label>Memuat persetujuan...</Label>}{resource.error && <><Notice message={resource.error} /><Button title="Coba lagi" onPress={resource.reload} /></>}
            {resource.data?.data.length === 0 && <Label>Tidak ada pengajuan yang menunggu keputusan Anda.</Label>}
            {resource.data?.data.map((item) => <Card key={item.instance_id}><Label>Pengajuan #{item.instance_id} · {approvalLabel(item.jenis_pengajuan)}</Label><Label>Pemohon: {item.pemohon.nama ?? "Nama belum tersedia"}</Label><Label>Langkah {item.urutan} · {slaLabel(item.sla)}</Label><Label>Diajukan {formatTime(item.created_at)}</Label>{item.sla_deadline && <Label>Tenggat {formatTime(item.sla_deadline)}</Label>}{item.atas_nama_user_id !== null && <Label>Penugasan delegasi</Label>}<Button title="Tinjau pengajuan" disabled={!canRead} onPress={() => router.push(`/persetujuan/${item.instance_id}` as "/scan")} />{!canRead && <Label>Izin membaca konteks pengajuan belum tersedia.</Label>}</Card>)}
            {resource.data && resource.data.meta.total_pages > 1 && <><Label>Halaman {page} dari {resource.data.meta.total_pages}</Label><Button title="Sebelumnya" secondary disabled={page === 1 || resource.loading} onPress={() => setPage((value) => value - 1)} /><Button title="Berikutnya" secondary disabled={page >= resource.data!.meta.total_pages || resource.loading} onPress={() => setPage((value) => value + 1)} /></>}
        </>}
    </Screen>;
}
