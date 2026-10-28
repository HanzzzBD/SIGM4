// Vite (SDD-FE-14) + Vitest (SDD-REPO-11) dalam SATU konfigurasi: build dan uji memakai
// resolver dan plugin yang sama, sehingga yang diuji adalah yang dibangun.
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        // Satu origin dengan API: cookie sesi httpOnly SameSite=Strict berlaku (SDD-SESS-05).
        proxy: { "/api": process.env["SIGM4_API_ORIGIN"] ?? "http://localhost:3000" },
    },
    build: { outDir: "dist/app", emptyOutDir: true },
    test: {
        include: ["tests/**/*.test.{ts,tsx}"],
        environment: "jsdom",
        setupFiles: ["tests/setup.ts"],
        css: false,
    },
});
