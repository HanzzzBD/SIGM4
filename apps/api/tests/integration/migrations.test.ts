// Integration test terhadap PostgreSQL NYATA (SDD-REPO-11), bukan mock.
// Membuktikan acceptance PR-00-05: btree_gist aktif dan seluruh enum Bab 11.3
// benar-benar terbentuk di basis data — bukan sekadar tertulis di berkas .sql.
//
// Menuntut DATABASE_URL menunjuk basis data yang boleh dihapus isinya. Dijalankan
// `npm run test:integration -w apps/api`; ia sengaja TIDAK ikut `npm test` karena
// menuntut dependensi yang tidak ada di setiap mesin (PR-00-17 menyediakannya di CI).

import { beforeAll, describe, expect, it } from 'vitest';
import { bacaBab113, kodeTeknis } from '../helpers/bab113.js';
import { dbmate, kueri } from '../helpers/db.js';

const bab113 = bacaBab113();

const HITUNG = `
  SELECT (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typtype = 'e' AND n.nspname = 'public')::text AS enums,
         (SELECT count(*) FROM pg_extension WHERE extname IN ('btree_gist','pgcrypto'))::text AS ext
`;

describe.skipIf(process.env['DATABASE_URL'] === undefined)(
  'migration 0001-0002 terhadap PostgreSQL nyata',
  () => {
    beforeAll(() => {
      dbmate('up');
    });

    it('btree_gist dan pgcrypto aktif', async () => {
      const rows = await kueri<{ extname: string }>(
        "SELECT extname FROM pg_extension WHERE extname IN ('btree_gist','pgcrypto') ORDER BY 1",
      );
      expect(rows.map((r) => r.extname)).toEqual(['btree_gist', 'pgcrypto']);
    });

    it('btree_gist benar-benar dapat dipakai exclusion constraint (CI-01)', async () => {
      // Pembuktian yang sesungguhnya: baris di pg_extension tidak menjamin kelas
      // operatornya terpasang. Constraint di bawah memadukan operator kesetaraan
      // skalar dengan irisan rentang di SATU indeks GiST — persis bentuk
      // SDD-01 §4.1, dan mustahil dibuat tanpa btree_gist.
      await kueri(`
        CREATE TABLE probe_ci01 (
          resource_id bigint    NOT NULL,
          rentang     tstzrange NOT NULL,
          EXCLUDE USING gist (resource_id WITH =, rentang WITH &&)
        )
      `);
      try {
        await kueri(
          "INSERT INTO probe_ci01 VALUES (1, '[2026-09-07 08:00+00,2026-09-07 10:00+00)')",
        );
        // Irisan pada resource yang sama harus ditolak basis data dengan 23P01.
        await expect(
          kueri("INSERT INTO probe_ci01 VALUES (1, '[2026-09-07 09:00+00,2026-09-07 11:00+00)')"),
        ).rejects.toMatchObject({ code: '23P01' });
        // Resource berbeda pada rentang yang sama tetap boleh.
        await expect(
          kueri("INSERT INTO probe_ci01 VALUES (2, '[2026-09-07 09:00+00,2026-09-07 11:00+00)')"),
        ).resolves.toEqual([]);
      } finally {
        await kueri('DROP TABLE probe_ci01');
      }
    });

    it('seluruh enum Bab 11.3 terbentuk, dengan nilai dan urutan yang sama', async () => {
      const rows = await kueri<{ typname: string; labels: string }>(`
        SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'public'
         GROUP BY t.typname
      `);
      const aktual = new Set(rows.map((r) => r.labels));

      // Nilai harapan datang dari PRD, bukan dari daftar di dalam uji ini.
      const hilang = [...bab113.values()]
        .map((nilai) => nilai.join(','))
        .filter((nilai) => !aktual.has(nilai));
      expect(hilang).toEqual([]);
      expect(rows).toHaveLength(bab113.size);
    });

    it('nilai tersimpan sebagai kode teknis huruf besar, bukan label (SDD-DB-02)', async () => {
      const rows = await kueri<{ enumlabel: string }>('SELECT enumlabel FROM pg_enum');
      expect(rows.map((r) => r.enumlabel).filter((l) => l !== kodeTeknis(l))).toEqual([]);
    });

    it('down mencabut seluruhnya, lalu up memulihkannya (CD-04, CD-05)', async () => {
      // Jumlah migration TIDAK dipatok: ia bertambah tiap PR, dan angka yang
      // dipatok di sini akan menjadikan uji ini gagal atas penambahan yang sah
      // alih-alih atas kerusakan yang nyata.
      const terpasang = await kueri<{ n: string }>(
        'SELECT count(*)::text AS n FROM schema_migrations',
      );
      for (let sisa = Number(terpasang[0]?.n ?? 0); sisa > 0; sisa -= 1) dbmate('down');
      expect((await kueri<{ enums: string; ext: string }>(HITUNG))[0]).toEqual({
        enums: '0',
        ext: '0',
      });

      dbmate('up');
      expect((await kueri<{ enums: string; ext: string }>(HITUNG))[0]).toEqual({
        enums: String(bab113.size),
        ext: '2',
      });
    });
  },
);
