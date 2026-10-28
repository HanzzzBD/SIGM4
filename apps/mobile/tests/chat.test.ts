import { describe,expect,it,vi } from "vitest";
import type { AxiosInstance } from "axios";
import { ChatEventParser,readChatEvents } from "@sigm4/schemas";
import { ChatAttempt,chatLink,sendChat,nativeChatPath } from "../src/features/chat/model";
import { createApi } from "../src/shared/api/client";
import { TokenVault } from "../src/shared/secure/vault";
const message={id:"2",peran:"ASSISTANT",isi:"Proyektor di Aula.",status:"COMPLETED",waktu:"2026-10-14T03:00:00Z",umpan_balik:null,references:[{label:"Proyektor",url:"/aset/1"}],error_code:null};
describe("PR-05-36: streaming mobile",()=>{
 it("UUID and body remain stable for uncertain retry; explicit completion starts a new attempt",()=>{const a=new ChatAttempt(),uuid=vi.fn().mockReturnValueOnce("93a2d3fe-1c97-40fb-98fe-b4ad03ecf479").mockReturnValueOnce("93a2d3fe-1c97-40fb-98fe-b4ad03ecf470"),first=a.prepare("1","Aula kosong?",uuid);expect(a.prepare("1","Tidak boleh mengganti",uuid)).toEqual(first);expect(uuid).toHaveBeenCalledTimes(1);a.complete();expect(a.prepare("1","Baru",uuid).client_message_id).not.toBe(first.client_message_id);});
 it("SSE assembles split lines and UTF-8 chunks; cannot declare completion after interrupted stream",async()=>{const parser=new ChatEventParser();expect(parser.push('data: {"type":"del')).toEqual([]);expect(parser.push('ta","text":"Aula"}\r\n\r\n')).toEqual([{type:"delta",text:"Aula"}]);const encoder=new TextEncoder(),bytes=encoder.encode(`data: ${JSON.stringify({type:"delta",text:"Satuan: rim ✓"})}\n\ndata: ${JSON.stringify({type:"done",message})}\n\n`),events:unknown[]=[];await readChatEvents(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}}),e=>events.push(e),new AbortController().signal);expect(events).toHaveLength(2);expect(events[0]).toEqual({type:"delta",text:"Satuan: rim ✓"});await expect(readChatEvents(new ReadableStream({start(c){c.enqueue(encoder.encode('data: {"type":"delta","text":"partial"}\n\n'));c.close();}}),()=>undefined,new AbortController().signal)).rejects.toThrow("terputus");});
 it("uses authenticated common client with fetch adapter and no persisted conversation",async()=>{const post=vi.fn().mockResolvedValue({data:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({type:"done",message})}\n\n`));c.close();}})}),api={post} as unknown as AxiosInstance,body=new ChatAttempt().prepare("1","Aula?",()=>"93a2d3fe-1c97-40fb-98fe-b4ad03ecf479"),events:unknown[]=[];await sendChat(api,fetch,body,e=>events.push(e),new AbortController().signal);expect(post.mock.calls[0]![1]).toEqual(body);expect(post.mock.calls[0]![2]).toMatchObject({responseType:"stream",timeout:190000});expect(typeof post.mock.calls[0]![2].adapter).toBe("function");expect(events).toHaveLength(1);});
 it("allows only trusted HTTPS app origin; model URLs are never activated",()=>{expect(chatLink("/aset/1","https://sigm4.test")).toBe("https://sigm4.test/aset/1");for(const v of ["//evil.test/x","https://evil.test","javascript:alert(1)","/../secret","/aset/%2fsecret"])expect(chatLink(v,"https://sigm4.test")).toBeNull();expect(chatLink("/aset/1","http://sigm4.test")).toBeNull();});
 it("real common client authenticates streaming; offline stops before transport",async()=>{
  const stored=JSON.stringify({access_token:"synthetic-access",refresh_token:"synthetic-refresh"}),vault=new TokenVault({get:async()=>stored,set:async()=>undefined,remove:async()=>undefined});
  let online=true;const api=createApi("https://sigm4.test/api/v1","ANDROID","1.0.0",vault,vi.fn(),async()=>online),transport=vi.fn(async()=>new Response(`data: ${JSON.stringify({type:"done",message})}\n\n`,{headers:{"Content-Type":"text/event-stream"}})),body=new ChatAttempt().prepare("1","Aula?",()=>"93a2d3fe-1c97-40fb-98fe-b4ad03ecf479");
  await sendChat(api,transport as typeof fetch,body,()=>undefined,new AbortController().signal);
  expect(transport).toHaveBeenCalledTimes(1);const [url,init]=transport.mock.calls[0] as unknown as [string,{method:string;headers:Record<string,string>;body:string}];expect(url).toBe("https://sigm4.test/api/v1/chat/messages");expect(init.method).toBe("POST");expect(init.headers["Authorization"]).toBe("Bearer synthetic-access");expect(init.headers["X-Platform"]).toBe("ANDROID");expect(JSON.parse(init.body)).toEqual(body);
  online=false;await expect(sendChat(api,transport as typeof fetch,body,()=>undefined,new AbortController().signal)).rejects.toMatchObject({code:"OFFLINE"});expect(transport).toHaveBeenCalledTimes(1);
 });
 it("opens registered native detail only when its permission is present",()=>{
  expect(nativeChatPath("/aset/12",{"asset.view":"restricted"})).toBe("/aset/12");expect(nativeChatPath("/kerusakan/4",{"damage.view":"own"})).toBe("/kerusakan/4");expect(nativeChatPath("/aset/12",{})).toBeNull();expect(nativeChatPath("/pinjaman/2",{"loan.view":"own"})).toBeNull();expect(nativeChatPath("/../aset/12",{"asset.view":"all"})).toBeNull();
 });
});

describe("chatbot mobile: SSE tanpa Response global berstream (React Native)", () => {
    const stored = JSON.stringify({ access_token: "synthetic-access", refresh_token: "synthetic-refresh" });
    const vault = () => new TokenVault({ get: async () => stored, set: async () => undefined, remove: async () => undefined });
    const body = new ChatAttempt().prepare("1", "Aula?", () => "93a2d3fe-1c97-40fb-98fe-b4ad03ecf479");
    const RealResponse = globalThis.Response;
    const sse = () => new RealResponse(`data: ${JSON.stringify({ type: "done", message })}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    it("streams even when the global Response polyfill has no body stream", async () => {
        const original = globalThis.Response;
        // Polyfill whatwg-fetch di React Native: `new Response('').body` tidak ada.
        class PolyfillResponse { constructor() { /* tanpa body stream */ } }
        const transport = vi.fn(async () => sse());
        globalThis.Response = PolyfillResponse as unknown as typeof Response;
        try {
            const api = createApi("https://sigm4.test/api/v1", "ANDROID", "1.0.0", vault(), vi.fn()), events: unknown[] = [];
            await sendChat(api, transport as unknown as typeof fetch, body, (e) => events.push(e), new AbortController().signal);
            expect(events).toEqual([{ type: "done", message }]);
        } finally { globalThis.Response = original; }
    });
    it("maps server refusals and network failures like the rest of the app", async () => {
        const refused = vi.fn(async () => new Response(JSON.stringify({ error: { code: "CHAT_QUOTA_EXCEEDED", message: "Kuota habis." } }), { status: 429, headers: { "Content-Type": "application/json" } }));
        await expect(sendChat(createApi("https://sigm4.test/api/v1", "ANDROID", "1.0.0", vault(), vi.fn()), refused as unknown as typeof fetch, body, () => undefined, new AbortController().signal)).rejects.toMatchObject({ status: 429, code: "CHAT_QUOTA_EXCEEDED", message: "Kuota habis." });
        const offline = vi.fn(async () => { throw new TypeError("Network request failed"); });
        await expect(sendChat(createApi("https://sigm4.test/api/v1", "ANDROID", "1.0.0", vault(), vi.fn()), offline as unknown as typeof fetch, body, () => undefined, new AbortController().signal)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    });
    it("cancelling the conversation aborts the underlying request", async () => {
        let seen: AbortSignal | undefined;
        const transport = vi.fn(async (_url: string, init: { signal: AbortSignal }) => { seen = init.signal; return sse(); });
        const abort = new AbortController();
        await sendChat(createApi("https://sigm4.test/api/v1", "ANDROID", "1.0.0", vault(), vi.fn()), transport as unknown as typeof fetch, body, () => undefined, abort.signal);
        expect(seen?.aborted).toBe(false);
        abort.abort();
        expect(seen?.aborted).toBe(true);
    });
});

describe("React Native: tidak ada teks lepas di antara blok JSX", () => {
    it("no bare whitespace between an element-closing expression and the next one", async () => {
        const { readdir, readFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((d) => d.isDirectory() ? walk(join(dir, d.name)) : Promise.resolve(d.name.endsWith(".tsx") ? [join(dir, d.name)] : [])))).flat();
        const offenders: string[] = [];
        for (const file of await walk(join(__dirname, "../src"))) {
            const text = await readFile(file, "utf8");
            // `…/>} {x&&…` merender " " di luar <Text> → "Text strings must be rendered within a <Text> component".
            for (const m of text.matchAll(/(?:\/>|<\/[A-Za-z.]+>)\}[ \t]+\{/g)) offenders.push(`${file.slice(file.indexOf("src"))}@${m.index}`);
        }
        expect(offenders).toEqual([]);
    });
});
