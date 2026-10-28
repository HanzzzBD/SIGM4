import { lazy, Suspense } from "react";
import type { DisposalDetail } from "@sigm4/schemas";
import { KeadaanMemuat } from "../../shared/states";
import type { DisposalFilters } from "./api";
const List = lazy(() => import("./DisposalListPage")), Form = lazy(() => import("./DisposalFormPage")), Detail = lazy(() => import("./DisposalDetailPage"));
export const DisposalListPage = (p: { search: DisposalFilters; onSearch: (patch: Partial<DisposalFilters>) => void }) => <Suspense fallback={<KeadaanMemuat label="Memuat penghapusan" />}><List {...p} /></Suspense>;
export const DisposalFormPage = (p: { initial?: DisposalDetail | undefined; sourceAssetId?: string | undefined }) => <Suspense fallback={<KeadaanMemuat label="Memuat formulir penghapusan" />}><Form {...p} /></Suspense>;
export const DisposalDetailPage = (p: { id: string }) => <Suspense fallback={<KeadaanMemuat label="Memuat detail penghapusan" />}><Detail {...p} /></Suspense>;
