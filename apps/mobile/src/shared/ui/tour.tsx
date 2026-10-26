import { createContext, useCallback, useContext } from "react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CopilotProvider, CopilotStep, useCopilot, walkthroughable } from "react-native-copilot";
import { tokens as t } from "./tokens";

/**
 * Tur produk berbasis role (keputusan pemilik produk 26 Oktober 2026). `TourScope` adalah satu kelompok
 * tur: hanya `TourTarget` di bawah provider terdekat yang ikut, sehingga tur utama (tab) dan mini-tur
 * setiap layar tidak saling bercampur. Katalog & progres disediakan fitur lewat `TourChrome`, agar
 * shared/ui tidak mengimpor fitur (SDD-12 §4.1).
 */
export type TourStatus = "SELESAI" | "DILEWATI";
export interface TourCopy { readonly title: string; readonly text: string }
export interface PageTourSpec { readonly key: string; readonly header: TourCopy; readonly content: TourCopy }
export interface TourChrome {
    pageTour(pathname: string): PageTourSpec | null;
    shouldAutoRun(key: string): boolean;
    finish(key: string, status: TourStatus): void;
}

const TourChromeContext = createContext<TourChrome | null>(null);
export function TourChromeProvider({ value, children }: { value: TourChrome | null; children: ReactNode }) { return <TourChromeContext.Provider value={value}>{children}</TourChromeContext.Provider>; }
export function useTourChrome() { return useContext(TourChromeContext); }

const WalkthroughableView = walkthroughable(View);
/** CopilotStep hanya membawa satu string: judul dan isi dipisah baris baru. */
const SEPARATOR = "\n";

export function TourTarget({ name, order, copy, children }: { name: string; order: number; copy: TourCopy; children: ReactNode }) {
    return <CopilotStep name={name} order={order} text={`${copy.title}${SEPARATOR}${copy.text}`}><WalkthroughableView collapsable={false}>{children}</WalkthroughableView></CopilotStep>;
}

const FinishContext = createContext<(status: TourStatus) => void>(() => undefined);

function TourTooltip() {
    const { currentStep, isFirstStep, isLastStep, goToNext, goToPrev, stop, currentStepNumber, totalStepsNumber } = useCopilot();
    const finish = useContext(FinishContext);
    const [title = "", ...rest] = (currentStep?.text ?? "").split(SEPARATOR);
    // Menutup pada langkah terakhir berarti seluruh isi tur sudah dilihat.
    const end = (status: TourStatus) => { finish(status); void stop(); };
    return <View accessibilityViewIsModal style={styles.tooltip}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.text}>{rest.join(SEPARATOR)}</Text>
        <Text style={styles.progress}>{currentStepNumber} dari {totalStepsNumber}</Text>
        <View style={styles.row}>
            {!isLastStep && <Pressable accessibilityRole="button" accessibilityLabel="Lewati tur" onPress={() => end("DILEWATI")} style={styles.ghost}><Text style={styles.ghostText}>Lewati</Text></Pressable>}
            <View style={styles.spacer}/>
            {!isFirstStep && <Pressable accessibilityRole="button" accessibilityLabel="Langkah sebelumnya" onPress={() => void goToPrev()} style={styles.secondary}><Text style={styles.secondaryText}>Kembali</Text></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={isLastStep ? "Selesai" : "Langkah berikutnya"} onPress={() => { if (isLastStep) end("SELESAI"); else void goToNext(); }} style={styles.primary}><Text style={styles.primaryText}>{isLastStep ? "Selesai" : "Lanjut"}</Text></Pressable>
        </View>
    </View>;
}
const NoStepNumber = () => null;

export function TourScope({ onFinish, children }: { onFinish: (status: TourStatus) => void; children: ReactNode }) {
    return <FinishContext.Provider value={onFinish}><CopilotProvider tooltipComponent={TourTooltip} stepNumberComponent={NoStepNumber} overlay="svg" animated backdropColor={t.color.overlay} arrowColor={t.color.surface} tooltipStyle={styles.box} androidStatusBarVisible>{children}</CopilotProvider></FinishContext.Provider>;
}

/** Kendali kelompok tur terdekat: `start()` memutar seluruh langkah `TourTarget` di bawah `TourScope`. */
export function useTourControl() { const { start, visible } = useCopilot(); const run = useCallback(() => { void start(); }, [start]); return { start: run, visible }; }

const styles = StyleSheet.create({
    box: { backgroundColor: t.color.surface, borderRadius: t.radius.lg, padding: 0 },
    tooltip: { gap: t.space.sm, padding: t.space.md },
    title: { fontSize: t.font.title, fontWeight: "600", color: t.color.heading },
    text: { fontSize: t.font.small, lineHeight: 20, color: t.color.text },
    progress: { fontSize: t.font.caption, color: t.color.muted },
    row: { flexDirection: "row", alignItems: "center", gap: t.space.sm, marginTop: t.space.xs },
    spacer: { flex: 1 },
    ghost: { minHeight: t.size.touch, justifyContent: "center", paddingHorizontal: t.space.sm },
    ghostText: { fontSize: t.font.small, fontWeight: "500", color: t.color.muted },
    secondary: { minHeight: t.size.touch, justifyContent: "center", paddingHorizontal: t.space.md, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.color.borderStrong },
    secondaryText: { fontSize: t.font.small, fontWeight: "500", color: t.color.text },
    primary: { minHeight: t.size.touch, justifyContent: "center", paddingHorizontal: t.space.md, borderRadius: t.radius.md, backgroundColor: t.color.primary },
    primaryText: { fontSize: t.font.small, fontWeight: "600", color: t.color.inverse },
});
