import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useCan } from "../../shared/auth";
import { ApiError } from "../../shared/api";
import { Isian, Pilihan, Peringatan, Tombol } from "../../shared/ui/primitives";
import { ACCEPT, DocumentInputError, JENIS, LABEL_JENIS, dokumenKey, periksaBerkas, tautkanDokumen, unggahBerkas } from "./api";
import type { Jenis, PilihanAset } from "./api";
import { PilihAset } from "./PilihAset";

export function UnggahDokumen({ assetId, onSelesai, onBatal }: { readonly assetId?: string | undefined; readonly onSelesai: () => void; readonly onBatal: () => void }) {
    const qc = useQueryClient();
    const can = useCan();
    const [file, setFile] = useState<File | null>(null);
    const [jenis, setJenis] = useState<Jenis>("FAKTUR");
    const [keterangan, setKeterangan] = useState("");
    const [mulai, setMulai] = useState("");
    const [akhir, setAkhir] = useState("");
    const [aset, setAset] = useState<readonly PilihanAset[]>([]);
    const [sibuk, setSibuk] = useState(false);
    const [tahap, setTahap] = useState("");
    const [galat, setGalat] = useState<string | null>(null);
    // Gagal menautkan setelah confirm: retry memakai berkas yang sama, tanpa PUT ulang.
    const terunggah = useRef<{ readonly file: File; readonly id: string } | null>(null);
    const kirim = async () => {
        setGalat(null);
        const primary = assetId ?? aset[0]?.id;
        if (!primary) { setGalat("Pilih sedikitnya satu aset untuk dokumen ini."); return; }
        if (!file) { setGalat("Pilih berkas dokumen."); return; }
        if (jenis === "GARANSI" && (!mulai || !akhir || akhir < mulai)) { setGalat("Isi tanggal mulai dan berakhir garansi; tanggal berakhir tidak boleh sebelum tanggal mulai."); return; }
        setSibuk(true);
        try {
            periksaBerkas(file);
            if (terunggah.current?.file !== file) terunggah.current = { file, id: await unggahBerkas(file, setTahap) };
            setTahap("Menyimpan dokumen…");
            await tautkanDokumen(primary, { file_id: Number(terunggah.current.id), jenis, nama_berkas: file.name, keterangan: keterangan.trim() || null,
                ...(jenis === "GARANSI" ? { garansi_mulai: mulai, garansi_selesai: akhir } : {}), asset_ids_tambahan: aset.filter((a) => a.id !== primary).map((a) => Number(a.id)) });
            await qc.invalidateQueries({ queryKey: dokumenKey });
            await Promise.all([...new Set([primary, ...aset.map((a) => a.id)])].map((id) => qc.invalidateQueries({ queryKey: ["assets", id, "timeline"] })));
            onSelesai();
        } catch (error) { setGalat(error instanceof ApiError || error instanceof DocumentInputError ? error.message : "Dokumen belum tersimpan. Periksa koneksi, lalu coba lagi."); }
        finally { setSibuk(false); setTahap(""); }
    };
    return <form aria-label="Unggah dokumen aset" className="flex min-w-0 flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4 sm:p-6" onSubmit={(e) => { e.preventDefault(); if (!sibuk) void kirim(); }}>
        <h2 className="text-lg font-semibold text-text-heading">Unggah Dokumen</h2>
        <fieldset disabled={sibuk} className="flex min-w-0 flex-col gap-4">
            <Pilihan label="Jenis dokumen" value={jenis} onChange={(e) => setJenis(e.target.value as Jenis)} opsi={JENIS.map((v) => ({ nilai: v, label: LABEL_JENIS[v] }))} />
            <Isian label="Berkas dokumen" type="file" accept={ACCEPT} required onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                setFile(chosen); setGalat(null); terunggah.current = null;
                if (chosen) { try { periksaBerkas(chosen); } catch (error) { setGalat(error instanceof Error ? error.message : "Berkas tidak sesuai."); } }
            }} />
            <p className="text-sm text-text-secondary">PDF, JPG, PNG, DOCX, XLSX; maksimal 10 MB. Dokumen dapat diunduh setelah lolos pemeriksaan berkas.</p>
            <Isian label="Keterangan" maxLength={1000} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
            {jenis === "GARANSI" && <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Isian label="Tanggal mulai garansi" type="date" required value={mulai} onChange={(e) => setMulai(e.target.value)} />
                <Isian label="Tanggal berakhir garansi" type="date" required min={mulai || undefined} value={akhir} onChange={(e) => setAkhir(e.target.value)} />
            </div>}
            {can("asset.view") && <><p className="text-sm text-text-secondary">{assetId ? "Dokumen ditautkan ke aset ini. Pilih aset tambahan bila dokumen berlaku untuk beberapa unit (maksimal 200 tambahan)." : "Pilih aset pemilik dokumen. Satu dokumen dapat ditautkan ke maksimal 201 unit."}</p>
                <PilihAset pilihan={aset} utama={assetId} sibuk={sibuk} onTambah={(a) => setAset((lama) => lama.some((v) => v.id === a.id) ? lama : [...lama, a])} onLepas={(id) => setAset((lama) => lama.filter((a) => a.id !== id))} /></>}
        </fieldset>
        {galat && <Peringatan varian="error">{galat}</Peringatan>}
        <p role="status" className="text-sm text-text-secondary">{tahap}</p>
        <footer className="flex flex-wrap justify-end gap-3"><Tombol varian="secondary" disabled={sibuk} onClick={onBatal}>Batal</Tombol><Tombol type="submit" sibuk={sibuk} disabled={!assetId && aset.length === 0}>Simpan dokumen</Tombol></footer>
    </form>;
}
