// Log aplikasi berformat JSON terstruktur (SDD-OBS-02, SDD-15 §4.1).
//
// SDD-OBS-01: log aplikasi dan activity log adalah DUA sistem berbeda dengan
// tujuan, penyimpanan, retensi, dan jaminan berbeda. Berkas ini hanya yang
// pertama; `AuditLogger` (AL-01) dibangun PR-00-13 dan tidak pernah digabung
// ke sini.

import type { Clock } from '../clock/index.js';
import { konteksSaatIni } from './request-context.js';
import { redact } from './redact.js';

export type Level = 'debug' | 'info' | 'warn' | 'error';

const URUTAN: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Field wajib setiap entri — SDD-15 §4.1. */
interface EntriWajib {
  ts: string;
  level: Level;
  msg: string;
  request_id: string;
  modul: string;
}

export interface OpsiLogger {
  readonly clock: Clock;
  /** Ambang level; entri di bawahnya tidak ditulis. Bawaan dari `LOG_LEVEL`. */
  readonly level?: Level;
  /** Ke mana entri ditulis. Disuntikkan agar dapat diuji tanpa menyadap stdout. */
  readonly tulis?: (baris: string) => void;
  /** Dipakai saat tidak ada konteks permintaan — mis. penyalaan proses, job. */
  readonly modulBawaan?: string;
}

function levelDariEnv(env: NodeJS.ProcessEnv): Level {
  const mentah = env['LOG_LEVEL']?.trim().toLowerCase();
  return mentah !== undefined && mentah in URUTAN ? (mentah as Level) : 'info';
}

/**
 * Logger terstruktur. Tidak ada log teks bebas di jalur produksi (`SDD-OBS-02`):
 * pesan selalu berpasangan dengan objek field, dan objek itu selalu melewati
 * `redact` sebelum ditulis (`SDD-OBS-04`).
 */
export class Logger {
  private readonly clock: Clock;
  private readonly ambang: number;
  private readonly tulis: (baris: string) => void;
  private readonly modulBawaan: string;

  constructor(opsi: OpsiLogger) {
    this.clock = opsi.clock;
    this.ambang = URUTAN[opsi.level ?? levelDariEnv(process.env)];
    this.tulis = opsi.tulis ?? ((baris) => process.stdout.write(baris + '\n'));
    this.modulBawaan = opsi.modulBawaan ?? 'app';
  }

  debug(msg: string, field?: Record<string, unknown>): void {
    this.catat('debug', msg, field);
  }

  info(msg: string, field?: Record<string, unknown>): void {
    this.catat('info', msg, field);
  }

  warn(msg: string, field?: Record<string, unknown>): void {
    this.catat('warn', msg, field);
  }

  /** Galat. `error` diuraikan menjadi `error.type`/`error.message`/`error.stack`. */
  error(msg: string, galat?: unknown, field?: Record<string, unknown>): void {
    this.catat('error', msg, galat === undefined ? field : { ...field, error: galat });
  }

  private catat(level: Level, msg: string, field?: Record<string, unknown>): void {
    if (URUTAN[level] < this.ambang) return;

    const ctx = konteksSaatIni();
    const wajib: EntriWajib = {
      ts: this.clock.now().toISOString(),
      level,
      msg,
      // Tanpa konteks, `request_id` tetap hadir sebagai '-' — field wajib
      // SDD-15 §4.1 tidak boleh hilang hanya karena entri lahir di luar permintaan.
      request_id: ctx?.requestId ?? '-',
      modul: ctx?.modul ?? this.modulBawaan,
    };

    const opsional: Record<string, unknown> = {};
    if (ctx?.userId !== undefined) opsional['user_id'] = ctx.userId;
    if (ctx?.role !== undefined) opsional['role'] = ctx.role;

    // redact dipanggil di sini, sekali, atas seluruh isi — bukan di pemanggil.
    const isi = redact({ ...opsional, ...field }) as Record<string, unknown>;
    this.tulis(JSON.stringify({ ...wajib, ...isi }));
  }
}
