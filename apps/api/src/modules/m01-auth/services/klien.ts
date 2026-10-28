// Jejak klien pada permintaan autentikasi (AL-02): IP dan perangkat. Dipakai `AuthService`
// dan `SessionService` agar batas panjang dan bentuk entri log tidak tersalin dua kali.

import type { AuditEntry } from "../../../shared/audit/index.js";

const BATAS_USER_AGENT = 500;

export interface KlienPermintaan {
    readonly ip: string | undefined;
    readonly userAgent: string | undefined;
}

export function potongUserAgent(ua: string | undefined): string | undefined {
    return ua === undefined ? undefined : ua.slice(0, BATAS_USER_AGENT);
}

/** IP dan perangkat pada entri log (AL-02); kunci yang tak diketahui tidak disertakan. */
export function jejakKlien(klien: KlienPermintaan): Pick<AuditEntry, "ip" | "userAgent"> {
    const userAgent = potongUserAgent(klien.userAgent);
    return {
        ...(klien.ip === undefined ? {} : { ip: klien.ip }),
        ...(userAgent === undefined ? {} : { userAgent }),
    };
}
