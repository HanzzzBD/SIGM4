// Clock (SDD-SYS-07). Uji perilaku, bukan sekadar keberadaan tipe — `SystemClock`
// adalah satu-satunya titik di seluruh pohon yang boleh membaca jam sistem, dan
// `FixedClock` adalah kontrak yang dipakai setiap uji Phase 01-08 nanti.

import { describe, expect, it } from 'vitest';
import { FixedClock, SystemClock } from '../../src/shared/clock/index.js';

describe('SystemClock', () => {
  it('mengembalikan waktu sekarang', () => {
    const sebelum = Date.now();
    const t = new SystemClock().now();
    const sesudah = Date.now();
    expect(t).toBeInstanceOf(Date);
    expect(t.getTime()).toBeGreaterThanOrEqual(sebelum);
    expect(t.getTime()).toBeLessThanOrEqual(sesudah);
  });

  it('maju di antara dua pembacaan', async () => {
    const clock = new SystemClock();
    const a = clock.now();
    await new Promise((r) => setTimeout(r, 5));
    expect(clock.now().getTime()).toBeGreaterThan(a.getTime());
  });
});

describe('FixedClock', () => {
  const SAAT = new Date('2026-09-07T02:31:44.812Z');

  it('mengembalikan waktu yang sama berulang kali', () => {
    const clock = new FixedClock(SAAT);
    expect(clock.now().toISOString()).toBe(SAAT.toISOString());
    expect(clock.now().toISOString()).toBe(SAAT.toISOString());
  });

  it('mengembalikan SALINAN — pemanggil tidak dapat menggeser jam milik orang lain', () => {
    const clock = new FixedClock(SAAT);
    const a = clock.now();
    a.setFullYear(2099);
    expect(clock.now().toISOString()).toBe(SAAT.toISOString());
  });

  it('advance() memajukan waktu dan mengembalikan nilai barunya', () => {
    const clock = new FixedClock(SAAT);
    const baru = clock.advance(90 * 60 * 1000); // 90 menit
    expect(baru.toISOString()).toBe('2026-09-07T04:01:44.812Z');
    expect(clock.now().toISOString()).toBe(baru.toISOString());
  });

  it('advance() dapat dirangkai — inilah yang membuat TD-04 dapat diuji', () => {
    const clock = new FixedClock(SAAT);
    clock.advance(24 * 60 * 60 * 1000);
    clock.advance(24 * 60 * 60 * 1000);
    expect(clock.now().toISOString()).toBe('2026-09-09T02:31:44.812Z');
  });

  it('menerima mundur juga — kasus tepi jatuh tempo yang sudah lewat', () => {
    const clock = new FixedClock(SAAT);
    expect(clock.advance(-1000).toISOString()).toBe('2026-09-07T02:31:43.812Z');
  });
});
