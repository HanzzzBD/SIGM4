import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { DokumenAset, DokumenLintasAset } from "@sigm4/schemas";
import { ApiError } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Lencana, Peringatan, Tombol } from "../../shared/ui/primitives";
import { LABEL_JENIS, dokumenKey, lepasDokumen, unduhDokumen } from "./api";
import { penandaGaransi } from "./garansi";

const WAKTU = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
const TANGGAL = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", dateStyle: "long" });
const tgl = (iso: string) => TANGGAL.format(new Date(`${iso}T00:00:00Z`));
const STATUS = { PENDING: "Sedang diperiksa", CLEAN: "Siap diunduh", INFECTED: "Berkas tidak aman", FAILED: "Pemeriksaan gagal" } as const;
const alasan = { PENDING: "Unduh tersedia setelah pemeriksaan selesai.", CLEAN: "", INFECTED: "Berkas ditolak oleh pemeriksaan keamanan. Unggah berkas pengganti.", FAILED: "Berkas belum dapat diunduh karena pemeriksaan gagal. Hubungi petugas." } as const;
type Baris = DokumenAset | DokumenLintasAset;
const pesan = (error: unknown) => error instanceof ApiError ? error.message : "Permintaan belum berhasil. Coba lagi beberapa saat lagi.";

export function DaftarDokumen({ rows, assetId }: { readonly rows: readonly Baris[]; readonly assetId?: string | undefined }) {
    const can = useCan();
    const qc = useQueryClient();
    const [pilihan, setPilihan] = useState<{ readonly doc: Baris; readonly id: string } | null>(null);
    const [sibuk, setSibuk] = useState(false);
    const [unduhan, setUnduhan] = useState<string | null>(null);
    const [galat, setGalat] = useState<string | undefined>();
    const [status, setStatus] = useState<string | null>(null);
    const pemicu = useRef<HTMLButtonElement | null>(null);
    const daftar = useRef<HTMLDivElement | null>(null);
    const download = async (id: string, doc: Baris) => {
        setUnduhan(`${id}:${doc.id}`); setGalat(undefined); setStatus(null);
        try {
            const result = await unduhDokumen(id, doc.id);
            const a = document.createElement("a"); a.href = result.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.click();
            setStatus("Unduhan dibuka. Tautan berlaku selama 15 menit.");
        } catch (error) { setGalat(pesan(error)); }
        finally { setUnduhan(null); }
    };
    const hapus = async () => {
        if (!pilihan || sibuk) return;
        setSibuk(true); setGalat(undefined); setStatus(null);
        try {
            const result = await lepasDokumen(pilihan.id, pilihan.doc.id);
            await qc.invalidateQueries({ queryKey: dokumenKey });
            await qc.invalidateQueries({ queryKey: ["assets", pilihan.id, "timeline"] });
            setPilihan(null); setStatus(result.dokumen_dihapus ? "Tautan terakhir dilepas; dokumen dihapus dari daftar." : "Dokumen dilepas dari aset ini. Tautan ke aset lain tetap tersedia.");
        } catch (error) { setGalat(pesan(error)); }
        finally { setSibuk(false); }
    };
    return <div ref={daftar} tabIndex={-1} className="flex min-w-0 flex-col gap-4 outline-none">
        {galat && !pilihan && <Peringatan varian="error">{galat}</Peringatan>}
        {status && <Peringatan varian="success">{status}</Peringatan>}
        <ul aria-label="Daftar dokumen" className="flex flex-col gap-4">{rows.map((d) => {
            const id = "aset" in d ? d.aset.id : assetId;
            if (!id) return null;
            const garansi = penandaGaransi(d);
            return <li key={`${d.id}:${id}`} className="flex min-w-0 flex-col gap-3 rounded-md border border-border-subtle bg-surface-default p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 break-all text-lg font-semibold text-text-heading">{d.nama_berkas}</h3><Lencana varian="neutral">{LABEL_JENIS[d.jenis]}</Lencana></div>
                {"aset" in d && <p className="min-w-0 break-words">{can("asset.view") ? <Link to="/aset/$id/dokumen" params={{ id }} className="text-text-link hover:text-text-link-hover">{d.aset.kode_barang} · {d.aset.nama}</Link> : <span>{d.aset.kode_barang} · {d.aset.nama}</span>}</p>}
                {d.keterangan && <p className="break-words text-base text-text-primary">{d.keterangan}</p>}
                <div className="flex flex-wrap gap-2"><Lencana varian={d.scan_status === "CLEAN" ? "success" : d.scan_status === "INFECTED" ? "error" : "warning"}>{STATUS[d.scan_status]}</Lencana>{garansi && <Lencana varian={garansi.varian}>{garansi.label}</Lencana>}</div>
                {d.garansi_mulai && d.garansi_selesai && <p className="text-sm text-text-secondary">Masa garansi: {tgl(d.garansi_mulai)} – {tgl(d.garansi_selesai)}</p>}
                <p className="text-sm text-text-secondary">Diunggah {WAKTU.format(new Date(d.diunggah_pada))} WIB · {(d.ukuran / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} KB · {d.jumlah_aset} tautan aset</p>
                {d.scan_status !== "CLEAN" && <p className="text-sm text-text-secondary">{alasan[d.scan_status]}</p>}
                <div className="flex flex-wrap gap-3"><Tombol varian="secondary" disabled={d.scan_status !== "CLEAN" || unduhan !== null || sibuk} sibuk={unduhan === `${id}:${d.id}`} aria-label={`Unduh ${d.nama_berkas} untuk aset ${"aset" in d ? d.aset.kode_barang : id}`} onClick={() => void download(id, d)}>Unduh</Tombol>
                    {can("asset_document.manage") && <Tombol varian="danger" disabled={sibuk} aria-label={`Lepas ${d.nama_berkas} dari aset ${"aset" in d ? d.aset.kode_barang : id}`} onClick={(event) => { pemicu.current = event.currentTarget; setGalat(undefined); setPilihan({ doc: d, id }); }}>Lepas dari aset</Tombol>}</div>
            </li>;
        })}</ul>
        <DialogKonfirmasi buka={pilihan !== null} onTutup={() => { setPilihan(null); setGalat(undefined); }} onFokusKembali={() => { if (pemicu.current?.isConnected) pemicu.current.focus(); else daftar.current?.focus(); }} judul="Lepas dokumen dari aset ini?" labelAksi="Lepas dokumen" varian="danger" sibuk={sibuk} galat={galat} onKonfirmasi={() => void hapus()}>
            <p className="break-words">{pilihan?.doc.nama_berkas}. Tautan ke aset lain tetap tersedia. Jika ini tautan terakhir, dokumen dihapus dari daftar; berkas tetap disimpan untuk jejak audit.</p>
        </DialogKonfirmasi>
    </div>;
}
