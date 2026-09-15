// Permukaan publik shared/lifecycle — penghentian proses yang rapi (SDD-INF-04/05).
export type {
    KodeKeluar,
    LangkahHenti,
    OpsiPenghenti,
    ProsesTarget,
    Sinyal,
} from "./shutdown.js";
export { BATAS_PAKSA_MS, Penghenti, tutupServer } from "./shutdown.js";
