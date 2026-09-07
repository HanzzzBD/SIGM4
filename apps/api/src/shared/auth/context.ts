// AuthContext — sumbu SCOPE dari otorisasi (SDD-03 §1): "boleh melihat baris yang
// mana", bukan "boleh melakukan aksi ini". Sumbu permission ditegakkan middleware
// route dan dibangun PR-00-09; berkas ini hanya menyediakan konteks yang dibawa
// turun sampai ke repository.

/**
 * Cakupan data sebuah permission bagi pemegangnya (`PM-03`, Lampiran C.1).
 * Nilainya ortogonal terhadap permission: satu pengguna dapat ber-scope `own`
 * pada `loan.view` dan `all` pada `asset.view`.
 */
export type Scope = 'all' | 'own' | 'assigned' | 'restricted';

/**
 * Identitas dan cakupan pemanggil, diteruskan sebagai parameter WAJIB ke setiap
 * metode repository (`SDD-AUTH-02`). Tidak ada nilai bawaan di mana pun: scope
 * yang boleh dilupakan pemanggil adalah scope yang suatu hari akan terlupakan.
 */
export interface AuthContext {
  readonly userId: number;
  readonly roleCode: string;
  readonly permissions: ReadonlySet<string>;
  /** Scope permission yang dipegang. Melempar bila permission-nya tidak dipegang. */
  scopeOf(permission: string): Scope;
  can(permission: string): boolean;
}

/** Bahan mentah AuthContext: peta kode permission -> scope efektifnya. */
export interface AuthContextInput {
  readonly userId: number;
  readonly roleCode: string;
  readonly scopes: ReadonlyMap<string, Scope>;
}

/**
 * Membangun AuthContext dari peta permission->scope. `permissions` diturunkan dari
 * peta yang sama, bukan diterima terpisah — dua daftar yang dapat berbeda adalah
 * dua daftar yang suatu hari akan berbeda.
 */
export function createAuthContext(input: AuthContextInput): AuthContext {
  const scopes = new Map(input.scopes);
  const permissions: ReadonlySet<string> = new Set(scopes.keys());

  return {
    userId: input.userId,
    roleCode: input.roleCode,
    permissions,
    can: (permission) => permissions.has(permission),
    scopeOf: (permission) => {
      const scope = scopes.get(permission);
      if (scope === undefined) {
        // Mengembalikan nilai bawaan di sini akan mengubah kelalaian menjadi
        // kebocoran diam-diam — persis yang dicegah SDD-AUTH-02.
        throw new Error(`Scope diminta untuk permission yang tidak dipegang: ${permission}`);
      }
      return scope;
    },
  };
}

/**
 * Penjaga runtime bagi pemanggil yang menembus tipe (cast, JavaScript, batas
 * proses). Lapisan kompilator adalah penegakan utamanya; ini jaring keduanya.
 */
export function assertAuthContext(ctx: AuthContext): void {
  if (
    ctx === null ||
    typeof ctx !== 'object' ||
    !Number.isInteger(ctx.userId) ||
    typeof ctx.roleCode !== 'string' ||
    typeof ctx.can !== 'function' ||
    typeof ctx.scopeOf !== 'function'
  ) {
    throw new Error('AuthContext wajib pada setiap operasi repository (SDD-AUTH-02).');
  }
}
