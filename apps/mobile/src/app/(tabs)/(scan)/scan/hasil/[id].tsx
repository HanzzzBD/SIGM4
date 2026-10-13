import { useLocalSearchParams } from "expo-router";
import { AssetScreen } from "../../../../../features/assets";
export default function Result() { const { id } = useLocalSearchParams<{ id: string }>(); return <AssetScreen id={id} />; }
