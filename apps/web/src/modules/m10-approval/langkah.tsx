// Langkah persetujuan berurutan + pemilih approver P-69 (Lampiran D.5, UX §7.6.5). Pengguna
// dipilih lewat role lebih dulu, lalu pengguna AKTIF role itu (keputusan PR-02-34). Pemilih
// approver cadangan setingkat aturan, opsional, bawaan Administrator (RE-11, UXD-09).

import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Isian, Pilihan, Tombol } from "../../shared/ui/primitives";
import { kueriPengguna, kueriPenggunaRole } from "./api";
import type { Role } from "./api";
import { LABEL_PERILAKU_SLA, approverKosong, langkahBaru } from "./model";
import type { ModelApprover, ModelLangkah, PetaGalat } from "./model";

/** Batas skema D.5 (`steps` 1..10). */
const LANGKAH_MAKS = 10;

export function PemilihPengguna({ label, value, onUbah, galat, roles }: { readonly label: string; readonly value: number | null; readonly onUbah: (id: number | null) => void; readonly galat?: string | undefined; readonly roles: readonly Role[] }) {
    const tersimpan = useQuery({ ...kueriPengguna(value ?? 0), enabled: value !== null });
    const [role, setRole] = useState<string | null>(null);
    const roleId = role ?? tersimpan.data?.role_id ?? "";
    const daftar = useQuery(kueriPenggunaRole(roleId));
    const opsi = (daftar.data ?? []).map((u) => ({ nilai: u.id, label: u.nama }));
    // Pengguna tersimpan yang kini nonaktif tidak ada di daftar AKTIF — tetap ditampilkan agar terlihat (RE-13).
    if (value !== null && tersimpan.data !== undefined && tersimpan.data.role_id === roleId && !opsi.some((o) => o.nilai === String(value))) {
        opsi.push({ nilai: String(value), label: `${tersimpan.data.nama} (nonaktif)` });
    }
    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Pilihan
                label={`${label}: role`}
                kosong="Pilih role"
                value={roleId}
                opsi={roles.filter((r) => r.permissions.some((p) => p.kode === "approval.decide")).map((r) => ({ nilai: r.id, label: r.nama }))}
                onChange={(e) => {
                    setRole(e.target.value);
                    onUbah(null);
                }}
            />
            <Pilihan
                label={`${label}: pengguna`}
                kosong={daftar.isFetching ? "Memuat pengguna…" : "Pilih pengguna"}
                disabled={roleId === ""}
                value={value === null ? "" : String(value)}
                galat={galat}
                opsi={opsi}
                bantuan="Hanya pengguna aktif yang memegang wewenang memutus persetujuan."
                onChange={(e) => onUbah(e.target.value === "" ? null : Number(e.target.value))}
            />
        </div>
    );
}

export function PemilihApprover({
    legend,
    value,
    onUbah,
    galat,
    jalur,
    roles,
    bolehKosong = false,
}: {
    readonly legend: string;
    readonly value: ModelApprover | null;
    readonly onUbah: (a: ModelApprover | null) => void;
    readonly galat: PetaGalat;
    /** Awalan jalur galat: `steps.0.` atau `fallback_approver.`. */
    readonly jalur: string;
    readonly roles: readonly Role[];
    readonly bolehKosong?: boolean;
}) {
    const nama = useId();
    const pilihan = value === null ? "kosong" : value.tipe;
    const opsi = [...(bolehKosong ? [{ nilai: "kosong", label: "Bawaan: Administrator" }] : []), { nilai: "role", label: "Role" }, { nilai: "user", label: "Pengguna tertentu" }];
    return (
        <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-text-primary">{legend}</legend>
            {/* C-11: radio asli dalam fieldset; seluruh opsi terlihat. */}
            <div className="flex flex-wrap gap-4">
                {opsi.map((o) => (
                    <label key={o.nilai} className="flex min-h-touch cursor-pointer items-center gap-2 text-base text-text-primary">
                        <input
                            type="radio"
                            name={nama}
                            value={o.nilai}
                            checked={pilihan === o.nilai}
                            className="size-icon-md accent-teal-600"
                            onChange={() => onUbah(o.nilai === "kosong" ? null : { ...approverKosong(), tipe: o.nilai === "user" ? "user" : "role" })}
                        />
                        {o.label}
                    </label>
                ))}
            </div>
            {value?.tipe === "role" && (
                <Pilihan label="Role approver" kosong="Pilih role" value={value.role} galat={galat[`${jalur}approver_role`]} opsi={roles.map((r) => ({ nilai: r.kode, label: r.nama }))} onChange={(e) => onUbah({ ...value, role: e.target.value })} />
            )}
            {value?.tipe === "user" && <PemilihPengguna label="Approver" value={value.user} roles={roles} galat={galat[`${jalur}approver_user_id`]} onUbah={(id) => onUbah({ ...value, user: id })} />}
        </fieldset>
    );
}

export function DaftarLangkah({ langkah, onUbah, galat, roles }: { readonly langkah: readonly ModelLangkah[]; readonly onUbah: (l: readonly ModelLangkah[]) => void; readonly galat: PetaGalat; readonly roles: readonly Role[] }) {
    const ganti = (i: number, l: ModelLangkah) => onUbah(langkah.map((x, j) => (j === i ? l : x)));
    const tukar = (i: number, j: number) => {
        const baru = [...langkah];
        [baru[i], baru[j]] = [baru[j] as ModelLangkah, baru[i] as ModelLangkah];
        onUbah(baru);
    };
    return (
        <section aria-labelledby="judul-langkah" className="flex flex-col gap-4">
            <h2 id="judul-langkah" className="text-lg font-semibold text-text-heading">
                Langkah persetujuan
            </h2>
            {galat["steps"] !== undefined && <p className="text-sm text-error-base">{galat["steps"]}</p>}
            <ol className="flex flex-col gap-4">
                {langkah.map((l, i) => {
                    const p = `steps.${String(i)}.`;
                    return (
                        <li key={l.kunci} data-jalur={`steps.${String(i)}`} className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-default p-4">
                            <h3 className="text-base font-semibold text-text-heading">Langkah {i + 1}</h3>
                            <PemilihApprover legend="Approver" jalur={p} value={l.approver} galat={galat} roles={roles} onUbah={(a) => ganti(i, { ...l, approver: a ?? approverKosong() })} />
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <Isian label="SLA (jam kerja)" type="number" min={1} max={720} required value={l.sla} galat={galat[`${p}sla_hours`]} onChange={(e) => ganti(i, { ...l, sla: e.target.value })} />
                                <Pilihan
                                    label="Bila SLA terlampaui"
                                    value={l.perilaku}
                                    opsi={(["remind", "escalate"] as const).map((x) => ({ nilai: x, label: LABEL_PERILAKU_SLA[x] }))}
                                    onChange={(e) => ganti(i, { ...l, perilaku: e.target.value === "escalate" ? "escalate" : "remind", eskalasi: null })}
                                />
                            </div>
                            {l.perilaku === "escalate" && <PemilihPengguna label="Eskalasi ke" value={l.eskalasi} roles={roles} galat={galat[`${p}escalate_to_user_id`]} onUbah={(id) => ganti(i, { ...l, eskalasi: id })} />}
                            <div className="flex flex-wrap gap-2">
                                <Tombol varian="tertiary" disabled={i === 0} onClick={() => tukar(i, i - 1)} aria-label={`Naikkan langkah ${String(i + 1)}`}>
                                    Naikkan
                                </Tombol>
                                <Tombol varian="tertiary" disabled={i === langkah.length - 1} onClick={() => tukar(i, i + 1)} aria-label={`Turunkan langkah ${String(i + 1)}`}>
                                    Turunkan
                                </Tombol>
                                <Tombol varian="tertiary" ikon="tutup" disabled={langkah.length === 1} onClick={() => onUbah(langkah.filter((_, j) => j !== i))} aria-label={`Hapus langkah ${String(i + 1)}`}>
                                    Hapus
                                </Tombol>
                            </div>
                        </li>
                    );
                })}
            </ol>
            {langkah.length < LANGKAH_MAKS && (
                <Tombol varian="secondary" className="self-start" onClick={() => onUbah([...langkah, langkahBaru()])}>
                    Tambah langkah
                </Tombol>
            )}
        </section>
    );
}
