import { useState } from "react";
import { useAuth } from "../features/auth";
import { useUploads } from "../features/uploads/Provider";
import { Button, Card, Label, Notice, Screen } from "../shared/ui";

export default function Home() {
    const { state, controller } = useAuth(); const uploads = useUploads(); const [busy, setBusy] = useState(false);
    if (state.kind !== "READY") return null;
    return <Screen title="SIGM4"><Card><Label>Selamat datang, {state.session.user.nama}.</Label>
        {uploads.count > 0 && <Label>Foto belum terunggah: {uploads.count}.</Label>}
        {uploads.discarded > 0 && <Notice message={`${uploads.discarded} foto tertua dibuang karena batas 50 berkas atau 72 jam. Ambil ulang foto yang diperlukan.`} />}
        {uploads.error && <Notice message={uploads.error} />}{uploads.message && <Label>{uploads.message}</Label>}
        <Button title="Keluar" secondary busy={busy} onPress={() => { setBusy(true); void controller.logout().catch(() => undefined).finally(() => setBusy(false)); }} />
    </Card></Screen>;
}
