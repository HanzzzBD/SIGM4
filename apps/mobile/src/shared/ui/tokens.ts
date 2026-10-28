/** Nilai native dari FOUNDATIONS.md; komponen memakai token (DS-P-07). */
export const tokens = {
    color: { page: "#F9FAFB", surface: "#FFFFFF", text: "#4B5563", heading: "#111827", muted: "#6B7280", border: "#D1D5DB", borderSubtle: "#E5E7EB", borderStrong: "#868E9B", primary: "#1F7A8C", primaryPressed: "#196574", primarySoft: "#F2F7F8", primaryBorder: "#C5DCE1", error: "#B42318", errorSoft: "#FEF3F2", success: "#067647", successSoft: "#ECFDF3", warning: "#B54708", warningSoft: "#FFFAEB", info: "#175CD3", infoSoft: "#E8EFFB", neutralSoft: "#F3F4F6", track: "#E5E7EB", pending: "#D1D5DB", inverse: "#FFFFFF", iconDefault: "#4B5563", iconInverse: "#FFFFFF", overlay: "rgba(17, 24, 39, 0.48)", shadow: "#111827", chat: "#155DFF", chatSoft: "#EFF6FF",
        // Accent hanya fill/latar/penanda — tidak pernah teks, ikon, border 1px, atau fill tombol (DSD-07).
        accent: { blue: "#00529C", green: "#028744", yellow: "#FEB003", purple: "#541F7F", gray: "#7B7B7B", red: "#D4160D" } },
    space: { xs: 4, sm: 8, ms: 12, md: 16, ml: 20, lg: 24, xl: 32, xxl: 48 },
    radius: { sm: 4, md: 6, lg: 8, full: 9999 },
    font: { caption: 12, small: 14, body: 16, title: 18, heading: 24, display: 32 },
    size: { touch: 44, control: 48, icon: 20, iconSmall: 16, iconLarge: 24, avatar: 48, tabBar: 68, topbar: 64, rowMobile: 48, media: 56, tileIcon: 40, fab: 56, badge: 18, ring: 40, ringLarge: 96, chart: 64, illustration: 120, qr: 240, camera: 320, content: 640, tablet:768 },
    motion: { base: 200, slow: 280 },
    elevation: {
        raised: { shadowColor: "#111827", shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
        floating: { shadowColor: "#111827", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    },
} as const;
