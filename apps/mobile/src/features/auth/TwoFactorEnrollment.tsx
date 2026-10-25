import { useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { z } from "zod";
import { encode } from "uqr";
import Svg, { Path, Rect } from "react-native-svg";
import { tokenVault } from "../../shared/secure";
import { Button, Input, Label, Notice, tokens as t } from "../../shared/ui";
import { useAuth } from "./Provider";
import { backupCodesMessage } from "./codes";

const EnrollmentSchema = z.object({ secret: z.string(), otpauth_uri: z.string(), kode_cadangan: z.array(z.string()) });

/**
 * MS-24 Aktivasi 2FA (FR-01.5): kode aktivasi Administrator bila role wajib 2FA (BR-070d) → QR + secret +
 * 10 kode cadangan yang tampil SATU kali (BR-070c) → 6 digit. Kolom 6 digit aktif setelah kode cadangan disimpan.
 */
export function TwoFactorEnrollment({ activationCode, onDone }: { activationCode: boolean; onDone: () => Promise<void> | void }) {
    const { api } = useAuth();
    const [activation, setActivation] = useState(""); const [enrollment, setEnrollment] = useState<z.infer<typeof EnrollmentSchema> | null>(null);
    const [saved, setSaved] = useState(false); const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
    const submit = async () => {
        setBusy(true); setError(null);
        try {
            const revision = tokenVault.revision;
            if (!enrollment) {
                const result = await api.post("/auth/2fa/enroll", activationCode ? { kode_aktivasi: activation.trim() } : {});
                if (revision === tokenVault.revision) setEnrollment(EnrollmentSchema.parse(result.data.data));
            } else {
                const result = await api.post("/auth/2fa/enroll/confirm", { kode: code });
                if (revision !== tokenVault.revision) return;
                // Token akses baru membawa amr `otp`; sesi lain tetap dikelola server.
                const current = await tokenVault.read();
                if (current && !(await tokenVault.save({ ...current, access_token: z.string().parse(result.data.data.access_token) }, revision))) return;
                setEnrollment(null); setCode(""); setActivation(""); await onDone();
            }
        } catch (e) { setError(e instanceof Error ? e.message : "Permintaan belum berhasil. Coba lagi."); } finally { setBusy(false); }
    };
    return <>
        {error && <Notice message={error} />}
        {enrollment ? <>
            <View style={styles.qr}><Qr uri={enrollment.otpauth_uri} /></View><Label tone="muted">Pindai dengan aplikasi authenticator, atau masukkan kunci manual: {enrollment.secret}</Label>
            <Notice tone="info" message="Kode cadangan tampil satu kali. Simpan di tempat aman." />
            <View style={styles.codes} accessibilityLabel="Kode cadangan">{enrollment.kode_cadangan.map((value) => <Text key={value} style={styles.code}>{value}</Text>)}</View>
            <Button icon="send" title="Bagikan untuk disimpan" secondary onPress={() => { void Share.share({ message: backupCodesMessage(enrollment.kode_cadangan) }).catch(() => setError("Kode belum dapat dibagikan. Catat secara manual.")); }} />
            <Button icon={saved ? "checkCircle" : "check"} title={saved ? "Kode sudah disimpan" : "Saya sudah menyimpan 10 kode cadangan"} secondary onPress={() => setSaved(!saved)} />
            <Input label="Kode authenticator" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} editable={saved} />
        </> : activationCode ? <><Label>Masukkan kode aktivasi yang diserahkan langsung oleh Administrator.</Label><Input label="Kode aktivasi" value={activation} onChangeText={setActivation} autoCapitalize="characters" /></> : <Label>Lindungi akun dengan aplikasi authenticator. Kode aktivasi Administrator tidak diperlukan untuk role Anda.</Label>}
        <Button icon="shield" title={enrollment ? "Aktifkan 2FA" : "Lanjutkan"} busy={busy} disabled={enrollment ? !saved || !/^\d{6}$/.test(code) : activationCode && !activation.trim()} onPress={() => void submit()} />
    </>;
}
function Qr({ uri }: { uri: string }) {
    const { size, data } = encode(uri, { ecc: "M", border: 4 });
    const path = data.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x} ${y}h1v1h-1z`] : [])).join("");
    return <Svg accessibilityLabel="QR pendaftaran authenticator" width={t.size.qr} height={t.size.qr} viewBox={`0 0 ${size} ${size}`}><Rect width={size} height={size} fill={t.color.surface} /><Path d={path} fill={t.color.heading} /></Svg>;
}
const styles = StyleSheet.create({
    qr: { alignItems: "center" }, codes: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
    code: { flexBasis: "45%", flexGrow: 1, padding: t.space.sm, borderRadius: t.radius.md, backgroundColor: t.color.neutralSoft, fontFamily: "monospace", fontSize: t.font.body, color: t.color.heading, textAlign: "center" },
});
