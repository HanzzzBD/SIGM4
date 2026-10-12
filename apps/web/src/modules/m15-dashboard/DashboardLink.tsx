import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Tetap anchor native untuk buka tab baru; klik biasa memakai router tanpa memuat ulang aplikasi. */
export function DashboardLink({ href, children, label, judul = false }: { readonly href: string; readonly children: ReactNode; readonly label: string; readonly judul?: boolean }) {
    const navigate = useNavigate();
    return <a href={href} aria-label={label} className={`inline-flex min-h-touch items-center rounded-sm ${judul ? "text-lg" : "text-sm"} text-text-link hover:text-text-link-hover focus-visible:outline-2 focus-visible:outline-offset-2`} onClick={(event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void navigate({ href });
    }}>{children}</a>;
}
