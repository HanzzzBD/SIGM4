import { FineActions, FineDetailScreen } from "../../../../features/loans";
export default function FineDetail() { return <FineDetailScreen actions={(fine, reload) => <FineActions fine={fine} reload={reload}/>}/>; }
