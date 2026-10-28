import { useState } from "react";
import { Button, Card, Input, Label, Notice, Screen } from "../../shared/ui";
import { useAuth } from "./Provider";
import { TwoFactorEnrollment } from "./TwoFactorEnrollment";

/** MS-25 Lupa Password (FR-01.3): permintaan diverifikasi Administrator sebelum password sementara terbit. */
function ForgotPassword({ onBack }: { onBack: () => void }) {
    const { api } = useAuth();
    const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [error, setError] = useState<string | null>(null);
    const submit = async () => { setBusy(true); setError(null); try { await api.post("/auth/password/forgot", { email: email.trim() }); setSent(true); setEmail(""); } catch (e) { setError(e instanceof Error ? e.message : "Permintaan belum berhasil. Coba lagi."); } finally { setBusy(false); } };
    return <Screen title="Lupa password" icon="keyRound" subtitle="Administrator memverifikasi identitas Anda secara langsung sebelum menerbitkan password sementara."><Card>
        {sent && <Notice tone="success" message="Permintaan diterima. Hubungi Administrator untuk verifikasi identitas." />}{error && <Notice message={error} />}
        <Input icon="mail" label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} />
        <Button icon="send" title="Ajukan reset password" busy={busy} disabled={!email.trim()} onPress={() => void submit()} />
        <Button icon="arrowLeft" title="Kembali ke Login" secondary onPress={onBack} />
    </Card></Screen>;
}

export function AuthScreen() {
    const { state, controller } = useAuth();
    const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirm, setConfirm] = useState("");
    const [code, setCode] = useState(""); const [forgot, setForgot] = useState(false);
    const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
    if (state.kind === "LOGOUT") return <Screen title="Keluar"><Label>Mengakhiri sesi dan mencabut notifikasi perangkat…</Label></Screen>;
    if (state.kind === "LOGIN" && forgot) return <ForgotPassword onBack={() => setForgot(false)} />;
    if (state.kind === "ENROLL") return <Screen title="Aktifkan 2FA" icon="shield" subtitle="Akun Anda wajib memakai verifikasi dua langkah sebelum melanjutkan."><Card>
        <TwoFactorEnrollment activationCode onDone={() => controller.restore()} />
        <Button title="Keluar" secondary onPress={() => void controller.logout().catch(() => undefined)} />
    </Card></Screen>;
    const submit = async () => {
        setBusy(true); setError(null);
        try {
            if (state.kind === "LOGIN") { await controller.login(email, password); setPassword(""); }
            else if (state.kind === "CHALLENGE") { await controller.verify(state, code); setCode(""); }
            else if (state.kind === "PASSWORD") {
                if (newPassword !== confirm) throw new Error("Konfirmasi password tidak sama.");
                await controller.changePassword(password, newPassword); setPassword(""); setNewPassword(""); setConfirm("");
            }
        } catch (e) { setError(e instanceof Error ? e.message : "Permintaan belum berhasil. Coba lagi."); } finally { setBusy(false); }
    };
    const title = state.kind === "LOGIN" ? "Masuk ke SIGM4" : state.kind === "CHALLENGE" ? "Verifikasi dua langkah" : "Ganti password wajib";
    return <Screen title={title} icon={state.kind === "LOGIN" ? "lock" : "shield"} subtitle={state.kind === "LOGIN" ? "Kelola fasilitas sekolah dalam satu genggaman. Masuk untuk melanjutkan." : "Lindungi akses akun dan data sekolah Anda."}><Card>{error && <Notice message={error} />}
        {state.kind === "LOGIN" && <><Input icon="mail" label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /><Input icon="lock" label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" /></>}
        {state.kind === "CHALLENGE" && <><Label>Masukkan kode authenticator atau kode cadangan.</Label><Input label="Kode verifikasi" value={code} onChangeText={setCode} autoCapitalize="characters" autoComplete="one-time-code" /><Button title="Kembali ke Login" secondary onPress={() => void controller.logout().catch(() => undefined)} /></>}
        {state.kind === "PASSWORD" && <><Label>Ganti password sebelum melanjutkan. Sesi di perangkat lain akan dicabut.</Label><PasswordFields current={password} next={newPassword} confirm={confirm} onCurrent={setPassword} onNext={setNewPassword} onConfirm={setConfirm} /></>}
        <Button icon={state.kind === "LOGIN" ? "arrowRight" : "shield"} title={state.kind === "LOGIN" ? "Masuk" : state.kind === "PASSWORD" ? "Simpan password" : "Lanjutkan"} busy={busy} disabled={state.kind === "LOGIN" ? !email.trim() || !password : state.kind === "CHALLENGE" ? !code : !password || !confirm || !PASSWORD_RULES.every((r) => r.test(newPassword))} onPress={() => void submit()} />
        {state.kind === "LOGIN" && <Button icon="keyRound" title="Lupa password?" secondary onPress={() => { setError(null); setForgot(true); }} />}
        {state.kind === "PASSWORD" && <Button title="Keluar" secondary onPress={() => void controller.logout().catch(() => undefined)} />}
    </Card></Screen>;
}
export const PASSWORD_RULES = [{ label: "Minimal 12 karakter", test: (p: string) => p.length >= 12 }, { label: "Huruf besar", test: (p: string) => /[A-Z]/.test(p) }, { label: "Huruf kecil", test: (p: string) => /[a-z]/.test(p) }, { label: "Angka", test: (p: string) => /\d/.test(p) }];
/** Ganti password (FR-01.1 A4 wajib · FR-01.4 dari Keamanan): syarat terlihat sebelum dikirim. */
export function PasswordFields({ current, next, confirm, onCurrent, onNext, onConfirm }: { current: string; next: string; confirm: string; onCurrent: (v: string) => void; onNext: (v: string) => void; onConfirm: (v: string) => void }) {
    return <><Input label="Password saat ini" value={current} onChangeText={onCurrent} secureTextEntry autoComplete="current-password" /><Input label="Password baru" value={next} onChangeText={onNext} secureTextEntry autoComplete="new-password" maxLength={512} />{PASSWORD_RULES.map((rule) => <Label key={rule.label} tone={rule.test(next) ? "default" : "muted"}>{rule.test(next) ? "✓" : "○"} {rule.label}</Label>)}<Label tone="muted">Password bocor, nama/email dan tiga password terakhir diperiksa saat disimpan.</Label><Input label="Konfirmasi password baru" value={confirm} onChangeText={onConfirm} secureTextEntry autoComplete="new-password" /></>;
}
