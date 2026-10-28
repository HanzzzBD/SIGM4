import { lazy, Suspense } from "react";
import { KeadaanMemuat } from "../../shared/states";
const List = lazy(() => import("./ScheduleListPage")), Detail = lazy(() => import("./ScheduleDetailPage"));
export const ScheduleList = (props: Parameters<typeof List>[0]) => <Suspense fallback={<KeadaanMemuat label="Memuat jadwal" />}><List {...props} /></Suspense>;
export const ScheduleDetail = (props: { id: string }) => <Suspense fallback={<KeadaanMemuat label="Memuat jadwal" />}><Detail {...props} /></Suspense>;
