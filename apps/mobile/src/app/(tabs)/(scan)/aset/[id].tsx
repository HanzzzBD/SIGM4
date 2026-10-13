import { useLocalSearchParams } from "expo-router";
import { AssetScreen } from "../../../../features/assets";
export default function Detail() { const { id } = useLocalSearchParams<{ id: string }>(); return <AssetScreen id={id} detail />; }
