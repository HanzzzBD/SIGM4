export function addCalendarDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}
export function nextWorkingDate(date: string, workDays: ReadonlySet<number>, holidays: ReadonlySet<string>): string {
    for (let n = 0; n < 3660; n++) {
        const candidate = addCalendarDays(date, n);
        const day = new Date(`${candidate}T00:00:00Z`).getUTCDay() || 7;
        if (workDays.has(day) && !holidays.has(candidate)) return candidate;
    }
    throw new Error("Kalender tidak memiliki hari kerja tersedia.");
}
