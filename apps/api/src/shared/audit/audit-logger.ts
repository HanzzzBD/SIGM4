// AuditLogger (AL-01 … AL-08, SDD-EVT-08, SDD-SYS-06).
//
// Ditulis SINKRON di dalam transaksi bisnis, bukan lewat outbox: `AL-01`
// mewajibkan 100% operasi tulis tercatat, dan outbox membuka jendela ketika
// operasi sudah commit sementara lognya belum ada (`SDD-EVT-08`).
//
// `AL-08` melarang kegagalan log menggagalkan transaksi bisnis — dan itu tidak
// dapat dipenuhi hanya dengan try/catch. Di PostgreSQL, satu pernyataan yang
// gagal MEMBATALKAN seluruh transaksi (`25P02`): setiap pernyataan berikutnya
// ikut gagal sampai rollback. Karena itu penulisan log dibungkus SAVEPOINT, dan
// kegagalannya dikembalikan ke titik itu — transaksi bisnisnya tetap dapat
// commit, dengan alarm sebagai gantinya.

import { sql } from 'kysely';
import type { Transaction } from 'kysely';
import type { Clock } from '../clock/index.js';
import type { Database, TransactionScope } from '../db/index.js';
import { Logger, konteksSaatIni, redact } from '../observability/index.js';
import type { BarisKanonik } from './canonical.js';
import { hashBaris } from './canonical.js';

/**
 * Kunci advisory rantai hash. Rantai tidak dapat dihitung dua kali secara
 * paralel tanpa bercabang (`SDD-05 §4.4`), jadi penulisan bersifat serial.
 */
const KUNCI_RANTAI = 4_815_162_343;

/** Pelaku pekerjaan terjadwal (`AL-06`). */
export const PELAKU_SISTEM = 'SYSTEM';

export interface AuditEntry {
  readonly modul: string;
  readonly aksi: string;
  readonly entitas?: string;
  readonly entitasId?: number | string;
  /** Snapshot terstruktur sebelum/sesudah (`AL-04`). Ter-*redact* (`AL-05`). */
  readonly nilaiSebelum?: unknown;
  readonly nilaiSesudah?: unknown;
  readonly keterangan?: string;
  /** `AL-07`: operasi yang gagal tetap dicatat, dengan hasil `GAGAL`. */
  readonly hasil?: 'SUKSES' | 'GAGAL';
  /**
   * Diisi rantai middleware HTTP (`PR-00-15`). `RequestContext` sengaja tidak
   * membawanya: ia milik permintaan HTTP, sedangkan konteks itu juga dipakai
   * worker yang tidak punya IP pemanggil.
   */
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface OpsiAuditLogger {
  readonly clock: Clock;
  readonly logger?: Logger;
  /** Alarm `AL-08`/`OBS-05` saat penulisan log gagal. */
  readonly onFailure?: (entry: AuditEntry, galat: unknown) => void;
}

export class AuditLogger {
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly onFailure: ((entry: AuditEntry, galat: unknown) => void) | undefined;

  constructor(opsi: OpsiAuditLogger) {
    this.clock = opsi.clock;
    this.logger = opsi.logger ?? new Logger({ clock: opsi.clock, modulBawaan: 'audit' });
    this.onFailure = opsi.onFailure;
  }

  /**
   * Mencatat satu operasi tulis di dalam transaksi yang sedang berjalan.
   *
   * Mengembalikan `true` bila entri benar-benar tersimpan. Ia tidak pernah
   * melempar: `AL-08` melarang kegagalan log menggagalkan transaksi bisnis.
   */
  async write(scope: TransactionScope, entry: AuditEntry): Promise<boolean> {
    const konteks = konteksSaatIni();
    return this.simpan(scope.tx, entry, {
      userId: scope.ctx.userId,
      userNama: null,
      role: scope.ctx.roleCode,
      requestId: konteks?.requestId ?? null,
    });
  }

  /**
   * Mencatat aksi pekerjaan terjadwal (`AL-06`): pelaku `SYSTEM` beserta nama
   * pekerjaannya, yang disimpan pada `keterangan` bila pemanggil tidak mengisinya.
   */
  async writeSystem(
    tx: Transaction<Database>,
    namaPekerjaan: string,
    entry: AuditEntry,
  ): Promise<boolean> {
    return this.simpan(
      tx,
      { ...entry, keterangan: entry.keterangan ?? `Pekerjaan terjadwal: ${namaPekerjaan}` },
      { userId: null, userNama: PELAKU_SISTEM, role: PELAKU_SISTEM, requestId: null },
    );
  }

  private async simpan(
    tx: Transaction<Database>,
    entry: AuditEntry,
    pelaku: {
      userId: number | null;
      userNama: string | null;
      role: string | null;
      requestId: string | null;
    },
  ): Promise<boolean> {
    // SAVEPOINT lebih dulu: tanpanya, INSERT yang gagal membatalkan seluruh
    // transaksi bisnis dan AL-08 justru dilanggar oleh kode yang bermaksud
    // menaatinya.
    await sql`SAVEPOINT audit_log`.execute(tx);
    try {
      // Kunci diambil SEBELUM ekor rantai dibaca. Dua transaksi yang membaca
      // ekor yang sama akan menghasilkan dua entri ber-prev_hash identik —
      // rantai bercabang, dan verifikasi melaporkannya sebagai kerusakan.
      await sql`SELECT pg_advisory_xact_lock(${KUNCI_RANTAI})`.execute(tx);

      const ekor = await sql<{ row_hash: Buffer }>`
        SELECT row_hash FROM activity_logs ORDER BY id DESC LIMIT 1
      `.execute(tx);
      const prevHash = ekor.rows[0]?.row_hash ?? null;

      const baris: BarisKanonik = {
        waktu: this.clock.now(),
        user_id: pelaku.userId,
        user_nama: pelaku.userNama,
        role: pelaku.role,
        ip: entry.ip ?? null,
        user_agent: entry.userAgent ?? null,
        modul: entry.modul,
        aksi: entry.aksi,
        entitas: entry.entitas ?? null,
        entitas_id: entry.entitasId ?? null,
        // AL-05: sandi, hash, secret 2FA, dan token tidak pernah tersimpan.
        nilai_sebelum: entry.nilaiSebelum === undefined ? null : redact(entry.nilaiSebelum),
        nilai_sesudah: entry.nilaiSesudah === undefined ? null : redact(entry.nilaiSesudah),
        keterangan: entry.keterangan ?? null,
        hasil: entry.hasil ?? 'SUKSES',
        request_id: pelaku.requestId,
      };

      await tx
        .insertInto('activity_logs')
        .values({
          waktu: baris['waktu'] as Date,
          user_id: pelaku.userId === null ? null : String(pelaku.userId),
          user_nama: baris['user_nama'] as string | null,
          role: baris['role'] as string | null,
          ip: baris['ip'] as string | null,
          user_agent: baris['user_agent'] as string | null,
          modul: entry.modul,
          aksi: entry.aksi,
          entitas: baris['entitas'] as string | null,
          entitas_id: entry.entitasId === undefined ? null : String(entry.entitasId),
          nilai_sebelum: serialisasi(baris['nilai_sebelum']),
          nilai_sesudah: serialisasi(baris['nilai_sesudah']),
          keterangan: baris['keterangan'] as string | null,
          hasil: baris['hasil'] as 'SUKSES' | 'GAGAL',
          request_id: pelaku.requestId,
          prev_hash: prevHash,
          row_hash: hashBaris(prevHash, baris),
        })
        .execute();

      await sql`RELEASE SAVEPOINT audit_log`.execute(tx);
      return true;
    } catch (galat) {
      await sql`ROLLBACK TO SAVEPOINT audit_log`.execute(tx).catch(() => undefined);
      // AL-08: bukan rollback transaksi bisnis, melainkan alarm.
      this.logger.error('Gagal menulis activity log', galat, {
        modul: entry.modul,
        aksi: entry.aksi,
      });
      this.onFailure?.(entry, galat);
      return false;
    }
  }
}

function serialisasi(nilai: unknown): string | null {
  return nilai === null || nilai === undefined ? null : JSON.stringify(nilai);
}
