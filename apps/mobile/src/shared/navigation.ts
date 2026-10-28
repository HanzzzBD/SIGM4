/** Path relatif saja. Tidak pernah membuka URL/intent dari payload notifikasi. */
export function internalPath(value: unknown): string | null {
    if (typeof value !== "string" || value.length > 1024 || !value.startsWith("/") || value.startsWith("//") || /[\\%#]/.test(value) || [...value].some((character) => character.charCodeAt(0) <= 32)) return null;
    try { const parsed = new URL(value, "https://internal.invalid"); if (parsed.origin !== "https://internal.invalid" || parsed.pathname !== value.split("?")[0] || parsed.pathname.includes("..")) return null; return `${parsed.pathname}${parsed.search}`; } catch { return null; }
}
export type NavigationEvent = { path: string; accountId: string | null };
export class NavigationInbox {
    private pending: NavigationEvent | null = null;
    offer(path: unknown, accountId: string | null) { const valid = internalPath(path); if (valid) this.pending = { path: valid, accountId }; }
    take(accountId: string): string | null { const event = this.pending; this.pending = null; return event && (event.accountId === null || event.accountId === accountId) ? event.path : null; }
    clear() { this.pending = null; }
}
