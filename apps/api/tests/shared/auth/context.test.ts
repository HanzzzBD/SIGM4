import { describe, expect, it } from 'vitest';
import { assertAuthContext, createAuthContext } from '../../../src/shared/auth/index.js';
import type { AuthContext, Scope } from '../../../src/shared/auth/index.js';

const konteks = (scopes: ReadonlyArray<readonly [string, Scope]>): AuthContext =>
  createAuthContext({ userId: 7, roleCode: 'SISWA', scopes: new Map(scopes) });

describe('createAuthContext', () => {
  it('menurunkan permissions dari peta scope, bukan dari daftar kedua', () => {
    const ctx = konteks([['loan.view', 'own'], ['asset.view', 'restricted']]);
    expect([...ctx.permissions].sort()).toEqual(['asset.view', 'loan.view']);
  });

  it('mengembalikan scope per permission — ortogonal terhadap permission-nya (PM-03)', () => {
    const ctx = konteks([['loan.view', 'own'], ['asset.view', 'restricted']]);
    expect(ctx.scopeOf('loan.view')).toBe('own');
    expect(ctx.scopeOf('asset.view')).toBe('restricted');
  });

  it('menolak permission yang tidak dipegang alih-alih mengembalikan bawaan (SDD-AUTH-02)', () => {
    const ctx = konteks([['loan.view', 'own']]);
    expect(ctx.can('loan.approve')).toBe(false);
    // Kasus penolakan: nilai bawaan di sini akan menjadi kebocoran diam-diam.
    expect(() => ctx.scopeOf('loan.approve')).toThrow(/tidak dipegang/);
  });

  it('tidak terpengaruh perubahan peta setelah konteks dibuat', () => {
    const scopes = new Map<string, Scope>([['loan.view', 'own']]);
    const ctx = createAuthContext({ userId: 7, roleCode: 'SISWA', scopes });
    scopes.set('loan.approve', 'all');
    expect(ctx.can('loan.approve')).toBe(false);
  });
});

describe('assertAuthContext', () => {
  it('meloloskan konteks yang sah', () => {
    expect(() => assertAuthContext(konteks([['loan.view', 'own']]))).not.toThrow();
  });

  const tidakSah: ReadonlyArray<readonly [string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['objek kosong', {}],
    ['userId bukan bilangan bulat', { userId: 1.5, roleCode: 'ADMIN', can: (): boolean => true, scopeOf: (): Scope => 'all' }],
    ['tanpa scopeOf', { userId: 1, roleCode: 'ADMIN', can: (): boolean => true }],
  ];

  it.each(tidakSah)('menolak %s (SDD-AUTH-02)', (_nama, nilai) => {
    expect(() => assertAuthContext(nilai as unknown as AuthContext)).toThrow(/AuthContext wajib/);
  });
});
