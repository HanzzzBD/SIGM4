// Aritmetika tanggal WIB (UTC+7, tanpa DST) — tidak pernah zona perangkat (CAL-UI-09). Instan "sekarang"
// selalu diterima sebagai argumen agar dapat diuji.
const WIB_MS = 7 * 3_600_000, DAY_MS = 86_400_000, MINUTE_MS = 60_000;

/** `YYYY-MM-DD` WIB → instan tengah malam WIB. */
export const midnightWib = (date: string): Date => new Date(Date.parse(`${date}T00:00:00Z`) - WIB_MS);
/** Instan → tanggal WIB `YYYY-MM-DD`. */
export const dateWib = (t: Date | number): string => new Date((typeof t === "number" ? t : t.getTime()) + WIB_MS).toISOString().slice(0, 10);
export const shiftDay = (date: string, n: number): string => dateWib(midnightWib(date).getTime() + n * DAY_MS);
/** ISO 1 = Senin … 7 = Minggu. */
export const isoWeekday = (date: string): number => { const d = new Date(`${date}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
export const toMinutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMinutes = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
/** `YYYY-MM-DD` + `HH:MM` WIB → instan. */
export const atWib = (date: string, hhmm: string): Date => new Date(midnightWib(date).getTime() + toMinutes(hhmm) * MINUTE_MS);
/** Instan → `HH:MM` WIB. */
export const timeWib = (t: Date | string): string => new Date((typeof t === "string" ? Date.parse(t) : t.getTime()) + WIB_MS).toISOString().slice(11, 16);
/** Tanggal + jam WIB → ISO berzona `+07:00` seperti yang dikirim web. */
export const isoWib = (date: string, hhmm: string): string => `${date}T${hhmm}:00+07:00`;
export const validDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const validTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function monthDates(month: string): string[] {
    const first = new Date(`${month}-01T00:00:00Z`); if (!Number.isFinite(first.getTime())) return [];
    const next = new Date(first); next.setUTCMonth(next.getUTCMonth() + 1);
    return Array.from({ length: Math.round((next.getTime() - first.getTime()) / DAY_MS) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
export function shiftMonth(month: string, offset: number): string { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7); }

const LONG = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short" });
export const longDate = (date: string): string => LONG.format(midnightWib(date));
export const shortDate = (date: string): string => SHORT.format(midnightWib(date));
/** Rentang ringkas "Sen, 3 Nov · 08.00–10.00 WIB" untuk Kartu Entitas. */
export function rangeLabel(start: string, end: string): string {
    const a = dateWib(new Date(start)), b = dateWib(new Date(end)), t = (iso: string) => timeWib(iso).replace(":", ".");
    return a === b ? `${shortDate(a)} · ${t(start)}–${t(end)} WIB` : `${shortDate(a)} ${t(start)} – ${shortDate(b)} ${t(end)} WIB`;
}

/** Nilai desimal API dipertahankan sebagai teks, tanpa kehilangan presisi Number (sama dengan web). */
export function rupiah(value: string | null): string {
    if (value === null) return "Menunggu penetapan";
    const [whole, fraction = "00"] = value.split(".");
    return `Rp${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction === "00" ? "" : `,${fraction}`}`;
}
