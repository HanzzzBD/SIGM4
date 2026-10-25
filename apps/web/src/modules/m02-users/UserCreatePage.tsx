import {useUnsavedChanges} from "../../shared/ui/unsaved-changes";
// P-61 Tambah Pengguna (UX §6 `/pengguna/baru`; FR-02.1 langkah 2–5; PR-01-19). Sukses → P-63 dengan password
// sementara tampil SATU kali lewat titipan memori (rahasia.ts). Tanpa `user.view` P-63 tak dapat dibuka, maka
// password ditampilkan di sini (rencana §1a) — tidak pernah terdampar di balik P-08.

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCan } from "../../shared/auth";
import { jalurDrilldown } from "../../shared/navigasi";
import type { IsianPengguna } from "./api";
import { buatPengguna } from "./api";
import { FormPengguna, PanelRahasia } from "./form";
import { titipRahasia, useAksiRahasia } from "./rahasia";

export default function UserCreatePage({ onDibuat, onBatal }: { readonly onDibuat: (id: string) => void; readonly onBatal: () => void }) {
    const can = useCan();
    const queryClient = useQueryClient();
    const [tampil, setTampil] = useState<{ readonly nama: string; readonly rahasia: string } | null>(null);
    const simpan = useAksiRahasia(buatPengguna);
    const [dirty,setDirty]=useState(false),guard=useUnsavedChanges(dirty&&tampil===null);

    async function kirim(isian: IsianPengguna): Promise<void> {
        const u = await simpan.jalankan(isian);
        if (u === undefined) return;
        void queryClient.invalidateQueries({ queryKey: ["users", "daftar"] });
        if (can("user.view") && jalurDrilldown("P-63") !== null) {
            titipRahasia(`buat:${u.id}`, u.password_sementara);
            guard.allow();onDibuat(u.id);
        } else setTampil({ nama: u.nama, rahasia: u.password_sementara });
    }

    return (
        <div onChangeCapture={()=>setDirty(true)} className="mx-auto flex w-full max-w-md flex-col gap-6">{guard.prompt}
            <header>
                <h1 className="text-2xl font-semibold text-text-heading">Tambah Pengguna</h1>
                <p className="mt-2 text-base text-text-secondary">Akun baru menerima password sementara yang wajib diganti saat masuk pertama.</p>
            </header>
            {tampil === null ? (
                <FormPengguna labelKirim="Simpan pengguna" sibuk={simpan.sibuk} galat={simpan.galat} onKirim={(isian) => void kirim(isian)} onBatal={onBatal} />
            ) : (
                <PanelRahasia judul={`Akun ${tampil.nama} dibuat`} label="Password sementara" rahasia={tampil.rahasia} onTutup={() => { setTampil(null); onBatal(); }} />
            )}
        </div>
    );
}
