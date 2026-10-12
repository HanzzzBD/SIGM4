import type { AxiosInstance } from "axios";
import { z } from "zod";
import { MobileApiError } from "../../shared/api/client";
import { TokensSchema } from "../../shared/secure/vault";
import type { TokenVault } from "../../shared/secure/vault";

const UserSchema = z.object({ id: z.string(), nama: z.string(), email: z.string(), role_kode: z.string(), must_change_password: z.boolean() });
export const SessionSchema = z.object({ user: UserSchema, permissions: z.record(z.string(), z.string()) });
export type Session = z.infer<typeof SessionSchema>;
export type AuthState = { kind: "LOGIN" } | { kind: "CHALLENGE"; token: string; expiresAt: number } | { kind: "PASSWORD" } | { kind: "ENROLL"; returnToPassword: boolean } | { kind: "READY"; session: Session };
const LoginSchema = z.union([z.object({ requires_2fa: z.literal(true), challenge_token: z.string(), expires_in: z.number() }), SessionSchema.extend({ tokens: TokensSchema })]);

export class SessionController {
    constructor(private readonly api: AxiosInstance, private readonly vault: TokenVault, private readonly platform: "ANDROID" | "IOS", private readonly now: () => number, private readonly changed: (state: AuthState) => void) {}
    async restore(): Promise<void> {
        const revision = this.vault.revision;
        if (!(await this.vault.read())) { this.changed({ kind: "LOGIN" }); return; }
        try {
            const session = SessionSchema.parse((await this.api.get("/me")).data.data);
            if (revision !== this.vault.revision) return;
            this.changed(session.user.must_change_password ? { kind: "PASSWORD" } : { kind: "READY", session });
        } catch (error) {
            if (revision !== this.vault.revision) return;
            if (error instanceof MobileApiError && error.code === "PASSWORD_CHANGE_REQUIRED") { this.changed({ kind: "PASSWORD" }); return; }
            if (error instanceof MobileApiError && error.code === "TWO_FACTOR_REQUIRED") { this.changed({ kind: "ENROLL", returnToPassword: false }); return; }
            throw error;
        }
    }
    async login(email: string, password: string): Promise<void> {
        await this.vault.clear();
        const revision = this.vault.revision;
        const result = LoginSchema.parse((await this.api.post("/auth/login", { email: email.trim(), password, platform: this.platform })).data.data);
        if (this.vault.revision !== revision) return;
        if ("requires_2fa" in result) this.changed({ kind: "CHALLENGE", token: result.challenge_token, expiresAt: this.now() + result.expires_in * 1000 });
        else if (await this.vault.save(result.tokens, revision)) {
            if (result.user.must_change_password) this.changed({ kind: "PASSWORD" }); else await this.restore();
        }
    }
    async verify(challenge: Extract<AuthState, { kind: "CHALLENGE" }>, code: string): Promise<void> {
        if (challenge.expiresAt <= this.now()) { this.changed({ kind: "LOGIN" }); throw new Error("Verifikasi kedaluwarsa. Silakan masuk kembali."); }
        const revision = this.vault.revision;
        const result = SessionSchema.extend({ tokens: TokensSchema }).parse((await this.api.post("/auth/2fa/verify", { challenge_token: challenge.token, kode: code.trim() })).data.data);
        if (await this.vault.save(result.tokens, revision)) {
            if (result.user.must_change_password) this.changed({ kind: "PASSWORD" }); else await this.restore();
        }
    }
    async changePassword(old: string, password: string): Promise<void> {
        const revision = this.vault.revision;
        try {
            const result = await this.api.post("/auth/password/change", { password_lama: old, password_baru: password });
            if (revision !== this.vault.revision) return;
            const current = await this.vault.read();
            if (current && !(await this.vault.save({ ...current, access_token: z.string().parse(result.data.data.access_token) }, revision))) return;
            await this.restore();
        } catch (error) {
            if (revision !== this.vault.revision) return;
            if (error instanceof MobileApiError && error.code === "TWO_FACTOR_REQUIRED") this.changed({ kind: "ENROLL", returnToPassword: true });
            else throw error;
        }
    }
    async logout(): Promise<void> {
        try { await this.api.post("/auth/logout"); } finally { await this.vault.clear(); this.changed({ kind: "LOGIN" }); }
    }
}
