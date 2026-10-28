import { useEffect, useState } from "react";
import { Peringatan } from "./primitives";
const wib = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
export function useImportReportExpired(expires: string | null | undefined, serverExpired: boolean | undefined) {
    const [, refresh] = useState(0);
    useEffect(() => {
        if (!expires || serverExpired) return;
        let timer: ReturnType<typeof setTimeout>;
        const tick = () => { const wait = Date.parse(expires) - Date.now(); if (wait <= 0) { refresh(n => n + 1); return; } timer = setTimeout(tick, Math.min(wait, 2_147_000_000)); };
        tick(); return () => clearTimeout(timer);
    }, [expires, serverExpired]);
    return serverExpired === true || !!expires && Date.parse(expires) <= Date.now();
}
export function ImportReportRetention({ expired, expires }: { readonly expired: boolean; readonly expires?: string | null | undefined }) {
    if (expired) return <Peringatan varian="info">Retensi laporan 30 hari telah berakhir. Rincian galat dan nama berkas tidak lagi tersedia; status dan hitungan impor tetap tersimpan.</Peringatan>;
    return <p className="text-sm text-text-secondary">Rincian galat impor disimpan selama 30 hari setelah proses berakhir.{expires ? ` Tersedia sampai ${wib.format(new Date(expires))} WIB.` : ""}</p>;
}
