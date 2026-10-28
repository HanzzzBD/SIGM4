import { lazy, Suspense } from "react";
import { KeadaanMemuat } from "../../shared/states";
const List = lazy(() => import("./SessionListPage")), Create = lazy(() => import("./SessionCreatePage")), Detail = lazy(() => import("./SessionDetailPage")), Reconcile = lazy(() => import("./ReconciliationPage"));
export const StocktakeListPage = (props: Parameters<typeof List>[0]) => <Suspense fallback={<KeadaanMemuat label="Memuat opname" />}><List {...props} /></Suspense>;
export const StocktakeCreatePage = () => <Suspense fallback={<KeadaanMemuat label="Memuat opname" />}><Create /></Suspense>;
export const StocktakeDetailPage = (props: { id: string }) => <Suspense fallback={<KeadaanMemuat label="Memuat opname" />}><Detail {...props} /></Suspense>;
export const StocktakeReconciliationPage = (props: { id: string }) => <Suspense fallback={<KeadaanMemuat label="Memuat rekonsiliasi" />}><Reconcile {...props} /></Suspense>;
