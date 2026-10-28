import { describe, expect, it } from "vitest";
import { movementAssetsQuery } from "../../src/modules/m04-assets/movement-api";
import { pasangServer } from "../helpers";
describe("UX-006 asset picker HTTP contract", () => {
    it.each(["", "   ", " Proyektor "])("normalizes search %j without sending empty q", async term => {
        const log = pasangServer(() => ({status:200,data:{data:[],meta:{page:1,total:0,total_pages:1}}}));
        const options = movementAssetsQuery(term,1,true);
        await options.queryFn!({} as never);
        expect(log[0]!.params).toEqual({page:1,per_page:25,...(term.trim()?{q:term.trim()}:{})});
    });
});
