// Panel Pratinjau P-69 (RE-07, FR-10.1 AC 3, UX §7.6.5): selalu terlihat di kolom kanan.
// Skenario contoh → aturan yang terpilih, seluruh aturan yang cocok + prioritasnya, dan
// rangkaian langkah yang akan terbentuk — dari evaluator server yang SAMA dengan pengajuan
// sungguhan (SDD-APR-10). Approver pengguna yang sedang nonaktif ditandai (RE-13, SDD-APR-14).

import { useMutation, useQueries } from "@tanstack/react-query";
import { FIELD_DSL, fieldBerlaku } from "@sigm4/schemas";
import { useState } from "react";
import { Isian, Kartu, Lencana, Peringatan, Tombol } from "../../shared/ui/primitives";
import { kueriPengguna, pratinjau } from "./api";
import type { Fakta, HasilPratinjau, Role } from "./api";
import { IsianNilai } from "./kondisi";
import { LABEL_FIELD, LABEL_PERILAKU_SLA, galatDefinisi, keDefinisi, periksaModel } from "./model";
import type { ModelAturan, PetaGalat } from "./model";

function namaAturan(t: { readonly rule_id: number | null; readonly draf: boolean }): string {
    if (t.draf) return "Aturan yang sedang disusun ini";
    return `Aturan #${String(t.rule_id)}`;
}

function Hasil({ h }: { readonly h: HasilPratinjau }) {
    const t = h.terpilih;
    return (
        <div className="flex flex-col gap-4">
            <div>
                <h3 className="text-base font-semibold text-text-heading">Aturan yang akan terpilih</h3>
                <p className="text-base text-text-primary">
                    {t.bawaan ? "Aturan bawaan — tidak ada aturan yang cocok" : `${namaAturan(t)} · prioritas ${String(t.prioritas)}${t.versi === null ? "" : ` · versi ${String(t.versi)}`}`}
                </p>
            </div>
            <div>
                <h3 className="text-base font-semibold text-text-heading">Seluruh aturan yang cocok</h3>
                {h.cocok.length === 0 ? (
                    <p className="text-sm text-text-secondary">Tidak ada — aturan bawaan berlaku (RE-06).</p>
                ) : (
                    <ol className="list-decimal pl-6 text-base text-text-primary">
                        {h.cocok.map((c) => (
                            <li key={`${String(c.rule_id)}-${String(c.draf)}`}>
                                {namaAturan(c)} · prioritas {c.prioritas}
                            </li>
                        ))}
                    </ol>
                )}
            </div>
            <div>
                <h3 className="text-base font-semibold text-text-heading">Rangkaian langkah</h3>
                <ol className="flex flex-col gap-2">
                    {h.langkah.map((l) => (
                        <li key={l.urutan} className="flex flex-col gap-1 border-b border-border-subtle pb-2">
                            <span className="font-medium text-text-primary">
                                Langkah {l.urutan}: {l.approver.tipe === "role" ? (l.approver.role?.nama ?? "Role tidak dikenal") : (l.approver.user?.nama ?? "Pengguna tidak dikenal")}
                            </span>
                            <span className="text-sm text-text-secondary">
                                SLA {l.sla_jam} jam · {LABEL_PERILAKU_SLA[l.on_sla_breach]}
                                {l.eskalasi_ke !== null && ` · eskalasi ke ${l.eskalasi_ke.nama ?? "pengguna tidak dikenal"}`}
                            </span>
                            <span className="flex flex-wrap gap-2">
                                {l.fallback && <Lencana varian="info">Approver cadangan (RE-11)</Lencana>}
                                {l.akan_dilewati !== null && <Lencana varian="warning">{`Dilewati — ${l.akan_dilewati}`}</Lencana>}
                            </span>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}

/** RE-13: approver/eskalasi/cadangan bertipe pengguna yang kini nonaktif — peringatan, bukan penghalang simpan. */
function useApproverNonaktif(m: ModelAturan): string[] {
    const ids = [...new Set([...m.langkah.flatMap((l) => [l.approver.tipe === "user" ? l.approver.user : null, l.perilaku === "escalate" ? l.eskalasi : null]), m.fallback?.tipe === "user" ? m.fallback.user : null].filter((x): x is number => x !== null))];
    return useQueries({ queries: ids.map((id) => kueriPengguna(id)) })
        .map((q) => q.data)
        .filter((u) => u !== undefined && u.status !== "AKTIF")
        .map((u) => u?.nama ?? "");
}

export function PanelPratinjau({ model, idAturan, roles, onGalat }: { readonly model: ModelAturan; readonly idAturan: number | null; readonly roles: readonly Role[]; readonly onGalat: (g: PetaGalat) => void }) {
    const [fakta, setFakta] = useState<Record<string, unknown>>({});
    const [pemohon, setPemohon] = useState("");
    const [versiDijalankan, setVersiDijalankan] = useState<string | null>(null);
    const nonaktif = useApproverNonaktif(model);
    const definisi = keDefinisi(model);
    const kini = JSON.stringify(definisi);
    const jalan = useMutation({
        mutationFn: () => {
            const isi = Object.fromEntries(Object.entries(fakta).filter(([f, v]) => v !== undefined && fieldBerlaku(model.jenis).includes(f))) as Fakta;
            const id = pemohon.trim() === "" ? undefined : Number(pemohon);
            return pratinjau({ jenis_pengajuan: model.jenis, fakta: id === undefined ? isi : { ...isi, requester_id: id }, ...(id === undefined ? {} : { pemohon_id: id }), aturan_draf: { ...definisi, ...(idAturan === null ? {} : { id: idAturan }) } });
        },
        onSuccess: () => onGalat({}),
        onError: (g) => onGalat(galatDefinisi(g) ?? {}),
    });
    const mulai = () => {
        const g = periksaModel(model);
        onGalat(g);
        if (Object.keys(g).length > 0) return;
        setVersiDijalankan(kini);
        jalan.mutate();
    };
    return (
        <Kartu judul="Pratinjau">
            <p className="text-sm text-text-secondary">Masukkan skenario pengajuan contoh. Isian kosong dianggap tidak diketahui.</p>
            {nonaktif.length > 0 && <Peringatan varian="warning" judul="Approver sedang nonaktif">{`${nonaktif.join(", ")} — langkahnya akan dilewati saat pengajuan (RE-13). Aturan tetap dapat disimpan.`}</Peringatan>}
            <div className="flex flex-col gap-3">
                <Isian label="ID pengguna pemohon (opsional)" type="number" min={1} value={pemohon} bantuan="Diisi untuk melihat langkah yang dilewati karena konflik kepentingan atau approver nonaktif." onChange={(e) => setPemohon(e.target.value)} />
                {fieldBerlaku(model.jenis)
                    .filter((f) => f !== "requester_id")
                    .map((f) => (
                        <IsianNilai key={f} label={LABEL_FIELD[f] ?? f} field={f} op={FIELD_DSL[f]?.tipe === "integer_array" ? "in" : "eq"} value={fakta[f]} roles={roles} onUbah={(v) => setFakta((x) => ({ ...x, [f]: v }))} />
                    ))}
            </div>
            <Tombol varian="secondary" ikon="muatUlang" sibuk={jalan.isPending} onClick={mulai}>
                Jalankan pratinjau
            </Tombol>
            <div aria-live="polite" className="flex flex-col gap-3">
                {jalan.isError && <Peringatan varian="error">{galatDefinisi(jalan.error) === null ? jalan.error.message : "Aturan belum valid — periksa isian yang ditandai di formulir."}</Peringatan>}
                {jalan.data !== undefined && !jalan.isPending && (
                    <>
                        {versiDijalankan !== kini && <Peringatan varian="info">Aturan telah berubah sejak pratinjau ini — jalankan ulang.</Peringatan>}
                        <Hasil h={jalan.data} />
                    </>
                )}
            </div>
        </Kartu>
    );
}
