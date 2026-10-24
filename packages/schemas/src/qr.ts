import { z } from "zod";

/** Konfigurasi pencetak dan pemindai QR berasal dari APP_BASE_URL yang sama. */
export const QrConfigResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ app_base_url: z.url().refine(value => {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    }, "Domain label QR harus berupa URL HTTPS yang sah.") }),
    meta: z.null(),
});
