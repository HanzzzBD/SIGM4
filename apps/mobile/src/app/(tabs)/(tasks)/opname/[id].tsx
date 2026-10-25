import { useLocalSearchParams } from "expo-router";
import { StocktakeScreen } from "../../../../features/stocktake";
export default function OpnameSession() { const { id } = useLocalSearchParams<{ id: string }>(); return <StocktakeScreen initialId={id} />; }
