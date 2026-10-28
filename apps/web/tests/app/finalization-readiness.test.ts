import {describe,it,expect} from "vitest";
import type {StocktakeSession} from "@sigm4/schemas";
import {finalizationBlockers} from "../../src/modules/m13-audit-stocktake/finalization";
const session={target:6,diperiksa:2,domain:"ASET",periode_selesai:"2026-10-20",foto_tertunda:0,lokasi:[{selesai:false}]} as StocktakeSession;
describe("UX-008 finalization prerequisites",()=>{
 it("shows unfinished location before or on the period end, permits asset missing classification afterwards",()=>{expect(finalizationBlockers(session,"2026-10-20")[0]).toContain("lokasi belum selesai");expect(finalizationBlockers(session,"2026-10-21")).toEqual([]);});
 it("does not permit incomplete material counts even after period end; pending photos remain explicit",()=>{expect(finalizationBlockers({...session,domain:"BAHAN",foto_tertunda:2},"2026-10-21")).toHaveLength(2);});
});
