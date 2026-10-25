import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { ColorValue } from "react-native";
import { tokens as t } from "./tokens";

// DS-P-07, NFR-AC-04: satu keluarga ikon outline; label disediakan kontrol induk.
const shapes = {
    home: <><Path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
    tasks: <><Rect x="5" y="4" width="14" height="17" rx="2"/><Rect x="9" y="2" width="6" height="4" rx="1"/><Path d="m8 12 2 2 5-5m-7 9h8"/></>,
    scan: <><Path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M3 12h18"/><Path d="M8 7v3m4-3v3m4-3v3m-8 4v3m4-3v3m4-3v3"/></>,
    bell: <><Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    user: <><Circle cx="12" cy="8" r="4"/><Path d="M4 21v-2a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v2"/></>,
    box: <><Path d="m12 3 9 5-9 5-9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/></>,
    calendar: <><Rect x="3" y="5" width="18" height="16" rx="2"/><Path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/></>,
    wrench: <Path d="M14 6a5 5 0 0 0-6 6L3 17a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z"/>,
    chat: <Path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.6A9 9 0 1 1 21 11.5Z"/>,
    bot: <><Rect x="5" y="7" width="14" height="13" rx="3"/><Path d="M12 7V3M9 3h6M2 12h3m14 0h3M9 16h6"/><Circle cx="9" cy="12" r=".5"/><Circle cx="15" cy="12" r=".5"/></>,
    arrowRight: <Path d="M5 12h14m-6-6 6 6-6 6"/>,
    arrowLeft: <Path d="M19 12H5m6-6-6 6 6 6"/>,
    chevronRight: <Path d="m9 5 7 7-7 7"/>,
    chevronDown: <Path d="m6 9 6 6 6-6"/>,
    logout: <><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 4 5 5-5 5M9 12h12"/></>,
    check: <Path d="m5 12 4 4L19 6"/>,
    checkCircle: <><Circle cx="12" cy="12" r="9"/><Path d="m8 12 3 3 5-6"/></>,
    alert: <><Path d="m12 3 10 18H2ZM12 9v4"/><Circle cx="12" cy="17" r=".5"/></>,
    info: <><Circle cx="12" cy="12" r="9"/><Path d="M12 11v6"/><Circle cx="12" cy="7" r=".5"/></>,
    clock: <><Circle cx="12" cy="12" r="9"/><Path d="M12 7v5l3 2"/></>,
    refresh: <><Path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/></>,
    search: <><Circle cx="10.5" cy="10.5" r="7.5"/><Path d="m16 16 5 5"/></>,
    plus: <Path d="M12 5v14M5 12h14"/>,
    mail: <><Rect x="3" y="5" width="18" height="14" rx="2"/><Path d="m3 6 9 7 9-7"/></>,
    lock: <><Rect x="5" y="10" width="14" height="11" rx="2"/><Path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    shield: <><Path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6Z"/><Path d="m8 12 3 3 5-6"/></>,
    send: <Path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>,
    history: <><Path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/></>,
    settings: <><Path d="m9 3-1 3-3 1-2 4 2 2v4l4 2 3-1 3 1 4-2v-4l2-2-2-4-3-1-1-3Z"/><Circle cx="12" cy="12" r="3"/></>,
    close: <Path d="m6 6 12 12M6 18 18 6"/>,
    chart: <><Path d="M3 3v18h18M7 16v-5m5 5V7m5 9v-8"/></>,
} as const;
export type IconName = keyof typeof shapes;
export function Icon({ name, size = t.size.icon, color = t.color.text }: { name: IconName; size?: number; color?: ColorValue }) {
    return <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</Svg>;
}
