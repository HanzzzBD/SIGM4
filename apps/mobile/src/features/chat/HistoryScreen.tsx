import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ChatSessionsResponseSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { Button, EmptyState, EntityCard, Label, Notice, Screen, tokens as t } from "../../shared/ui";

/** MS-32 — padanan P-14 riwayat: daftar sesi milik akun; ketuk untuk melanjutkan di MS-21 (FR-19.1). */
export function ChatHistoryScreen() {
    const { state, api, offlineOnly } = useAuth(); const [page, setPage] = useState(1);
    const account = state.kind === "READY" ? state.session.user.id : "";
    const permitted = state.kind === "READY" && Object.hasOwn(state.session.permissions, "chat.use");
    const load = useCallback(async (signal: AbortSignal) => permitted && !offlineOnly ? ChatSessionsResponseSchema.parse((await api.get("/chat/sessions", { params: { page, per_page: 20 }, signal })).data) : null, [api, page, permitted, offlineOnly]);
    const resource = useResource(`${account}:chat-history:${page}`, load);
    if (!permitted) return <Screen title="Riwayat Chatbot"><EmptyState illustration="noAccess" title="Tanpa hak akses" description="Akun Anda tidak memiliki izin menggunakan chatbot."/></Screen>;
    if (offlineOnly) return <Screen title="Riwayat Chatbot"><EmptyState illustration="offline" title="Sedang luring" description="Riwayat chatbot wajib daring. Sambungkan internet untuk melanjutkan."/></Screen>;
    const pages = resource.data?.meta.total_pages ?? 1;
    return <Screen title="Riwayat Chatbot" subtitle="Sesi percakapan Anda, terbaru di atas. Hapus sesi dari layar percakapannya.">
        <Button icon="plus" title="Percakapan baru" onPress={() => router.replace("/chat" as "/scan")}/>
        {resource.loading && <Label tone="muted">Memuat riwayat…</Label>}{resource.error && <><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {resource.data?.data.length === 0 && <EmptyState illustration="empty" title="Belum ada percakapan" description="Pertanyaan yang Anda ajukan akan tersimpan di sini."/>}
        {resource.data?.data.map((session) => <EntityCard key={session.id} icon="messageCircle" title={session.judul} meta={[`Terakhir aktif ${formatTime(session.terakhir_aktif)}`]} statuses={session.reported ? [{ label: "Dilaporkan", tone: "warning" }] : []} onPress={() => router.replace(`/chat?sesi=${session.id}` as "/scan")}/>)}
        {pages > 1 && <View style={{ flexDirection: "row", gap: t.space.sm, alignItems: "center" }}><Button icon="arrowLeft" title="Sebelumnya" compact secondary disabled={page === 1 || resource.loading} onPress={() => setPage((v) => v - 1)}/><Label tone="muted">{page}/{pages}</Label><Button icon="arrowRight" title="Berikutnya" compact secondary disabled={page >= pages || resource.loading} onPress={() => setPage((v) => v + 1)}/></View>}
    </Screen>;
}
