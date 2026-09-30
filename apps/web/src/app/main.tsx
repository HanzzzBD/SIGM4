// Bootstrap aplikasi web (SDD-11 §4.1): QueryClient, router, penangan sesi klien HTTP.

import "../shared/ui/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiError, aturPenangan } from "../shared/api";
import { KUNCI_ME } from "../shared/auth";
import { buatRouter } from "./router";

/** SDD-11 §4.3: bawaan daftar/katalog 30 detik; galat 4xx tidak diulang otomatis. */
export function buatQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: (n, g) => !(g instanceof ApiError && g.status < 500) && n < 2,
            },
        },
    });
}

const queryClient = buatQueryClient();
const router = buatRouter(queryClient);

aturPenangan({
    // FR-01.1 A5: penukaran gagal → Login, tujuan disimpan.
    sesiBerakhir: () => {
        const tujuan = router.state.location.href;
        queryClient.clear();
        void router.navigate({ to: "/login", search: { tujuan } });
    },
    sesiDisegarkan: () => void queryClient.invalidateQueries({ queryKey: KUNCI_ME }),
});

const akar = document.getElementById("root");
if (akar !== null) {
    createRoot(akar).render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </StrictMode>,
    );
}
