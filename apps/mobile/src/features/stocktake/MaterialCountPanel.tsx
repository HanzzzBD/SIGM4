import { useCallback,useEffect,useRef,useState } from "react";
import { useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import { CameraView,useCameraPermissions } from "expo-camera";
import { AppState,Linking,StyleSheet,View } from "react-native";
import type { MaterialStocktakeItem } from "@sigm4/schemas";
import { MaterialStocktakeCountSchema } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { Button,Card,Input,Label,Notice,Screen,tokens as t } from "../../shared/ui";
import { useStocktakeQueue } from "./Provider";
import { cachedMaterial } from "./model";

/** MS-23: simpan per baris sebelum menyatakan berhasil (MOB-PERF-06). */
export function MaterialCountPanel({id,room,items,selected:initial,onBack}:{id:string;room:string;items:MaterialStocktakeItem[];selected:MaterialStocktakeItem|null;onBack:()=>void}){
 const {state,api}=useAuth(),q=useStocktakeQueue(),account=state.kind==="READY"?state.session.user.id:"",current=useRef(account);current.current=account;
 const [selected,setSelected]=useState(initial),[amount,setAmount]=useState(initial?.jumlah_fisik?.toString()??""),[note,setNote]=useState(initial?.keterangan??""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[permission,requestPermission]=useCameraPermissions(),[focused,setFocused]=useState(false),[foreground,setForeground]=useState(AppState.currentState==="active"),[qrText,setQrText]=useState("");
 const attempt=useRef<string|null>(null),nextCamera=useRef(0),alive=useRef(true),permitted=state.kind==="READY"&&Object.hasOwn(state.session.permissions,"audit.execute");
 useFocusEffect(useCallback(()=>{setFocused(true);return()=>setFocused(false);},[]));
 useEffect(()=>{alive.current=true;const listener=AppState.addEventListener("change",s=>setForeground(s==="active"));return()=>{alive.current=false;listener.remove();};},[]);
 const select=(value:string)=>{try{const item=cachedMaterial(value,process.env.EXPO_PUBLIC_APP_URL??api.defaults.baseURL??"",items,room);if(!item)throw new Error("Bahan tidak termasuk target lokasi ini.");setSelected(item);setAmount(item.jumlah_fisik?.toString()??"");setNote(item.keterangan??"");setError("");attempt.current=null;}catch(e){setError(e instanceof Error?e.message:"QR tidak dikenali.");}};
 const save=async()=>{
  if(!permitted||!selected||!q.queue||busy||saved)return;
  const valid=MaterialStocktakeCountSchema.safeParse({client_scan_id:attempt.current??=randomUUID(),material_id:Number(selected.material_id),room_id:Number(room),jumlah_fisik:amount.trim()?Number(amount):NaN,basis:{saldo:selected.saldo_sekarang,ledger_id:selected.ledger_id_sekarang},revision:selected.revision,keterangan:note});
  if(!valid.success){setError("Isi jumlah fisik bilangan bulat antara 0 dan 2147483647. Nol harus diisi secara eksplisit.");return;}
  setBusy(true);setError("");try{
   const cache=await q.queue.cached(account,id,room);if(!cache||cache.session.domain!=="BAHAN"||cache.session.status!=="BERJALAN"||cache.session.finalized_at)throw new Error("Cache tidak tersedia atau sesi tidak dapat dihitung. Unduh ulang target saat daring.");
   const inserted=await q.queue.enqueue({id:valid.data.client_scan_id,accountId:account,sessionId:id,kind:"material",body:valid.data,photos:[]});
   if(alive.current&&current.current===account){setSaved(true);if(!inserted)setError("Sudah ada hitungan untuk baris dan versi ini dalam antrean. Hasil pertama dipertahankan.");q.refresh();}
  }catch(e){if(alive.current&&current.current===account)setError(e instanceof Error?e.message:"Hitungan belum tersimpan.");}finally{if(alive.current)setBusy(false);}
 };
 if(!permitted)return <Screen title="Hitungan Bahan"><Notice message="Anda tidak memiliki izin melaksanakan opname."/><Button icon="arrowLeft" title="Kembali" onPress={onBack}/></Screen>;
 return <Screen title="Input Hitungan Fisik Bahan"><Button icon="arrowLeft" title="Kembali ke lokasi" secondary disabled={busy} onPress={onBack}/>{error&&<Notice message={error}/>}{saved?<Card><Label>Hitungan tersimpan di antrean perangkat. Saldo resmi berubah setelah laporan disetujui.</Label><Button icon="arrowLeft" title="Kembali ke daftar Bahan" onPress={onBack}/></Card>:selected?<><Card><Label>{selected.nama}</Label><Label>{selected.lokasi} / {selected.satuan_nama}</Label><Label>Saldo snapshot: {selected.saldo_sistem} {selected.satuan_simbol}</Label><Label>Basis saldo terbaru: {selected.saldo_sekarang} {selected.satuan_simbol}</Label>{selected.perlu_hitung_ulang&&<Notice message="Lakukan hitung ulang fisik karena ada transaksi setelah hitungan sebelumnya."/>}{selected.satuan_berubah&&<Notice message="Satuan berubah. Sesi perlu dibatalkan dan dibuat ulang."/>}<Input label={`Jumlah fisik (${selected.satuan_simbol})`} value={amount} onChangeText={setAmount} keyboardType="number-pad" editable={!busy} maxLength={10}/><Input label="Keterangan selisih" value={note} onChangeText={setNote} multiline maxLength={2000} editable={!busy}/><Label>Penyesuaian: {amount.trim()&&Number.isInteger(Number(amount))?Number(amount)-selected.saldo_sekarang:"Belum dihitung"} {selected.satuan_simbol}</Label><Button icon="checkCircle" title="Simpan Hitungan" busy={busy} disabled={selected.satuan_berubah} onPress={()=>void save()}/></Card></>:<><Label>QR Bahan memilih satu jenis pada lokasi ini. Anda juga dapat memilih baris dari daftar target.</Label>{permission?.granted&&focused&&foreground?<View style={styles.camera}><CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{barcodeTypes:["qr"]}} onBarcodeScanned={({data})=>{if(Date.now()>=nextCamera.current){nextCamera.current=Date.now()+1500;select(data);}}} onMountError={()=>setError("Kamera belum dapat dibuka. Pilih dari daftar target atau masukkan URL QR.")}/><View pointerEvents="none" style={styles.reticle}/></View>:<Button title={permission?.canAskAgain===false?"Buka pengaturan kamera":"Izinkan kamera"} onPress={()=>{void (permission?.canAskAgain===false?Linking.openSettings():requestPermission()).catch(()=>setError("Izin kamera belum tersedia."));}}/>}<Input label="URL QR Bahan" value={qrText} onChangeText={setQrText} autoCapitalize="none"/><Button title="Pilih Bahan dari QR" onPress={()=>select(qrText)}/>{items.map(i=><Button key={i.id} title={`Pilih ${i.nama}`} secondary onPress={()=>{setSelected(i);setAmount(i.jumlah_fisik?.toString()??"");setNote(i.keterangan??"");}}/>)}</>}</Screen>;
}
const styles=StyleSheet.create({camera:{height:t.size.camera,borderRadius:t.radius.md,overflow:"hidden",alignItems:"center",justifyContent:"center"},reticle:{width:t.size.qr,height:t.size.qr,borderWidth:2,borderColor:t.color.surface}});
