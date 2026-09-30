// C-28 Drawer varian `confirm` (modal konfirmasi) di atas Radix Dialog (SDD-FE-13): fokus
// terkunci di dalam dan kembali ke pemicu saat tertutup, `role="dialog"` + `aria-modal`.
// Judul menyatakan konsekuensi, badan menyebut dampak turunan, tombol utama berlabel kata
// kerja. Aksi destruktif UX §7.2 wajib alasan: tombol utama nonaktif sampai alasan terisi (UX-04).

import * as Dialog from "@radix-ui/react-dialog";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Tombol } from "./primitives";

export interface OpsiKonfirmasi {
    readonly buka: boolean;
    readonly onTutup: () => void;
    readonly judul: string;
    readonly children: ReactNode;
    readonly labelAksi: string;
    readonly varian?: "primary" | "danger";
    /** Diisi = alasan wajib (UX §7.2); nilainya diteruskan ke `onKonfirmasi`. */
    readonly labelAlasan?: string;
    readonly sibuk?: boolean;
    readonly galat?: string | undefined;
    readonly onKonfirmasi: (alasan: string) => void;
}

export function DialogKonfirmasi({ buka, onTutup, judul, children, labelAksi, varian = "primary", labelAlasan, sibuk = false, galat, onKonfirmasi }: OpsiKonfirmasi) {
    const [alasan, setAlasan] = useState("");
    const idAlasan = useId();
    const kurangAlasan = labelAlasan !== undefined && alasan.trim() === "";
    return (
        <Dialog.Root
            open={buka}
            onOpenChange={(o) => {
                if (!o && !sibuk) {
                    setAlasan("");
                    onTutup();
                }
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-overlay" />
                <Dialog.Content className="fixed top-1/2 left-1/2 flex w-full max-w-modal-sm -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border-subtle bg-surface-default p-6 shadow-2">
                    <Dialog.Title className="text-lg font-semibold text-text-heading">{judul}</Dialog.Title>
                    <Dialog.Description asChild>
                        <div className="text-base text-text-secondary">{children}</div>
                    </Dialog.Description>
                    {labelAlasan !== undefined && (
                        <div className="flex flex-col gap-2">
                            <label htmlFor={idAlasan} className="text-sm font-medium text-text-primary">
                                {labelAlasan}
                                <span className="font-regular text-text-secondary"> (wajib)</span>
                            </label>
                            <textarea
                                id={idAlasan}
                                value={alasan}
                                maxLength={500}
                                rows={3}
                                onChange={(e) => setAlasan(e.target.value)}
                                className="rounded-sm border border-border-strong bg-surface-default px-4 py-3 text-base text-text-primary hover:border-neutral-500"
                            />
                        </div>
                    )}
                    {galat !== undefined && (
                        <p role="alert" className="text-sm text-error-base">
                            {galat}
                        </p>
                    )}
                    <footer className="flex flex-wrap justify-end gap-3 border-t border-border-subtle pt-4">
                        <Dialog.Close asChild>
                            <Tombol varian="secondary" disabled={sibuk}>
                                Batal
                            </Tombol>
                        </Dialog.Close>
                        <Tombol varian={varian} sibuk={sibuk} disabled={kurangAlasan} onClick={() => onKonfirmasi(alasan.trim())}>
                            {labelAksi}
                        </Tombol>
                    </footer>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
