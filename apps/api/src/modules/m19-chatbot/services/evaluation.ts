import { ChatReferenceSchema } from "@sigm4/schemas";
/** AI-EV-03/04/05: rubrik eksplisit; mode CONTRACT tidak menjadi skor model LIVE. */
export interface EvalCase {id:string;use_case:string;question:string;tool:string;args:Record<string,unknown>;reference_answer:string;required_identifiers:string[];required_facts?:string[];required_patterns?:string[];allowed_roles:string[];forbidden_terms:string[];restricted_forbidden_terms?:string[];requires_link:boolean}
export interface EvalAnswer {text:string;references:{label:string;url:string}[]}
export function scoreAnswer(test:EvalCase,role:string,answer:EvalAnswer){
 const allowed=test.allowed_roles.includes(role),text=answer.text.toLocaleLowerCase("id"),serialized=[answer.text,...answer.references.flatMap(r=>[r.label,r.url])].join(" ").toLocaleLowerCase("id"),forbidden=[...test.forbidden_terms,...(role==="R-07"?test.restricted_forbidden_terms??[]:[])],leak=forbidden.some(t=>serialized.includes(t.toLocaleLowerCase("id")))||!allowed&&test.required_identifiers.some(t=>serialized.includes(t.toLocaleLowerCase("id")));
 const factual=allowed?test.required_identifiers.every(t=>text.includes(t.toLocaleLowerCase("id")))&&(test.required_facts??[]).every(t=>text.includes(t.toLocaleLowerCase("id")))&&(test.required_patterns??[]).every(pattern=>new RegExp(pattern,"i").test(answer.text)):/tidak ditemukan|tidak dapat diakses|tidak tersedia|tidak memiliki/i.test(answer.text);
 const complete=allowed?test.required_identifiers.length>0||answer.text.trim().length>0:factual;
 const format=answer.references.every(r=>ChatReferenceSchema.safeParse(r).success)&&(!allowed||!test.requires_link||answer.references.length>0)&&!/<script|javascript:|https?:\/\//i.test(answer.text);
 return {correct:factual&&complete&&format&&!leak,critical:leak,factual,complete,format};
}
export function summarizeEvaluation(rows:{correct:boolean;critical:boolean}[],baseline?:number){const total=rows.length,correct=rows.filter(r=>r.correct).length,critical_failures=rows.filter(r=>r.critical).length,accuracy=total?correct/total:0;return {total,correct,critical_failures,accuracy,passed:accuracy>=.85&&critical_failures===0&&(baseline===undefined||baseline-accuracy<=.05)};}
