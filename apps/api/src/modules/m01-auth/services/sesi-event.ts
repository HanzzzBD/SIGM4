// Event outbox pencabutan sesi (SDD-07 §4.3). Dipakai `SessionService` (logout, cabut perangkat) dan
// `PasswordResetService` (reset administratif mencabut seluruh sesi pengguna) agar bentuk payload-nya satu.
// Konsumennya — menonaktifkan device token FCM (`MOB-SEC-05`) — dipasang `PR-02-25`.

import type { DomainEvent } from "../../../shared/events/index.js";
import type { SesiDicabut } from "../repositories/session.repository.js";

export const EVENT_SESI_DICABUT = "SessionRevoked";

/** `userId` adalah pemilik sesi — pada reset administratif ia BUKAN pelaku permintaan. */
export function eventSesiDicabut(userId: number | string, sesi: SesiDicabut, alasan: string): DomainEvent {
    return {
        name: EVENT_SESI_DICABUT,
        aggregateType: "user",
        aggregateId: userId,
        payload: { user_id: String(userId), family_id: sesi.familyId, platform: sesi.platform, alasan },
    };
}
