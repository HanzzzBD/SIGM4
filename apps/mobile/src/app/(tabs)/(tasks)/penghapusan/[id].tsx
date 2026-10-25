import { useLocalSearchParams } from "expo-router";
import { DisposalPortalScreen } from "../../../../features/disposal";
export default function DisposalRoute() { const { id } = useLocalSearchParams<{ id: string }>(); return <DisposalPortalScreen key={id} id={id} />; }
