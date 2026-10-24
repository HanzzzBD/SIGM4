import { useState } from "react";
import { z } from "zod";
import { encode } from "uqr";
import Svg, { Path, Rect } from "react-native-svg";
import { tokenVault } from "../../shared/secure";
import { Button, Card, Input, Label, Notice, Screen, tokens as t } from "../../shared/ui";
import { useAuth } from "./Provider";

const EnrollmentSchema = z.object({ secret: z.string(), otpauth_uri: z.string(), kode_cadangan: z.array(z.string()) });
export function AuthScreen() {
    const { state, controller, api } = useAuth();
    const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirm, setConfirm] = useState("");
    const [code, setCode] = useState(""); const [activation, setActivation] = useState(""); const [enrollment, setEnrollment] = useState<z.infer<typeof EnrollmentSchema> | null>(null); const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
    if (state.kind === "LOGOUT") return <Screen title="Keluar"><Label>Mengakhiri sesi dan mencabut notifikasi perangkat…</Label></Screen>;
    const submit = async () => {
        setBusy(true); setError(null);
        try {
            if (state.kind === "LOGIN") { await controller.login(email, password); setPassword(""); }
            else if (state.kind === "CHALLENGE") { await controller.verify(state, code); setCode(""); }
            else if (state.kind === "PASSWORD") {
                if (newPassword !== confirm) throw new Error("Konfirmasi password tidak sama.");
                await controller.changePassword(password, newPassword); setPassword(""); setNewPassword(""); setConfirm("");
            } else if (state.kind === "ENROLL") {
                const revision = tokenVault.revision;
                if (!enrollment) {
                    const result = await api.post("/auth/2fa/enroll", { kode_aktivasi: activation.trim() });
                    if (revision === tokenVault.revision) setEnrollment(EnrollmentSchema.parse(result.data.data));
                }
                else {
                    const result = await api.post("/auth/2fa/enroll/confirm", { kode: code });
                    if (revision !== tokenVault.revision) return;
                    const current = await tokenVault.read();
                    if (current && !(await tokenVault.save({ ...current, access_token: z.string().parse(result.data.data.access_token) }, revision))) return;
                    setEnrollment(null); setCode(""); setActivation(""); await controller.restore();
                }
            }
        } catch (e) { setError(e instanceof Error ? e.message : "Permintaan belum berhasil. Coba lagi."); } finally { setBusy(false); }
    };
    const title = state.kind === "LOGIN" ? "Masuk ke SIGM4" : state.kind === "CHALLENGE" ? "Verifikasi dua langkah" : state.kind === "PASSWORD" ? "Ganti password wajib" : "Aktifkan 2FA";
    return <Screen title={title}><Card>{error && <Notice message={error} />}
        {state.kind === "LOGIN" && <><Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /><Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" /></>}
        {state.kind === "CHALLENGE" && <><Label>Masukkan kode authenticator atau kode cadangan.</Label><Input label="Kode verifikasi" value={code} onChangeText={setCode} autoCapitalize="characters" autoComplete="one-time-code" /><Button title="Kembali ke Login" secondary onPress={() => void controller.logout().catch(() => undefined)} /></>}
        {state.kind === "PASSWORD" && <><Label>Ganti password sebelum melanjutkan. Sesi di perangkat lain akan dicabut.</Label><Input label="Password saat ini" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" /><Input label="Password baru" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" />{PASSWORD_RULES.map((rule) => <Label key={rule.label}>{rule.test(newPassword) ? "✓" : "○"} {rule.label}</Label>)}<Label>Password bocor, nama/email dan tiga password terakhir diperiksa saat disimpan.</Label><Input label="Konfirmasi password baru" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" /></>}
        {state.kind === "ENROLL" && (enrollment ? <><Qr uri={enrollment.otpauth_uri} /><Label>Kunci manual: {enrollment.secret}</Label><Label>Kode cadangan tampil satu kali. Simpan di tempat aman.</Label>{enrollment.kode_cadangan.map((value) => <Label key={value}>{value}</Label>)}<Button title={saved ? "Kode sudah disimpan" : "Saya sudah menyimpan 10 kode cadangan"} secondary onPress={() => setSaved(!saved)} /><Input label="Kode authenticator" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} /></> : <><Label>Masukkan kode aktivasi yang diserahkan langsung oleh Administrator.</Label><Input label="Kode aktivasi" value={activation} onChangeText={setActivation} autoCapitalize="characters" /></>)}
        <Button title={state.kind === "LOGIN" ? "Masuk" : state.kind === "PASSWORD" ? "Simpan password" : "Lanjutkan"} busy={busy} disabled={state.kind === "LOGIN" ? !email.trim() || !password : state.kind === "CHALLENGE" ? !code : state.kind === "PASSWORD" ? !password || !confirm || !PASSWORD_RULES.every((r) => r.test(newPassword)) : state.kind === "ENROLL" && enrollment !== null ? !saved || !/^\d{6}$/.test(code) : !activation.trim()} onPress={() => void submit()} />
        {(state.kind === "PASSWORD" || state.kind === "ENROLL") && <Button title="Keluar" secondary onPress={() => void controller.logout().catch(() => undefined)} />}
    </Card></Screen>;
}
export const PASSWORD_RULES = [{ label: "Minimal 12 karakter", test: (p: string) => p.length >= 12 }, { label: "Huruf besar", test: (p: string) => /[A-Z]/.test(p) }, { label: "Huruf kecil", test: (p: string) => /[a-z]/.test(p) }, { label: "Angka", test: (p: string) => /\d/.test(p) }];
function Qr({ uri }: { uri: string }) {
    const { size, data } = encode(uri, { ecc: "M", border: 4 });
    const path = data.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x} ${y}h1v1h-1z`] : [])).join("");
    return <Svg accessibilityLabel="QR pendaftaran authenticator" width={t.size.qr} height={t.size.qr} viewBox={`0 0 ${size} ${size}`}><Rect width={size} height={size} fill={t.color.surface} /><Path d={path} fill={t.color.heading} /></Svg>;
}
