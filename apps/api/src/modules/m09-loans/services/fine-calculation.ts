// BR-028b: nilai uang dihitung dalam sen dengan bigint, tanpa pembulatan floating point.
export interface FinePolicy { tariff: number; nominalCap: number; percentCap: number; excludeHolidays: boolean }
export const cents = (amount: string): bigint => {
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error("Nilai uang tidak sah.");
    const [whole, fraction = ""] = amount.split("."); return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
};
export const money = (amount: bigint): string => `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
export function calculateFine(days: number, value: string | null, policy: FinePolicy) {
    const raw = BigInt(days) * BigInt(policy.tariff) * 100n;
    const percent = policy.percentCap.toString(), decimals = percent.split(".")[1]?.length ?? 0;
    const numerator = BigInt(percent.replace(".", "")), denominator = 100n * 10n ** BigInt(decimals);
    const cap = value === null ? BigInt(policy.nominalCap) * 100n : (cents(value) * numerator) / denominator;
    return { hari_terlambat: days, tarif_per_hari: money(BigInt(policy.tariff) * 100n), sebelum_cap: money(raw), denda: money(raw < cap ? raw : cap) };
}
