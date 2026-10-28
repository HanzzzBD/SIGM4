import {useBlocker} from "@tanstack/react-router";
import {useRef} from "react";
import {DialogKonfirmasi} from "./dialog";
/** Drafts stay in component memory; no form values or secrets enter browser storage. */
export function useUnsavedChanges(dirty:boolean){
 const leaving=useRef(false);
 const blocker=useBlocker({shouldBlockFn:({current,next})=>dirty&&!leaving.current&&current.pathname!==next.pathname,enableBeforeUnload:()=>dirty&&!leaving.current,withResolver:true});
 return {allow:()=>{leaving.current=true;},prompt:<DialogKonfirmasi buka={blocker.status==="blocked"} onTutup={()=>blocker.reset?.()} judul="Tinggalkan perubahan yang belum disimpan?" labelAksi="Buang perubahan dan lanjutkan" varian="danger" onKonfirmasi={()=>blocker.proceed?.()}>Isian pada halaman ini belum disimpan. Pilih Batal untuk kembali mengisi; melanjutkan akan membuang perubahan.</DialogKonfirmasi>};
}
