import { useState } from "react";
import { useAuth } from "../../features/auth";
import { useUploads } from "../../features/uploads";
import { Button, Card, Label, Notice, Screen } from "../../shared/ui";
export default function Profile() {
    const { state, controller } = useAuth(); const uploads = useUploads(); const [busy, setBusy] = useState(false);
    if (state.kind !== "READY") return null;
    return <Screen title="Profil"><Card><Label>{state.session.user.nama}</Label><Label>{state.session.user.email}</Label>
        {uploads.count > 0 && <Label>Foto belum terunggah: {uploads.count}.</Label>}{uploads.discarded > 0 && <Notice message={`${uploads.discarded} foto tertua dibuang karena batas antrean. Ambil ulang foto yang diperlukan.`} />}
        {uploads.error && <Notice message={uploads.error} />}{uploads.message && <Label>{uploads.message}</Label>}
        <Label>Pengaturan profil, keamanan dan preferensi notifikasi lengkap belum tersedia di aplikasi.</Label>
        <Button title="Keluar" secondary busy={busy} onPress={() => { setBusy(true); void controller.logout().catch(() => undefined).finally(() => setBusy(false)); }} />
    </Card></Screen>;
}
