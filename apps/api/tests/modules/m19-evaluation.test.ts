import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { scoreAnswer,summarizeEvaluation } from "../../src/modules/m19-chatbot/index.js";
import type { EvalCase } from "../../src/modules/m19-chatbot/index.js";
const golden=readFileSync(new URL("../../../../evals/chatbot/golden-set.jsonl",import.meta.url),"utf8").trim().split("\n").map(l=>JSON.parse(l) as EvalCase);
describe("PR-03-23: rubrik dan katalog golden set",()=>{
 it("100 labeled cases cover all ten uses; all seven roles are checked",()=>{expect(golden).toHaveLength(100);expect(new Set(golden.map(c=>c.use_case)).size).toBe(10);expect(new Set(golden.map(c=>c.id)).size).toBe(100);for(const c of golden)for(let n=1;n<=7;n++){const role=`R-0${n}`,allowed=c.allowed_roles.includes(role),answer=allowed?{text:c.reference_answer,references:c.requires_link?[{label:"Data",url:"/aset/1"}]:[]}:{text:"Data tidak ditemukan atau tidak dapat diakses.",references:[]};expect(scoreAnswer(c,role,answer).correct,`${c.id}/${role}`).toBe(true);}});
 it("known forbidden data is critical; missing reference/link is not correct",()=>{const c=golden[0]!;expect(scoreAnswer(c,"R-07",{text:"CHAT-PUB dan CHAT-SECRET",references:[]})).toMatchObject({critical:true,correct:false});expect(scoreAnswer(c,"R-07",{text:"CHAT-PUB ada di Aula",references:[]})).toMatchObject({factual:true,format:false,correct:false});expect(scoreAnswer(c,"R-07",{text:"Proyektor di aula",references:[{label:"Aula",url:"/aset/1"}]})).toMatchObject({factual:false,correct:false});});
 it("release gates accuracy85, no critical failure and maximum five percentage-point decline",()=>{const good=Array.from({length:100},(_,i)=>({correct:i<90,critical:false}));expect(summarizeEvaluation(good,.94).passed).toBe(true);expect(summarizeEvaluation(good,.96).passed).toBe(false);good[0]={correct:false,critical:true};expect(summarizeEvaluation(good).passed).toBe(false);expect(summarizeEvaluation([]).passed).toBe(false);});
 it("empty-data hallucinations and wrong availability/count fail; private references are critical",()=>{
  const empty=golden.find(c=>c.tool==="get_my_loans")!;expect(scoreAnswer(empty,"R-05",{text:"Anda memiliki pinjaman jatuh tempo besok.",references:[]}).correct).toBe(false);
  const available=golden.find(c=>c.tool==="check_asset_availability")!;expect(scoreAnswer(available,"R-05",{text:"CHAT-PUB tidak tersedia.",references:[{label:"CHAT-PUB",url:"/aset/1"}]}).correct).toBe(false);
  const count=golden.find(c=>c.tool==="get_operational_summary")!;expect(scoreAnswer(count,"R-01",{text:"Ada 99 aset BAIK.",references:[{label:"Aset",url:"/aset"}]}).correct).toBe(false);
  expect(scoreAnswer(golden[0]!,"R-07",{text:"CHAT-PUB ada di Aula",references:[{label:"CHAT-SECRET",url:"/aset/2"}]})).toMatchObject({critical:true,correct:false});
 });
});
