import type { AnalyticsColumn, AnalyticsRow, AnalyticsType } from "@sigm4/schemas";
/** Exact string decimal formatting/delta, including amounts beyond JS safe integer. */
export function decimalDisplay(text: string): string {
    const [integer, fraction] = text.split(".");
    return `${integer === "-0" ? "-" : ""}${new Intl.NumberFormat("id-ID").format(BigInt(integer!))}${fraction ? `,${fraction}` : ""}`;
}
export function decimalDelta(a: string, b: string): string {
    const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
    const integer = (s: string) => { const [whole, fraction = ""] = s.replace(/^-/, "").split("."); return BigInt(whole! + fraction.padEnd(scale, "0")) * (s.startsWith("-") ? -1n : 1n); };
    const delta = integer(a) - integer(b), sign = delta < 0n ? "-" : "", digits = (delta < 0n ? -delta : delta).toString().padStart(scale + 1, "0");
    return sign + (scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits);
}
export function displayValue(value: AnalyticsRow[string] | undefined, column: AnalyticsColumn): string {
    if (value === null || value === undefined) return "Belum tersedia";
    if (column.tipe === "BOOLEAN") return value ? "Ya" : "Tidak";
    const text = column.tipe === "DECIMAL" && typeof value === "string" ? decimalDisplay(value) : typeof value === "number" ? new Intl.NumberFormat("id-ID").format(value) : String(value);
    const money = column.satuan === "Rp" || column.tipe === "DECIMAL" && (column.sensitivitas === "ASSET_FINANCIAL" || column.sensitivitas === "MAINTENANCE_COST");
    return money ? `Rp${text}` : column.satuan ? `${text} ${column.satuan}` : text;
}
export function drilldown(jenis: AnalyticsType, row: AnalyticsRow, can: (p: string) => boolean): string | undefined {
    if (["rekapitulasi-aset", "kebutuhan-pengadaan"].includes(jenis) && can("asset.view") && /^\d+$/.test(String(row["grup"]))) return `/aset/${row["grup"]}`;
    if (jenis === "pemanfaatan-fasilitas" && /^\d+$/.test(String(row["objek_id"]))) {
        if (row["jenis"] === "ASET" && can("asset.view")) return `/aset/${row["objek_id"]}`;
        if (row["jenis"] === "RUANGAN" && can("location.view")) return `/lokasi/ruangan/${row["objek_id"]}`;
    }
    return undefined;
}
