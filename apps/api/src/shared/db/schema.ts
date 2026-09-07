// Tipe tabel Kysely (SDD-DB-15). Ini CERMINAN skema, bukan pendefinisinya:
// pemilik skema tetap berkas .sql di apps/api/migrations (SDD-DB-08).
//
// Aturannya satu, dan SDD-05 §5 menyebutnya eksplisit: setiap migration yang
// mengubah bentuk tabel menyegarkan tipenya pada PR YANG SAMA. Tipe yang
// tertinggal berhenti mencerminkan basis data dan berubah menjadi kebohongan
// yang diperiksa CI.
//
// Kosong pada PR-00-04 karena belum ada satu pun migration: 0001-0002 dibangun
// PR-00-05, dan tabel intinya menyusul pada PR-00-13 dan PR-00-16.

/** Peta nama tabel -> bentuk barisnya. Diisi bersama migration pemiliknya. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- diisi migration pertama (PR-00-05)
export interface Database {}
