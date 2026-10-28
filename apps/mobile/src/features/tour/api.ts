import type { AxiosInstance } from "axios";
import { z } from "zod";

/** Progres tur produk milik sendiri (`GET/PUT /me/tours`): disimpan saat tur selesai atau dilewati. */
const Tour = z.object({ kunci: z.string(), status: z.enum(["SELESAI", "DILEWATI"]), versi: z.number().int() });

export const loadTourProgress = async (api: AxiosInstance) => z.object({ data: z.object({ tur: z.array(Tour) }) }).parse((await api.get("/me/tours")).data).data.tur;

export const saveTourProgress = async (api: AxiosInstance, key: string, status: "SELESAI" | "DILEWATI", version: number) =>
    z.object({ data: z.object({ tur: Tour }) }).parse((await api.put(`/me/tours/${key}`, { status, versi: version })).data).data.tur;
