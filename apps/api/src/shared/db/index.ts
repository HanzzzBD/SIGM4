// Permukaan publik shared/db (SDD-SYS-06): koneksi, transaksi, tipe repository.
export type { Database } from './schema.js';
export type { DatabaseConfig } from './connection.js';
export { closeDb, createDb, getDb, readDatabaseConfig } from './connection.js';
export type { QueryExecutor, TransactionScope } from './transaction.js';
export { withTransaction } from './transaction.js';
export type { ScopedRepository } from './repository.js';
export { BaseRepository, defineRepository } from './repository.js';
