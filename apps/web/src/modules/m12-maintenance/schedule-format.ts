import { ApiError } from "../../shared/api";
const formatter = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium" });
export const tanggalId = (value: string) => formatter.format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`));
export const pesanGalat = (error: unknown) => error instanceof ApiError ? error.details.length ? error.details.map(d => d.message).join(" ") : error.message : error instanceof Error ? error.message : "Perubahan belum tersimpan.";
