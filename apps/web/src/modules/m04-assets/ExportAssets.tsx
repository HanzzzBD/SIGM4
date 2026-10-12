import { useState } from "react";
import { ApiError, api } from "../../shared/api";
import { Peringatan, Tombol } from "../../shared/ui/primitives";
import { paramsKatalog } from "./katalog";
import type { SaringanKatalog } from "./katalog";
import { saveDownload } from "./api";

/** Format/filter berada pada permintaan download saja, bukan cache query. */
export function ExportAssets({ filter }: { readonly filter: SaringanKatalog }) {
    const [sibuk, setSibuk] = useState<"xlsx" | "pdf" | null>(null);
    const [galat, setGalat] = useState<string | null>(null);
    const unduh = async (format: "xlsx" | "pdf") => {
        if (sibuk) return;
        setSibuk(format); setGalat(null);
        try {
            const result = await api.get<Blob>("/assets/export", { params: { ...paramsKatalog(filter), format }, responseType: "blob" });
            saveDownload(result.data, `inventaris-aset.${format}`);
        } catch (error) { setGalat(error instanceof ApiError && error.status === 403 ? "Anda tidak dapat mengekspor katalog ini." : "Ekspor belum berhasil. Coba lagi beberapa saat lagi."); }
        finally { setSibuk(null); }
    };
    return <div className="flex min-w-0 flex-col gap-2"><div className="flex flex-wrap gap-2"><Tombol varian="secondary" disabled={sibuk !== null} sibuk={sibuk === "xlsx"} onClick={() => void unduh("xlsx")}>Ekspor XLSX</Tombol><Tombol varian="secondary" disabled={sibuk !== null} sibuk={sibuk === "pdf"} onClick={() => void unduh("pdf")}>Ekspor PDF</Tombol></div><p className="text-sm text-text-secondary">Seluruh hasil saringan diekspor, termasuk halaman lain.</p>{galat && <Peringatan varian="error">{galat}</Peringatan>}</div>;
}
