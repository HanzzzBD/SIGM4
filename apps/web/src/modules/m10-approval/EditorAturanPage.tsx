// P-69 Editor Approval Rule (FR-10.1, UX §7.6.5, F-25): dua kolom — kiri penyusun aturan,
// kanan panel Pratinjau yang selalu terlihat (RE-07). `422 INVALID_RULE_DEFINITION` tampil
// pada node bermasalah beserta ringkasan yang dapat diklik (RE-08, PATTERNS §4). Menonaktifkan
// wajib beralasan (UX-04) dan memperingatkan bahwa instance berjalan tetap memakai snapshot (FR-10.1 A4).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { JENIS_PENGAJUAN, LABEL_JENIS_PENGAJUAN } from "@sigm4/schemas";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { KeadaanGalat, KeadaanKosong, KeadaanMemuat } from "../../shared/states";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Isian, Lencana, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
import { KUNCI_ATURAN, kueriAturan, kueriRole, simpanAturan, ubahStatusAturan } from "./api";
import type { AturanTersimpan, Role, Terminal } from "./api";
import { GrupKondisi } from "./kondisi";
import { DaftarLangkah, PemilihApprover } from "./langkah";
import { LABEL_TERMINAL, galatDefinisi, keDefinisi, modelDari, periksaModel } from "./model";
import type { ModelAturan, PetaGalat } from "./model";
import { PanelPratinjau } from "./pratinjau";

const kembali = (
    <Link to="/approval-rules" className="font-medium text-text-link hover:text-text-link-hover">
        Kembali ke daftar approval rule
    </Link>
);

/** Jalur galat → node penanda `data-jalur` + nama bagian untuk ringkasan. */
function lokasi(jalur: string): { readonly target: string | null; readonly label: string } {
    if (jalur.startsWith("kondisi")) return { target: jalur.replace(/\.(field|op|value|conditions)$/, ""), label: "Kondisi" };
    const langkah = /^steps\.(\d+)/.exec(jalur);
    if (langkah !== null) return { target: langkah[0], label: `Langkah ${String(Number(langkah[1]) + 1)}` };
    if (jalur.startsWith("fallback_approver")) return { target: "fallback_approver", label: "Approver cadangan" };
    if (jalur === "prioritas") return { target: "prioritas", label: "Prioritas" };
    return { target: null, label: "Aturan" };
}

function RingkasanGalat({ galat }: { readonly galat: PetaGalat }) {
    const butir = Object.entries(galat);
    if (butir.length === 0) return null;
    return (
        <Peringatan varian="error" judul={`${String(butir.length)} isian perlu diperbaiki`}>
            <ul className="flex flex-col gap-1">
                {butir.map(([jalur, pesan]) => {
                    const l = lokasi(jalur);
                    return (
                        <li key={jalur}>
                            <button
                                type="button"
                                className="text-left underline"
                                onClick={() => {
                                    const el = l.target === null ? null : document.querySelector(`[data-jalur="${l.target}"]`);
                                    el?.scrollIntoView({ block: "center" });
                                    el?.querySelector<HTMLElement>("select, input, textarea")?.focus();
                                }}
                            >
                                {l.label}: {pesan}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </Peringatan>
    );
}

function Bagian({ judul, children, jalur }: { readonly judul: string; readonly children: ReactNode; readonly jalur?: string }) {
    return (
        <section data-jalur={jalur} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-text-heading">{judul}</h2>
            {children}
        </section>
    );
}

function Editor({ awal, roles }: { readonly awal: AturanTersimpan | null; readonly roles: readonly Role[] }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const namaTerminal = useId();
    const [model, setModel] = useState<ModelAturan>(() => modelDari(awal));
    const [awalJson] = useState(() => JSON.stringify(keDefinisi(model)));
    const [galat, setGalat] = useState<PetaGalat>({});
    const [dialog, setDialog] = useState<"batal" | "nonaktif" | null>(null);
    const ubah = (m: Partial<ModelAturan>) => setModel((x) => ({ ...x, ...m }));
    const berubah = JSON.stringify(keDefinisi(model)) !== awalJson;
    const id = awal?.id ?? null;

    const simpan = useMutation({
        mutationFn: () => simpanAturan(id, keDefinisi(model)),
        onSuccess: async (a) => {
            await queryClient.invalidateQueries({ queryKey: KUNCI_ATURAN });
            await navigate({ to: "/approval-rules", search: { disimpan: a.id } });
        },
        onError: (g) => setGalat(galatDefinisi(g) ?? {}),
    });
    const status = useMutation({
        mutationFn: (v: { aktif: boolean; alasan?: string }) => ubahStatusAturan(id ?? 0, v.aktif, v.alasan),
        onSuccess: async () => {
            setDialog(null);
            await queryClient.invalidateQueries({ queryKey: KUNCI_ATURAN });
        },
    });
    const kirim = () => {
        const g = periksaModel(model);
        setGalat(g);
        if (Object.keys(g).length === 0) simpan.mutate();
    };

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-text-heading">{awal === null ? "Buat approval rule" : `Ubah approval rule #${String(awal.id)}`}</h1>
                {awal !== null && (
                    <>
                        <Lencana varian={awal.status_aktif ? "success" : "neutral"}>{awal.status_aktif ? "Aktif" : "Nonaktif"}</Lencana>
                        <span className="text-sm text-text-secondary">Versi {awal.versi}</span>
                    </>
                )}
            </header>
            {status.isSuccess && <Peringatan varian="success">{status.data.status_aktif ? "Aturan diaktifkan kembali." : "Aturan dinonaktifkan. Instance yang sedang berjalan tetap memakai snapshot aturan lama hingga selesai."}</Peringatan>}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
                <form
                    noValidate
                    className="flex flex-col gap-8 lg:col-span-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        kirim();
                    }}
                >
                    <RingkasanGalat galat={galat} />
                    {simpan.isError && galatDefinisi(simpan.error) === null && <Peringatan varian="error">{simpan.error.message}</Peringatan>}
                    <Bagian judul="Identitas aturan" jalur="prioritas">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <Pilihan label="Jenis pengajuan" required value={model.jenis} galat={galat["jenis_pengajuan"]} opsi={JENIS_PENGAJUAN.map((j) => ({ nilai: j, label: LABEL_JENIS_PENGAJUAN[j] }))} onChange={(e) => ubah({ jenis: e.target.value as ModelAturan["jenis"] })} />
                            <Isian label="Prioritas" type="number" min={0} required value={model.prioritas} galat={galat["prioritas"]} bantuan="Bila beberapa aturan cocok, prioritas terbesar yang dipakai (RE-04)." onChange={(e) => ubah({ prioritas: e.target.value })} />
                        </div>
                    </Bagian>
                    <GrupKondisi node={model.kondisi} jalur="kondisi" tingkat={1} k={{ jenis: model.jenis, galat, roles }} onUbah={(kondisi) => ubah({ kondisi })} />
                    <DaftarLangkah langkah={model.langkah} galat={galat} roles={roles} onUbah={(langkah) => ubah({ langkah })} />
                    <Bagian judul="Approver cadangan" jalur="fallback_approver">
                        <PemilihApprover legend="Dipakai bila seluruh langkah dilewati (RE-11)" bolehKosong jalur="fallback_approver." value={model.fallback} galat={galat} roles={roles} onUbah={(fallback) => ubah({ fallback })} />
                    </Bagian>
                    <Bagian judul="Bila eskalasi habis tanpa keputusan">
                        <fieldset className="flex flex-col gap-1">
                            <legend className="text-sm text-text-secondary">Persetujuan otomatis tidak pernah tersedia (BR-039a).</legend>
                            {(["hold_and_alert", "auto_reject"] as const satisfies readonly Terminal[]).map((t) => (
                                <label key={t} className="flex min-h-touch cursor-pointer items-center gap-2 text-base text-text-primary">
                                    <input type="radio" name={namaTerminal} checked={model.terminal === t} className="size-icon-md accent-teal-600" onChange={() => ubah({ terminal: t })} />
                                    {LABEL_TERMINAL[t]}
                                </label>
                            ))}
                        </fieldset>
                    </Bagian>
                    <footer className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-6">
                        <Tombol type="submit" sibuk={simpan.isPending}>
                            {awal === null ? "Simpan & aktifkan" : "Simpan perubahan"}
                        </Tombol>
                        <Tombol varian="secondary" onClick={() => (berubah ? setDialog("batal") : void navigate({ to: "/approval-rules" }))}>
                            Batal
                        </Tombol>
                        {awal !== null &&
                            (awal.status_aktif ? (
                                <Tombol varian="tertiary" className="ml-auto" onClick={() => setDialog("nonaktif")}>
                                    Nonaktifkan aturan
                                </Tombol>
                            ) : (
                                <Tombol varian="tertiary" className="ml-auto" sibuk={status.isPending} onClick={() => status.mutate({ aktif: true })}>
                                    Aktifkan kembali
                                </Tombol>
                            ))}
                    </footer>
                </form>
                <aside aria-label="Pratinjau aturan" className="lg:sticky lg:top-4">
                    <PanelPratinjau model={model} idAturan={id} roles={roles} onGalat={setGalat} />
                </aside>
            </div>
            <DialogKonfirmasi buka={dialog === "batal"} onTutup={() => setDialog(null)} judul="Buang perubahan aturan?" labelAksi="Buang perubahan" varian="danger" onKonfirmasi={() => void navigate({ to: "/approval-rules" })}>
                Perubahan yang belum disimpan akan hilang.
            </DialogKonfirmasi>
            <DialogKonfirmasi
                buka={dialog === "nonaktif"}
                onTutup={() => setDialog(null)}
                judul={`Nonaktifkan approval rule #${String(id)}?`}
                labelAksi="Nonaktifkan aturan"
                varian="danger"
                labelAlasan="Alasan menonaktifkan"
                sibuk={status.isPending}
                galat={status.isError ? status.error.message : undefined}
                onKonfirmasi={(alasan) => status.mutate({ aktif: false, alasan })}
            >
                Pengajuan baru tidak lagi dinilai dengan aturan ini. Instance yang sedang berjalan tetap memakai snapshot aturan lama hingga selesai (FR-10.1 A4).
            </DialogKonfirmasi>
        </div>
    );
}

export default function EditorAturanPage({ id }: { readonly id: number | null }) {
    const aturan = useQuery(kueriAturan);
    const roles = useQuery(kueriRole);
    if (aturan.isPending || roles.isPending) return <KeadaanMemuat label="Memuat editor approval rule" baris={8} />;
    if (aturan.isError || roles.isError) {
        return (
            <KeadaanGalat
                galat={aturan.error ?? roles.error}
                onCobaLagi={() => {
                    void aturan.refetch();
                    void roles.refetch();
                }}
            />
        );
    }
    const awal = id === null ? null : (aturan.data.find((a) => a.id === id) ?? null);
    if (id !== null && awal === null) return <KeadaanKosong judul="Approval rule tidak ditemukan" pesan="Aturan yang Anda tuju tidak ada. Periksa kembali tautannya." aksi={kembali} />;
    // Status (aktif/versi) mengikuti data terbaru; model formulir dipertahankan selama id sama.
    return <Editor key={id ?? "baru"} awal={awal} roles={roles.data} />;
}
