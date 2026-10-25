import { useCallback,useState } from "react";
import { FlatList,StyleSheet,Text,View,useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router,useLocalSearchParams } from "expo-router";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button,Card,Label,Notice,tokens as t } from "../../shared/ui";
import { loadMine,workOrderStatuses,workOrderPriorities } from "./model";
import { WorkOrderExecution } from "./DetailScreen";
export function WorkOrderListScreen(){
 const {state,api}=useAuth(),account=state.kind==="READY"?state.session.user.id:"",allowed=state.kind==="READY"&&Object.hasOwn(state.session.permissions,"workorder.execute"),params=useLocalSearchParams<{asset_id?:string}>();
 const assetId=params.asset_id&&/^[1-9]\d*$/.test(params.asset_id)?params.asset_id:undefined;
 const [page,setPage]=useState(1),[selected,setSelected]=useState<string|null>(null),tablet=useWindowDimensions().width>=t.size.tablet;
 const load=useCallback((signal:AbortSignal)=>allowed?loadMine(api,page,assetId,signal):Promise.resolve(null),[api,page,assetId,allowed]);const resource=useResource(`${account}:workorders:${page}:${assetId??"all"}`,load);
 return <SafeAreaView style={styles.page} edges={["top"]}><View style={[styles.body,tablet&&styles.tablet]}><View style={tablet?styles.master:styles.phone}><Text accessibilityRole="header" style={styles.title}>Work Order Saya</Text>{!allowed&&<Notice message="Anda tidak memiliki izin eksekusi work order."/>}{resource.loading&&<Label>Memuat penugasan…</Label>}{resource.error&&<><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
 <FlatList data={resource.data?.data??[]} keyExtractor={row=>row.id} contentContainerStyle={styles.list} ListEmptyComponent={!resource.loading?<Label>Tidak ada penugasan pada saringan ini.</Label>:null} renderItem={({item})=><Card><Label>{item.nomor}</Label><Label>{item.objek_label}</Label><Label>{workOrderStatuses[item.status]} · {workOrderPriorities[item.prioritas]}</Label><Label>Target: {item.target_selesai}</Label>{item.foto_tertunda>0&&<Notice message={`${item.foto_tertunda} foto belum siap.`}/>}<Button title={`Buka ${item.nomor}`} onPress={()=>tablet?setSelected(item.id):router.push(`/work-order/${item.id}` as "/scan")}/></Card>}/>
 <View style={styles.footer}><Button icon="arrowLeft" title="Sebelumnya" secondary disabled={page===1} onPress={()=>setPage(page-1)}/><Label>{page}/{resource.data?.meta.total_pages??1}</Label><Button icon="arrowRight" title="Berikutnya" secondary disabled={page>=(resource.data?.meta.total_pages??1)} onPress={()=>setPage(page+1)}/></View><Button icon="refresh" title="Muat ulang penugasan" secondary onPress={resource.reload}/></View>{tablet&&<View style={styles.detail}>{selected?<WorkOrderExecution key={`${account}:${selected}`} id={selected}/>:<Label>Pilih pekerjaan untuk membaca rincian dan memperbarui progres.</Label>}</View>}</View></SafeAreaView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:t.color.page},body:{flex:1,padding:t.space.md,gap:t.space.md},tablet:{flexDirection:"row"},master:{width:t.size.camera,gap:t.space.md},phone:{flex:1,gap:t.space.md,maxWidth:t.size.content,width:"100%",alignSelf:"center"},detail:{flex:1},title:{fontSize:t.font.heading,fontWeight:"600",color:t.color.heading},list:{gap:t.space.md,paddingBottom:t.space.md},footer:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:t.space.sm}});
