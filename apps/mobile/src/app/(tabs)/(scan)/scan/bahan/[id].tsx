import { useLocalSearchParams } from "expo-router";
import { MaterialScreen } from "../../../../../features/materials";
export default function Result(){const {id}=useLocalSearchParams<{id:string}>();return <MaterialScreen id={id}/>;}
