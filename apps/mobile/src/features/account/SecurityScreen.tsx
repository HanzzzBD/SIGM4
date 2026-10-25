import { useCallback, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { PASSWORD_RULES, PasswordFields, backupCodesMessage, useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { formatTime } from "../../shared/time";
import { BottomSheet, Button, Card, EmptyState, EntityCard, Label, Notice, ProgressRing, Screen, SectionHeading, StatusBadge, tokens as t } from "../../shared/ui";
import { loadSessions, loadTwoFactor, logoutAll, regenerateBackupCodes, revokeSession } from "./api";
import { deviceTitle, revokeEndsHere } from "./model";

/** MS-27 — padanan P-77 + P-79: ganti password, 2FA & kode cadangan, perangkat terhubung (FR-01.4, FR-01.5, FR-01.2 A1). */
export function SecurityScreen() {
    const { state, api, controller } = useAuth(); const account = state.kind === "READY" ? state.session.user.id : "";
    const twoFactor = useResource(`${account}:2fa`, useCallback((signal: AbortSignal) => loadTwoFactor(api, signal), [api]));
    const sessions = useResource(`${account}:sessions`, useCallback((signal: AbortSignal) => loadSessions(api, signal), [api]));
    const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [confirm, setConfirm] = useState("");
    const [passwordBusy, setPasswordBusy] = useState(false), [passwordMessage, setPasswordMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
    const [codes, setCodes] = useState<readonly string[] | null>(null), [askCodes, setAskCodes] = useState(false);
    const [revoke, setRevoke] = useState<{ id: string | null; current: boolean } | null>(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const changePassword = async () => {
        if (next !== confirm) { setPasswordMessage({ tone: "error", text: "Konfirmasi password tidak sama." }); return; }
        setPasswordBusy(true); setPasswordMessage(null);
        try { await controller.changePassword(current, next); setCurrent(""); setNext(""); setConfirm(""); setPasswordMessage({ tone: "success", text: "Password berubah. Sesi lain dicabut; perangkat ini tetap masuk." }); sessions.reload(); }
        catch (e) { setPasswordMessage({ tone: "error", text: e instanceof Error ? e.message : "Password belum berubah." }); } finally { setPasswordBusy(false); }
    };
    const regenerate = async () => { setBusy(true); setError(null); try { setCodes(await regenerateBackupCodes(api)); setAskCodes(false); twoFactor.reload(); } catch (e) { setError(e instanceof Error ? e.message : "Kode cadangan belum dibuat ulang."); } finally { setBusy(false); } };
    const confirmRevoke = async () => {
        if (!revoke || busy) return; setBusy(true); setError(null);
        try {
            if (revoke.id === null) await logoutAll(api); else await revokeSession(api, revoke.id);
            const ends = revokeEndsHere(revoke); setRevoke(null);
            // Sesi perangkat ini sudah dicabut server: akhiri sesi lokal (push, cache luring) lalu kembali ke Login.
            if (ends) await controller.logout(); else sessions.reload();
        } catch (e) { setError(e instanceof Error ? e.message : "Sesi belum dicabut."); } finally { setBusy(false); }
    };
    const status = twoFactor.data;
    return <Screen title="Keamanan & 2FA" subtitle="2FA tidak dapat dinonaktifkan sendiri. Bila kehilangan perangkat dan kode cadangan, hubungi Administrator.">
        {error && <Notice message={error}/>}
        <SectionHeading title="Autentikasi dua faktor"/>
        <Card>{twoFactor.loading && <Label tone="muted">Memuat status 2FA…</Label>}{twoFactor.error && <><Notice message={twoFactor.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={twoFactor.reload}/></>}
            {status && (status.aktif ? <>
                <View style={styles.row}><ProgressRing value={status.sisa_kode_cadangan} max={10} format="fraction" tone={status.kode_cadangan_menipis ? "warning" : "default"} label={`${status.sisa_kode_cadangan} dari 10 kode cadangan tersisa`}/><View style={styles.flex}><StatusBadge label="2FA aktif" tone="success"/><Text style={styles.caption}>Kode cadangan tersisa{status.diaktifkan_pada ? ` · aktif sejak ${formatTime(status.diaktifkan_pada)}` : ""}</Text></View></View>
                {status.kode_cadangan_menipis && <Notice tone="info" message="Kode cadangan menipis. Buat ulang dan simpan kode pengganti." />}
                <Button icon="refresh" title="Buat ulang kode cadangan" secondary disabled={codes !== null} onPress={() => { setError(null); setAskCodes(true); }}/>
            </> : <><StatusBadge label="2FA belum aktif" tone="pending"/><Button icon="shield" title="Aktifkan 2FA" onPress={() => router.push("/profil/keamanan/aktivasi" as "/scan")}/></>)}
            {codes && <Card><Notice tone="info" message="Kode hanya tampil kali ini; seluruh kode lama tidak berlaku." /><View style={styles.codes} accessibilityLabel="Kode cadangan baru">{codes.map((value) => <Text key={value} style={styles.code}>{value}</Text>)}</View>
                <Button icon="send" title="Bagikan untuk disimpan" secondary onPress={() => { void Share.share({ message: backupCodesMessage(codes) }).catch(() => setError("Kode belum dapat dibagikan. Catat secara manual.")); }}/><Button icon="check" title="Saya sudah menyimpan kode" onPress={() => setCodes(null)}/></Card>}
        </Card>
        <SectionHeading title="Ganti password"/>
        <Card>{passwordMessage && <Notice tone={passwordMessage.tone} message={passwordMessage.text}/>}<PasswordFields current={current} next={next} confirm={confirm} onCurrent={setCurrent} onNext={setNext} onConfirm={setConfirm}/>
            <Button icon="lock" title="Simpan password" busy={passwordBusy} disabled={!current || !confirm || !PASSWORD_RULES.every((rule) => rule.test(next))} onPress={() => void changePassword()}/></Card>
        <SectionHeading title="Perangkat terhubung"/>
        {sessions.loading && <Label tone="muted">Memuat sesi…</Label>}{sessions.error && <><Notice message={sessions.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={sessions.reload}/></>}
        {sessions.data?.length === 0 && <EmptyState illustration="empty" title="Tidak ada sesi aktif" description="Perangkat yang terhubung akan tampil di sini."/>}
        {sessions.data?.map((session) => <EntityCard key={session.id} icon={session.platform === "WEB" ? "layoutGrid" : "scanLine"} title={deviceTitle(session)} meta={[session.ip ? `IP ${session.ip}` : null, `Diperbarui ${formatTime(session.terakhir_diperbarui)}`]} statuses={session.saat_ini ? [{ label: "Perangkat ini", tone: "success" }] : []} onPress={() => { setError(null); setRevoke({ id: session.id, current: session.saat_ini }); }}/>)}
        <Button icon="logout" title="Keluar dari semua perangkat" secondary onPress={() => { setError(null); setRevoke({ id: null, current: true }); }}/>
        <BottomSheet visible={askCodes} onClose={() => setAskCodes(false)} title="Ganti seluruh kode cadangan?"><View style={styles.sheet}><Label>Kode lama langsung tidak berlaku. Kode pengganti hanya ditampilkan satu kali.</Label><Button icon="refresh" title="Buat kode baru" busy={busy} onPress={() => void regenerate()}/></View></BottomSheet>
        <BottomSheet visible={revoke !== null} onClose={() => setRevoke(null)} title={revoke?.id === null ? "Keluar dari semua perangkat?" : "Cabut sesi perangkat?"}><View style={styles.sheet}><Label>{revoke && revokeEndsHere(revoke) ? "Anda juga akan keluar dari perangkat ini dan kembali ke Login." : "Perangkat tersebut harus masuk ulang. Perangkat ini tetap masuk."}</Label>{error && <Notice message={error}/>}<Button icon="logout" title="Cabut sesi" busy={busy} onPress={() => void confirmRevoke()}/></View></BottomSheet>
    </Screen>;
}
const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: t.space.md }, flex: { flex: 1, gap: t.space.xs }, caption: { fontSize: t.font.small, color: t.color.muted },
    codes: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }, sheet: { padding: t.space.md, gap: t.space.md },
    code: { flexBasis: "45%", flexGrow: 1, padding: t.space.sm, borderRadius: t.radius.md, backgroundColor: t.color.neutralSoft, fontFamily: "monospace", fontSize: t.font.body, color: t.color.heading, textAlign: "center" },
});
