import { describe, expect, it } from 'vitest';
import { createAuthContext } from '../../../src/shared/auth/index.js';
import type { AuthContext } from '../../../src/shared/auth/index.js';
import { BaseRepository, defineRepository } from '../../../src/shared/db/index.js';
import type { QueryExecutor } from '../../../src/shared/db/index.js';

const ctx: AuthContext = createAuthContext({
  userId: 7,
  roleCode: 'SISWA',
  scopes: new Map([['loan.view', 'own']]),
});

const eksekutorPalsu = { tanda: 'executor' } as unknown as QueryExecutor;

interface Loan {
  readonly id: number;
}

class LoanRepository extends BaseRepository {
  constructor(executor: QueryExecutor) {
    super(executor);
  }

  // Bentuk yang diwajibkan SDD-AUTH-02: ctx adalah argumen pertama.
  async findLoans(authContext: AuthContext, filter: { peminjamId: number }): Promise<Loan[]> {
    this.query(authContext);
    return [{ id: filter.peminjamId }];
  }
}

// ---------------------------------------------------------------------------
// Gerbang KOMPILASI (acceptance PR-00-04: "metode repository tanpa ctx gagal
// kompilasi"). Berkas ini di-typecheck `tsc -p tsconfig.test.json` sebelum Vitest
// berjalan; setiap @ts-expect-error di bawah GAGAL bila galatnya tidak muncul,
// sehingga melonggarkan ScopedRepository membuat perintah uji merah.
// ---------------------------------------------------------------------------

// Sah: ctx sebagai argumen pertama.
const repositoriSah = defineRepository({
  findLoans: async (ctx: AuthContext, filter: { peminjamId: number }): Promise<Loan[]> =>
    ctx.can('loan.view') ? [{ id: filter.peminjamId }] : [],
  countLoans: async (ctx: AuthContext): Promise<number> => ctx.userId,
  namaTabel: 'loans',
});

// @ts-expect-error — metode tanpa parameter sama sekali (SDD-AUTH-02)
defineRepository({ findAll: async (): Promise<Loan[]> => [] });

// @ts-expect-error — ctx bukan argumen pertama (SDD-AUTH-02)
defineRepository({ findLoans: async (filter: { peminjamId: number }): Promise<Loan[]> => [{ id: filter.peminjamId }] });

defineRepository({
  // @ts-expect-error — ctx ada tetapi bukan argumen PERTAMA (SDD-AUTH-02)
  findLoans: async (filter: { peminjamId: number }, ctx: AuthContext): Promise<Loan[]> =>
    ctx.can('loan.view') ? [{ id: filter.peminjamId }] : [],
});

// @ts-expect-error — kelas repository dengan satu metode tanpa ctx (SDD-AUTH-02)
defineRepository(new (class extends BaseRepository {
  constructor() {
    super(eksekutorPalsu);
  }
  async findAll(): Promise<Loan[]> {
    return [];
  }
})());

describe('ScopedRepository', () => {
  it('meloloskan repository yang setiap metodenya menerima ctx lebih dulu', async () => {
    await expect(repositoriSah.findLoans(ctx, { peminjamId: 7 })).resolves.toEqual([{ id: 7 }]);
    expect(repositoriSah.namaTabel).toBe('loans');
  });

  it('meloloskan kelas yang setiap metodenya menerima ctx lebih dulu', async () => {
    const repo = defineRepository(new LoanRepository(eksekutorPalsu));
    await expect(repo.findLoans(ctx, { peminjamId: 7 })).resolves.toEqual([{ id: 7 }]);
  });
});

describe('BaseRepository.query', () => {
  it('mengembalikan eksekutor saat ctx sah', () => {
    class Terbuka extends LoanRepository {
      ambil(authContext: AuthContext): QueryExecutor {
        return this.query(authContext);
      }
    }
    expect(new Terbuka(eksekutorPalsu).ambil(ctx)).toBe(eksekutorPalsu);
  });

  it('menolak pemanggil yang menembus tipe lewat cast (kasus penolakan)', async () => {
    const repo = new LoanRepository(eksekutorPalsu);
    await expect(repo.findLoans(undefined as unknown as AuthContext, { peminjamId: 7 })).rejects.toThrow(
      /AuthContext wajib/,
    );
  });
});
