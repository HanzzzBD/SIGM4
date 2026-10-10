// Permukaan publik m10-approval web (SDD-11 §4.1a). P-68 dan P-69 dimuat MALAS (SDD-11 §4.7).
export const muatApprovalRulesPage = () => import("./ApprovalRulesPage");
export const muatEditorAturanPage = () => import("./EditorAturanPage");
// C-27 Linimasa Approval — dipakai halaman modul lain (P-31, PR-03-27).
export { LinimasaPersetujuan, riwayatApprovalQuery, waktuWib } from "./linimasa";
