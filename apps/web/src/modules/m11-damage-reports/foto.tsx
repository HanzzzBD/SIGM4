// Pemilih foto kerusakan (FR-11.1 langkah 3, A2; BR-044): unggah seketika saat dipilih, maksimal `maks`.
// Unggahan yang gagal tetap dipakai sebagai pesanan tertunda — tiket tetap dapat dikirim (keputusan 20b).

import { useId, useState } from "react";
import { Lencana, Tombol } from "../../shared/ui/primitives";
import { unggahFoto } from "./api";

export interface FotoTerpilih {
    readonly nama: string;
    readonly fileId: number;
    readonly tertunda: boolean;
}

export function PemilihFoto({ maks, foto, onFoto, label, galat }: { readonly maks: number; readonly foto: readonly FotoTerpilih[]; readonly onFoto: (f: readonly FotoTerpilih[]) => void; readonly label: string; readonly galat?: string | undefined }) {
    const id = useId();
    const [sibuk, setSibuk] = useState(false);
    const [pesan, setPesan] = useState<string | null>(null);
    const pilih = async (berkas: FileList | null) => {
        if (berkas === null || berkas.length === 0) return;
        const sisa = maks - foto.length;
        const daftar = [...berkas].filter((b) => b.type.startsWith("image/")).slice(0, sisa);
        setPesan(berkas.length > sisa ? `Paling banyak ${String(maks)} foto — sebagian tidak ditambahkan.` : null);
        setSibuk(true);
        const baru: FotoTerpilih[] = [];
        try {
            for (const b of daftar) {
                const h = await unggahFoto(b);
                baru.push({ nama: b.name, fileId: h.fileId, tertunda: h.tertunda });
            }
        } catch {
            setPesan("Foto belum dapat dipesan. Periksa koneksi lalu coba lagi.");
        } finally {
            onFoto([...foto, ...baru]);
            setSibuk(false);
        }
    };
    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={id} className="text-sm font-medium text-text-primary">
                {label}
            </label>
            <input
                id={id}
                type="file"
                accept="image/*"
                multiple
                disabled={sibuk || foto.length >= maks}
                aria-invalid={galat !== undefined || undefined}
                aria-describedby={galat !== undefined ? `${id}-galat` : undefined}
                onChange={(e) => {
                    void pilih(e.target.files);
                    e.target.value = "";
                }}
                className="text-base text-text-primary file:mr-3 file:min-h-control-md file:rounded-md file:border file:border-border-strong file:bg-surface-default file:px-4 file:text-base file:font-medium"
            />
            {sibuk && <p className="text-sm text-text-secondary">Mengunggah foto…</p>}
            {pesan !== null && <p className="text-sm text-text-secondary">{pesan}</p>}
            {galat !== undefined && (
                <p id={`${id}-galat`} className="text-sm text-error-base">
                    {galat}
                </p>
            )}
            {foto.length > 0 && (
                <ul aria-label="Foto terpilih" className="flex flex-col gap-1">
                    {foto.map((f) => (
                        <li key={f.fileId} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border-subtle px-3 py-2">
                            <span className="flex items-center gap-2 text-sm text-text-primary">
                                {f.nama}
                                <Lencana varian={f.tertunda ? "warning" : "success"}>{f.tertunda ? "Unggahan tertunda" : "Terunggah"}</Lencana>
                            </span>
                            <Tombol varian="tertiary" aria-label={`Lepas foto ${f.nama}`} onClick={() => onFoto(foto.filter((x) => x.fileId !== f.fileId))}>
                                Lepas
                            </Tombol>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
