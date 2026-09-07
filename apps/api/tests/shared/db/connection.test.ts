import { describe, expect, it } from 'vitest';
import { readDatabaseConfig } from '../../../src/shared/db/index.js';

describe('readDatabaseConfig', () => {
  it('memakai ukuran pool bawaan bila DB_POOL_SIZE tidak disetel (TBD-AVL-C)', () => {
    expect(readDatabaseConfig({ DATABASE_URL: 'postgres://h/db' })).toEqual({
      connectionString: 'postgres://h/db',
      poolSize: 10,
    });
  });

  it('memakai DB_POOL_SIZE bila disetel', () => {
    const config = readDatabaseConfig({ DATABASE_URL: 'postgres://h/db', DB_POOL_SIZE: '25' });
    expect(config.poolSize).toBe(25);
  });

  it.each([{}, { DATABASE_URL: '' }, { DATABASE_URL: '   ' }])(
    'menggagalkan startup bila DATABASE_URL kosong (SDD-INF-08)',
    (env) => {
      expect(() => readDatabaseConfig(env)).toThrow(/DATABASE_URL wajib diisi/);
    },
  );

  it.each(['0', '-1', '3.5', 'banyak'])('menolak DB_POOL_SIZE tidak sah: %s', (nilai) => {
    expect(() => readDatabaseConfig({ DATABASE_URL: 'postgres://h/db', DB_POOL_SIZE: nilai })).toThrow(
      /DB_POOL_SIZE/,
    );
  });

  it('tidak pernah menyebut nilai variabel pada pesan galat (SDD-16 §4.7)', () => {
    expect(() =>
      readDatabaseConfig({ DATABASE_URL: 'postgres://rahasia@h/db', DB_POOL_SIZE: 'banyak' }),
    ).toThrow(expect.not.stringContaining('rahasia') as unknown as string);
  });
});
