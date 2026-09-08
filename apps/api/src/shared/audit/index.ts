// Permukaan publik shared/audit (SDD-SYS-06): AuditLogger dan verifikasi rantai.
export type { AuditEntry, OpsiAuditLogger } from './audit-logger.js';
export { AuditLogger, PELAKU_SISTEM } from './audit-logger.js';
export type { BarisKanonik, FieldKanonik } from './canonical.js';
export { URUTAN_FIELD, hashBaris, jsonTerurut, kanonikal } from './canonical.js';
export type { HasilVerifikasi, KerusakanRantai } from './chain-verifier.js';
export { BULAN_PARTISI_KE_DEPAN, ensurePartitions, verifyChain } from './chain-verifier.js';
