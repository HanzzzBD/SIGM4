// Penyusun kondisi visual P-69 (UX §7.6.5, Lampiran D.1–D.3): node grup AND/OR dan node
// predikat field · op · value. Hanya field D.2 yang berlaku bagi jenis pengajuan terpilih
// yang ditawarkan (RE-02); operator dibatasi tipe field (D.3); grup tingkat keempat tidak
// ditawarkan (D.1). Galat 422 tampil pada node bermasalah (RE-08).

import { FIELD_DSL, KEDALAMAN_GRUP_MAKS, LABEL_ALASAN_PENGHAPUSAN, LABEL_JENIS_RUANGAN, LABEL_PRIORITAS, OPERATOR_PER_TIPE, fieldBerlaku } from "@sigm4/schemas";
import type { JenisPengajuan, Operator } from "@sigm4/schemas";
import { useState } from "react";
import { Ikon } from "../../shared/ui/icon";
import { Isian, KotakCentang, Pilihan, Tombol } from "../../shared/ui/primitives";
import type { Role } from "./api";
import { LABEL_FIELD, LABEL_OPERATOR, grupKosong, kunciBaru, operatorAwal } from "./model";
import type { NodeGrup, NodeKondisi, NodePredikat, PetaGalat } from "./model";

interface Konteks {
    readonly jenis: JenisPengajuan;
    readonly galat: PetaGalat;
    readonly roles: readonly Role[];
}

const LABEL_NILAI_ENUM: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    room_type: LABEL_JENIS_RUANGAN,
    disposal_reason: LABEL_ALASAN_PENGHAPUSAN,
    priority: LABEL_PRIORITAS,
};

/** Opsi nilai enum: himpunan tertutup Bab 11.3, atau role (kode → nama) bagi `requester_role`. */
export function opsiEnum(field: string, roles: readonly Role[]): { nilai: string; label: string }[] {
    const sah = FIELD_DSL[field]?.nilaiSah;
    if (sah === undefined) return roles.map((r) => ({ nilai: r.kode, label: r.nama }));
    return sah.map((k) => ({ nilai: k, label: LABEL_NILAI_ENUM[field]?.[k] ?? k }));
}

const angka = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));

function DaftarId({ label, value, onUbah, galat }: { readonly label: string; readonly value: unknown; readonly onUbah: (v: unknown) => void; readonly galat?: string | undefined }) {
    const [teks, setTeks] = useState(Array.isArray(value) ? value.join(", ") : "");
    return (
        <Isian
            label={label}
            bantuan="Daftar ID, pisahkan dengan koma."
            inputMode="numeric"
            value={teks}
            galat={galat}
            onChange={(e) => {
                setTeks(e.target.value);
                const isi = e.target.value.split(",").map((x) => x.trim()).filter((x) => x !== "");
                onUbah(isi.length === 0 ? undefined : isi.map(Number));
            }}
        />
    );
}

/** Isian `value` menurut tipe field dan operator (D.3). Diekspor untuk skenario pratinjau. */
export function IsianNilai({ label = "Nilai", field, op, value, onUbah, galat, roles }: { readonly label?: string; readonly field: string; readonly op: Operator; readonly value: unknown; readonly onUbah: (v: unknown) => void; readonly galat?: string | undefined; readonly roles: readonly Role[] }) {
    const tipe = FIELD_DSL[field]?.tipe;
    if (op === "is_true" || op === "is_false" || tipe === undefined) return null;
    if (tipe === "boolean") {
        return <Pilihan label={label} kosong="Pilih nilai" value={value === undefined ? "" : String(value)} galat={galat} opsi={[{ nilai: "true", label: "Ya" }, { nilai: "false", label: "Tidak" }]} onChange={(e) => onUbah(e.target.value === "" ? undefined : e.target.value === "true")} />;
    }
    if (tipe === "enum") {
        const opsi = opsiEnum(field, roles);
        if (op === "eq" || op === "neq") return <Pilihan label={label} kosong="Pilih nilai" value={typeof value === "string" ? value : ""} galat={galat} opsi={opsi} onChange={(e) => onUbah(e.target.value === "" ? undefined : e.target.value)} />;
        const pilih = Array.isArray(value) ? (value as string[]) : [];
        return (
            <fieldset className="flex flex-col gap-1" aria-invalid={galat !== undefined || undefined}>
                <legend className="text-sm font-medium text-text-primary">{label}</legend>
                {opsi.map((o) => (
                    <KotakCentang key={o.nilai} label={o.label} checked={pilih.includes(o.nilai)} onCheckedChange={(v) => {
                        const baru = v ? [...pilih, o.nilai] : pilih.filter((x) => x !== o.nilai);
                        onUbah(baru.length === 0 ? undefined : baru);
                    }} />
                ))}
                {galat !== undefined && <p className="text-sm text-error-base">{galat}</p>}
            </fieldset>
        );
    }
    if (tipe === "integer_array") return <DaftarId label={label} value={value} onUbah={onUbah} galat={galat} />;
    const langkah = tipe === "decimal" ? "any" : "1";
    if (op === "between") {
        const [a, b] = Array.isArray(value) ? (value as (number | undefined)[]) : [undefined, undefined];
        const ubah = (x: number | undefined, y: number | undefined) => onUbah(x === undefined && y === undefined ? undefined : [x, y]);
        return (
            <div className="grid grid-cols-2 gap-3">
                <Isian label="Dari" type="number" step={langkah} value={a ?? ""} galat={galat} onChange={(e) => ubah(angka(e.target.value), b)} />
                <Isian label="Sampai" type="number" step={langkah} value={b ?? ""} onChange={(e) => ubah(a, angka(e.target.value))} />
            </div>
        );
    }
    return <Isian label={label} type="number" step={langkah} value={typeof value === "number" ? value : ""} galat={galat} onChange={(e) => onUbah(angka(e.target.value))} />;
}

function Predikat({ node, jalur, k, onUbah, onHapus }: { readonly node: NodePredikat; readonly jalur: string; readonly k: Konteks; readonly onUbah: (n: NodePredikat) => void; readonly onHapus: () => void }) {
    const berlaku = fieldBerlaku(k.jenis);
    const tidakBerlaku = !berlaku.includes(node.field);
    const opsiField = [...berlaku, ...(tidakBerlaku ? [node.field] : [])].map((f) => ({ nilai: f, label: `${LABEL_FIELD[f] ?? f}${berlaku.includes(f) ? "" : " (tidak berlaku)"}` }));
    const tipe = FIELD_DSL[node.field]?.tipe;
    const galatField = k.galat[`${jalur}.field`] ?? (tidakBerlaku ? "Field ini tidak berlaku bagi jenis pengajuan terpilih — ganti atau hapus syarat ini." : undefined);
    return (
        <li data-jalur={jalur} className="grid grid-cols-1 items-start gap-3 rounded-md border border-border-subtle bg-surface-default p-4 md:grid-cols-3">
            <Pilihan label="Field" value={node.field} galat={galatField} opsi={opsiField} onChange={(e) => onUbah({ jenis: "predikat", kunci: node.kunci, field: e.target.value, op: operatorAwal(e.target.value) })} />
            <Pilihan
                label="Operator"
                value={node.op}
                galat={k.galat[`${jalur}.op`]}
                opsi={(tipe === undefined ? [] : OPERATOR_PER_TIPE[tipe]).map((o) => ({ nilai: o, label: LABEL_OPERATOR[o] }))}
                onChange={(e) => onUbah({ jenis: "predikat", kunci: node.kunci, field: node.field, op: e.target.value as Operator })}
            />
            <IsianNilai field={node.field} op={node.op} value={node.value} roles={k.roles} galat={k.galat[`${jalur}.value`] ?? k.galat[jalur]} onUbah={(v) => onUbah(v === undefined ? { jenis: "predikat", kunci: node.kunci, field: node.field, op: node.op } : { ...node, value: v })} />
            <div className="md:col-span-3">
                <Tombol varian="tertiary" ikon="tutup" onClick={onHapus}>
                    Hapus syarat
                </Tombol>
            </div>
        </li>
    );
}

export function GrupKondisi({ node, jalur, tingkat, k, onUbah, onHapus }: { readonly node: NodeGrup; readonly jalur: string; readonly tingkat: number; readonly k: Konteks; readonly onUbah: (n: NodeGrup) => void; readonly onHapus?: () => void }) {
    const ubahAnak = (i: number, n: NodeKondisi | null) => onUbah({ ...node, anak: n === null ? node.anak.filter((_, j) => j !== i) : node.anak.map((x, j) => (j === i ? n : x)) });
    const pertama = fieldBerlaku(k.jenis)[0] ?? "requester_role";
    const galat = k.galat[jalur] ?? k.galat[`${jalur}.conditions`];
    return (
        <fieldset data-jalur={jalur} className="flex flex-col gap-3 rounded-md border border-border-subtle p-4" aria-invalid={galat !== undefined || undefined}>
            <legend className="px-1 text-sm font-medium text-text-primary">{tingkat === 1 ? "Kondisi aturan" : `Grup tingkat ${String(tingkat)}`}</legend>
            <Pilihan
                label="Gabungan syarat"
                value={node.operator}
                opsi={[
                    { nilai: "AND", label: "Semua syarat terpenuhi (AND)" },
                    { nilai: "OR", label: "Salah satu syarat terpenuhi (OR)" },
                ]}
                onChange={(e) => onUbah({ ...node, operator: e.target.value === "OR" ? "OR" : "AND" })}
            />
            {galat !== undefined && (
                <p className="flex items-center gap-1 text-sm text-error-base">
                    <Ikon nama="galat" ukuran="sm" />
                    {galat}
                </p>
            )}
            {node.anak.length === 0 ? (
                <p className="text-sm text-text-secondary">{tingkat === 1 ? "Tanpa syarat — aturan ini cocok untuk setiap pengajuan berjenis ini." : "Grup kosong — tambahkan syarat atau hapus grup ini."}</p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {node.anak.map((a, i) => {
                        const j = `${jalur}.conditions.${String(i)}`;
                        return a.jenis === "grup" ? (
                            <li key={a.kunci}>
                                <GrupKondisi node={a} jalur={j} tingkat={tingkat + 1} k={k} onUbah={(n) => ubahAnak(i, n)} onHapus={() => ubahAnak(i, null)} />
                            </li>
                        ) : (
                            <Predikat key={a.kunci} node={a} jalur={j} k={k} onUbah={(n) => ubahAnak(i, n)} onHapus={() => ubahAnak(i, null)} />
                        );
                    })}
                </ul>
            )}
            <div className="flex flex-wrap gap-2">
                <Tombol varian="secondary" onClick={() => onUbah({ ...node, anak: [...node.anak, { jenis: "predikat", kunci: kunciBaru(), field: pertama, op: operatorAwal(pertama) }] })}>
                    Tambah syarat
                </Tombol>
                {/* D.1: grup tingkat keempat ditolak di antarmuka — tombolnya tidak ditawarkan. */}
                {tingkat < KEDALAMAN_GRUP_MAKS && (
                    <Tombol varian="secondary" onClick={() => onUbah({ ...node, anak: [...node.anak, grupKosong(node.operator === "AND" ? "OR" : "AND")] })}>
                        Tambah grup
                    </Tombol>
                )}
                {onHapus !== undefined && (
                    <Tombol varian="tertiary" ikon="tutup" onClick={onHapus}>
                        Hapus grup
                    </Tombol>
                )}
            </div>
        </fieldset>
    );
}
