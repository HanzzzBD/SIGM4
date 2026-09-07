// BusinessCalendarService (SDD-SYS-06, SDD-APR-06, CAL-01 … CAL-03).
//
// Satu definisi hari kerja bagi seluruh sistem. `SDD-APR-06 §3` menyebut alasannya
// dengan tepat: SC-03 mengukur persetujuan dalam hari kerja sementara BR-028
// menghitung denda dalam hari kalender — bila aritmetika ini tersebar, dua modul
// akan mengimplementasikannya berbeda. Tidak ada aritmetika tanggal di service lain.

import { sql } from 'kysely';
import type { QueryExecutor } from '../db/index.js';

/** WIB = UTC+7, tanpa DST. `CAL-03`: batas hari ditentukan di WIB, disimpan UTC. */
const WIB_OFFSET_MINUTES = 7 * 60;
const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

/** Batas iterasi — menjaga kalender tanpa hari kerja tidak menggantung selamanya. */
const MAX_DAYS_SCANNED = 3650;

export interface OperatingHours {
  /** Menit sejak tengah malam WIB. */
  readonly startMinute: number;
  readonly endMinute: number;
}

/** `SDD-APR-15`: Senin–Sabtu 06.00–18.00 WIB, dan tidak ada rentang kedua. */
export const DEFAULT_OPERATING_HOURS: OperatingHours = {
  startMinute: 6 * 60,
  endMinute: 18 * 60,
};

/** Snapshot kalender untuk satu rentang — dibaca sekali, dipakai seluruh perhitungan. */
interface CalendarSnapshot {
  /** ISO-8601: 1 = Senin … 7 = Minggu. */
  readonly activeWeekdays: ReadonlySet<number>;
  /** Tanggal WIB berformat `YYYY-MM-DD`. */
  readonly holidays: ReadonlySet<string>;
}

/** Waktu UTC → waktu perdata WIB, dibaca lewat getter `getUTC*`. */
function toWibClock(instant: Date): Date {
  return new Date(instant.getTime() + WIB_OFFSET_MINUTES * MINUTE_MS);
}

function fromWibClock(wib: Date): Date {
  return new Date(wib.getTime() - WIB_OFFSET_MINUTES * MINUTE_MS);
}

function wibDateKey(wib: Date): string {
  return wib.toISOString().slice(0, 10);
}

/** 1 = Senin … 7 = Minggu, dari `getUTCDay()` yang memakai 0 = Minggu. */
function isoWeekday(wib: Date): number {
  const hari = wib.getUTCDay();
  return hari === 0 ? 7 : hari;
}

function minuteOfDay(wib: Date): number {
  return wib.getUTCHours() * 60 + wib.getUTCMinutes();
}

/** Tengah malam WIB pada hari yang sama, sebagai jam WIB. */
function startOfWibDay(wib: Date): Date {
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
}

export class BusinessCalendarService {
  constructor(private readonly hours: OperatingHours = DEFAULT_OPERATING_HOURS) {
    if (hours.startMinute >= hours.endMinute) {
      throw new Error('Jam operasional tidak valid: mulai harus sebelum selesai (SDD-APR-15).');
    }
  }

  /**
   * Membaca `work_days` dan `holidays` sekali untuk rentang yang dibutuhkan.
   * Membacanya per hari akan menghasilkan satu kueri per iterasi — pada SLA 72
   * jam kerja itu berarti puluhan perjalanan bolak-balik untuk satu perhitungan.
   */
  private async loadCalendar(
    executor: QueryExecutor,
    fromKey: string,
    toKey: string,
  ): Promise<CalendarSnapshot> {
    const days = await sql<{ hari: number }>`
      SELECT hari FROM work_days WHERE aktif
    `.execute(executor);
    const holidays = await sql<{ tanggal: string }>`
      SELECT to_char(tanggal, 'YYYY-MM-DD') AS tanggal
        FROM holidays
       WHERE tanggal BETWEEN ${fromKey}::date AND ${toKey}::date
    `.execute(executor);

    return {
      activeWeekdays: new Set(days.rows.map((r) => Number(r.hari))),
      holidays: new Set(holidays.rows.map((r) => r.tanggal)),
    };
  }

  private isWorkingWibDay(wib: Date, calendar: CalendarSnapshot): boolean {
    return (
      calendar.activeWeekdays.has(isoWeekday(wib)) && !calendar.holidays.has(wibDateKey(wib))
    );
  }

  /** Apakah `instant` jatuh pada hari kerja menurut `work_days` + `holidays`. */
  async isWorkingDay(executor: QueryExecutor, instant: Date): Promise<boolean> {
    const wib = toWibClock(instant);
    const key = wibDateKey(wib);
    return this.isWorkingWibDay(wib, await this.loadCalendar(executor, key, key));
  }

  /**
   * Menambahkan `hours` **jam kerja** pada `start` (`CAL-01`).
   *
   * Waktu di luar jam operasional dan hari libur tidak menambah hitungan. Hasilnya
   * absolut dan disimpan apa adanya oleh `SDD-APR-07` — bukan dihitung ulang tiap
   * dibaca, agar perubahan `holidays` di kemudian hari tidak menggeser tenggat
   * pengajuan yang sudah berjalan.
   */
  async addWorkingHours(executor: QueryExecutor, start: Date, hours: number): Promise<Date> {
    if (!Number.isFinite(hours) || hours < 0) {
      throw new Error('Jumlah jam kerja harus bilangan non-negatif (CAL-01).');
    }

    let remaining = Math.round(hours * 60);
    let cursor = toWibClock(start);
    // Rentang kalender dimuat sekali, dengan pagu yang sama dengan pagu iterasi.
    const calendar = await this.loadCalendar(
      executor,
      wibDateKey(cursor),
      wibDateKey(new Date(cursor.getTime() + MAX_DAYS_SCANNED * DAY_MINUTES * MINUTE_MS)),
    );

    for (let scanned = 0; scanned <= MAX_DAYS_SCANNED; scanned += 1) {
      const dayStart = startOfWibDay(cursor);
      const isWorking = this.isWorkingWibDay(cursor, calendar);
      const current = minuteOfDay(cursor);

      if (!isWorking || current >= this.hours.endMinute) {
        // Lompat ke pembukaan hari berikutnya.
        cursor = new Date(
          dayStart.getTime() + (DAY_MINUTES + this.hours.startMinute) * MINUTE_MS,
        );
        continue;
      }

      // Sebelum jam buka: hitungan baru mulai saat operasional dibuka.
      const from = Math.max(current, this.hours.startMinute);
      const available = this.hours.endMinute - from;

      if (remaining <= available) {
        return fromWibClock(new Date(dayStart.getTime() + (from + remaining) * MINUTE_MS));
      }

      remaining -= available;
      cursor = new Date(dayStart.getTime() + (DAY_MINUTES + this.hours.startMinute) * MINUTE_MS);
    }

    throw new Error(
      `Tidak menemukan hari kerja dalam ${MAX_DAYS_SCANNED} hari — periksa isi work_days.`,
    );
  }

  /**
   * Menit kerja yang berlalu antara dua saat (`CAL-01`). Dipakai `SlaTracker`
   * untuk mengukur keterlambatan, bukan untuk menetapkan tenggat.
   */
  async workingMinutesBetween(executor: QueryExecutor, from: Date, to: Date): Promise<number> {
    if (to.getTime() <= from.getTime()) return 0;

    const startWib = toWibClock(from);
    const endWib = toWibClock(to);
    const calendar = await this.loadCalendar(
      executor,
      wibDateKey(startWib),
      wibDateKey(endWib),
    );

    let total = 0;
    let day = startOfWibDay(startWib);
    for (let scanned = 0; scanned <= MAX_DAYS_SCANNED; scanned += 1) {
      if (day.getTime() > startOfWibDay(endWib).getTime()) break;

      if (this.isWorkingWibDay(day, calendar)) {
        const openAt = day.getTime() + this.hours.startMinute * MINUTE_MS;
        const closeAt = day.getTime() + this.hours.endMinute * MINUTE_MS;
        const overlapStart = Math.max(openAt, startWib.getTime());
        const overlapEnd = Math.min(closeAt, endWib.getTime());
        if (overlapEnd > overlapStart) total += (overlapEnd - overlapStart) / MINUTE_MS;
      }
      day = new Date(day.getTime() + DAY_MINUTES * MINUTE_MS);
    }
    return Math.round(total);
  }

  /**
   * Selisih dalam **hari kalender** menurut batas hari WIB (`CAL-02`, `CAL-03`).
   *
   * `excludeHolidays` melayani `BR-028c`: denda dihitung dalam hari kalender
   * kecuali parameter itu diaktifkan. Hari libur yang dikecualikan mencakup akhir
   * pekan menurut `work_days` — keduanya sama-sama "bukan hari kerja".
   */
  async countCalendarDays(
    executor: QueryExecutor,
    from: Date,
    to: Date,
    options: { readonly excludeHolidays?: boolean } = {},
  ): Promise<number> {
    if (to.getTime() <= from.getTime()) return 0;

    const startDay = startOfWibDay(toWibClock(from));
    const endDay = startOfWibDay(toWibClock(to));
    const total = Math.round((endDay.getTime() - startDay.getTime()) / (DAY_MINUTES * MINUTE_MS));
    if (options.excludeHolidays !== true) return total;

    const calendar = await this.loadCalendar(
      executor,
      wibDateKey(startDay),
      wibDateKey(endDay),
    );
    let counted = 0;
    for (let i = 1; i <= total; i += 1) {
      const day = new Date(startDay.getTime() + i * DAY_MINUTES * MINUTE_MS);
      if (this.isWorkingWibDay(day, calendar)) counted += 1;
    }
    return counted;
  }
}
