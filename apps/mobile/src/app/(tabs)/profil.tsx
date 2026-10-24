import { StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import {roleLabel} from "@sigm4/schemas";
import { useAuth } from "../../features/auth";
import { useUploads } from "../../features/uploads";
import { useStocktakeQueue } from "../../features/stocktake";
import { Badge, Button, Card, Label, ListRow, Notice, Screen, SectionHeading, tokens as t } from "../../shared/ui";
export default function Profile() {
    const { state, controller } = useAuth(); const uploads = useUploads(); const stocktake = useStocktakeQueue(); const [busy, setBusy] = useState(false), [logoutError, setLogoutError] = useState<string | null>(null);
    const exit = (discardPending = false) => { if (busy) return; setBusy(true); setLogoutError(null); void controller.logout({ discardPending }).catch((e: unknown) => setLogoutError(e instanceof Error ? e.message : "Keluar belum berhasil.")).finally(() => setBusy(false)); };
    if (state.kind !== "READY") return null;
    return <Screen title="Profil" icon="user" subtitle="Identitas akun dan status aplikasi Anda."><Card><View style={styles.identity}><View style={styles.avatar}><Text style={styles.initials}>{state.session.user.nama.split(" ").slice(0,2).map(part=>part[0]).join("").toUpperCase()}</Text></View><View style={styles.nameBlock}><Text style={styles.name}>{state.session.user.nama}</Text><Badge label={roleLabel(state.session.user.role_kode)}/></View></View><ListRow title="Email" subtitle={state.session.user.email} icon="mail"/></Card><SectionHeading title="Akun & perangkat"/><Card><ListRow title="Akses terlindungi" subtitle="Hak akses mengikuti peran akun Anda." icon="shield"/>
        {uploads.count > 0 && <Label>Foto belum terunggah: {uploads.count}.</Label>}{uploads.discarded > 0 && <Notice message={`${uploads.discarded} foto tertua dibuang karena batas antrean. Ambil ulang foto yang diperlukan.`} />}
        {uploads.error && <Notice message={uploads.error} />}{uploads.message && <Label>{uploads.message}</Label>}
        <Label>Pengaturan profil, keamanan dan preferensi notifikasi lengkap belum tersedia di aplikasi.</Label>
        {stocktake.entries.length > 0 && <Label>Hasil opname belum tersinkron: {stocktake.entries.length}.</Label>}
        {logoutError && <Card><Notice message={logoutError} /><Label>Hapus data dan keluar menghapus hasil lokal beserta foto yang belum diterima server dari akun ini. Tindakan ini tidak dapat dibatalkan.</Label><Button title="Sinkronkan sekarang" disabled={busy} onPress={() => { uploads.refresh(); stocktake.refresh(); setLogoutError("Sinkronisasi dicoba. Saat luring, hasil tetap disimpan. Periksa antrean sebelum keluar kembali."); }} /><Button title="Kembali" secondary disabled={busy} onPress={() => setLogoutError(null)} /><Button title="Hapus data dan keluar" secondary disabled={busy} onPress={() => exit(true)} /></Card>}
        <Button icon="logout" title="Keluar dari akun" secondary busy={busy} onPress={() => exit()} />
    </Card></Screen>;
}

const styles=StyleSheet.create({identity:{flexDirection:"row",alignItems:"center",gap:t.space.md,paddingVertical:t.space.sm},avatar:{height:t.size.tabBar,width:t.size.tabBar,borderRadius:t.radius.full,backgroundColor:t.color.primarySoft,alignItems:"center",justifyContent:"center"},initials:{fontSize:t.font.heading,fontWeight:"600",color:t.color.primary},nameBlock:{flex:1,gap:t.space.sm},name:{fontSize:t.font.title,fontWeight:"600",color:t.color.heading}});
