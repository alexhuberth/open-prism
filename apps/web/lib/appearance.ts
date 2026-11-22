export type LightThemePresetId =
  | "editorial-paper"
  | "prism-light"
  | "warm-sepia"
  | "soft-slate";

export type DarkThemePresetId =
  | "obsidian-blue"
  | "graphite-onedark"
  | "oled-midnight"
  | "nordic-forest";

export type UiFontId = "geist" | "inter" | "jakarta";
export type EditorFontId =
  | "jetbrains-mono"
  | "ibm-plex-mono"
  | "fira-code"
  | "source-serif"
  | "geist-mono";

export interface ThemePalettePreset {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
  isDark: boolean;
  background: string;
  foreground: string;
  sidebar: string;
  card: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  editorBg: string;
  editorGutter: string;
  editorText: string;
}

export interface FontOption<T extends string> {
  id: T;
  name: string;
  category: string;
  description: string;
  recommended?: boolean;
  cssFamily: string;
}

export const LIGHT_THEME_PRESETS: ThemePalettePreset[] = [
  {
    id: "editorial-paper",
    name: "Papel Editorial",
    description: "Marfil suave sin reflejos; ideal para escribir de día",
    recommended: true,
    isDark: false,
    background: "#FAF8F4",
    foreground: "#1F2328",
    sidebar: "#F2EFE8",
    card: "#FFFFFF",
    muted: "#ECE8DF",
    mutedForeground: "#5E646E",
    border: "#E2DDD2",
    primary: "#2563EB",
    primaryForeground: "#FFFFFF",
    editorBg: "#FCFBF7",
    editorGutter: "#F4F1E9",
    editorText: "#1F2328",
  },
  {
    id: "prism-light",
    name: "Blanco Puro",
    description: "Contraste limpio y minimalista estilo Prism clásico",
    isDark: false,
    background: "#FFFFFF",
    foreground: "#0F172A",
    sidebar: "#F8FAFC",
    card: "#FFFFFF",
    muted: "#F1F5F9",
    mutedForeground: "#64748B",
    border: "#E2E8F0",
    primary: "#18181B",
    primaryForeground: "#FFFFFF",
    editorBg: "#FFFFFF",
    editorGutter: "#F8FAFC",
    editorText: "#0F172A",
  },
  {
    id: "warm-sepia",
    name: "Sepia Cálido",
    description: "Tono libro clásico con baja fatiga visual para tesis largas",
    isDark: false,
    background: "#F4ECD8",
    foreground: "#3B2F23",
    sidebar: "#EAE0C7",
    card: "#FAF4E4",
    muted: "#E5DAC0",
    mutedForeground: "#6E5D4B",
    border: "#D8CBAF",
    primary: "#9A3412",
    primaryForeground: "#FFF7ED",
    editorBg: "#F8F1DF",
    editorGutter: "#EFE6CF",
    editorText: "#3B2F23",
  },
  {
    id: "soft-slate",
    name: "Pizarra Suave",
    description: "Gris frío técnico de alto confort en oficinas iluminadas",
    isDark: false,
    background: "#EDF2F7",
    foreground: "#1E293B",
    sidebar: "#E3EAF2",
    card: "#F8FAFC",
    muted: "#DCE4EE",
    mutedForeground: "#475569",
    border: "#CBD5E1",
    primary: "#0284C7",
    primaryForeground: "#FFFFFF",
    editorBg: "#F4F7FA",
    editorGutter: "#EAEFF5",
    editorText: "#1E293B",
  },
];

export const DARK_THEME_PRESETS: ThemePalettePreset[] = [
  {
    id: "obsidian-blue",
    name: "Obsidiana Azul",
    description: "Negro azulado profundo con texto perlado de contraste óptimo",
    recommended: true,
    isDark: true,
    background: "#0F141B",
    foreground: "#E6EDF3",
    sidebar: "#141A23",
    card: "#161D27",
    muted: "#1D2532",
    mutedForeground: "#8B98A8",
    border: "#253041",
    primary: "#60A5FA",
    primaryForeground: "#0B1120",
    editorBg: "#11161F",
    editorGutter: "#151C27",
    editorText: "#E6EDF3",
  },
  {
    id: "graphite-onedark",
    name: "Grafito Neutro",
    description: "Gris oscuro equilibrado inspirado en One Dark Pro",
    isDark: true,
    background: "#181A1F",
    foreground: "#DCE0E8",
    sidebar: "#1F2229",
    card: "#21252B",
    muted: "#282C34",
    mutedForeground: "#9AA2B1",
    border: "#323842",
    primary: "#61AFEF",
    primaryForeground: "#0E1722",
    editorBg: "#21252B",
    editorGutter: "#262B33",
    editorText: "#D4D8E0",
  },
  {
    id: "oled-midnight",
    name: "Medianoche OLED",
    description: "Negro intenso para trabajo nocturno y pantallas OLED",
    isDark: true,
    background: "#060609",
    foreground: "#E4E4E7",
    sidebar: "#0B0C11",
    card: "#101118",
    muted: "#181923",
    mutedForeground: "#9CA3AF",
    border: "#222431",
    primary: "#818CF8",
    primaryForeground: "#090A14",
    editorBg: "#090A0F",
    editorGutter: "#0E1017",
    editorText: "#E4E4E7",
  },
  {
    id: "nordic-forest",
    name: "Bosque Nórdico",
    description: "Azul pizarra sereno (Nord) muy descansado para la vista",
    isDark: true,
    background: "#222731",
    foreground: "#ECEFF4",
    sidebar: "#2B303C",
    card: "#2A303B",
    muted: "#343B48",
    mutedForeground: "#A5B1C2",
    border: "#3E4656",
    primary: "#88C0D0",
    primaryForeground: "#1A222B",
    editorBg: "#272C36",
    editorGutter: "#2D333F",
    editorText: "#ECEFF4",
  },
];

export const UI_FONT_OPTIONS: FontOption<UiFontId>[] = [
  {
    id: "geist",
    name: "Geist Sans",
    category: "Geométrica técnica",
    description: "Nítida y moderna; equilibrio ideal para menús y botones",
    recommended: true,
    cssFamily: "var(--font-geist-sans), system-ui, sans-serif",
  },
  {
    id: "inter",
    name: "Inter",
    category: "Editorial UI",
    description:
      "Diseñada específicamente para máxima legibilidad en pantallas",
    cssFamily: "var(--font-inter), system-ui, sans-serif",
  },
  {
    id: "jakarta",
    name: "Plus Jakarta Sans",
    category: "Humanista limpia",
    description: "Trazos suaves y elegantes para un espacio de trabajo cálido",
    cssFamily: "var(--font-jakarta), system-ui, sans-serif",
  },
];

export const EDITOR_FONT_OPTIONS: FontOption<EditorFontId>[] = [
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    category: "Monoespaciada",
    description:
      "Distingue perfectamente 1/l/I y llaves LaTeX en sesiones largas",
    recommended: true,
    cssFamily: "var(--font-jetbrains-mono), monospace",
  },
  {
    id: "ibm-plex-mono",
    name: "IBM Plex Mono",
    category: "Monoespaciada científica",
    description: "Precisa, académica y muy cómoda para artículos y fórmulas",
    cssFamily: "var(--font-ibm-plex-mono), monospace",
  },
  {
    id: "fira-code",
    name: "Fira Code",
    category: "Monoespaciada",
    description: "Ligaduras limpias y excelente proporción para código LaTeX",
    cssFamily: "var(--font-fira-code), monospace",
  },
  {
    id: "source-serif",
    name: "Source Serif 4",
    category: "Editorial (Libro / Tesis)",
    description: "Serifa literaria para redactar libros o capítulos extensos",
    cssFamily: "var(--font-source-serif), Georgia, serif",
  },
  {
    id: "geist-mono",
    name: "Geist Mono",
    category: "Monoespaciada minimalista",
    description: "Compacta y uniforme con la interfaz Geist",
    cssFamily: "var(--font-geist-mono), monospace",
  },
];

export const QUICK_DAY_BACKGROUNDS = [
  "#FAF8F4",
  "#FFFFFF",
  "#F4ECD8",
  "#EDF2F7",
  "#EEF5EE",
];

export const QUICK_DAY_TEXTS = [
  "#1F2328",
  "#0F172A",
  "#3B2F23",
  "#1E3A2F",
  "#312E81",
];

export const QUICK_NIGHT_BACKGROUNDS = [
  "#0F141B",
  "#181A1F",
  "#060609",
  "#222731",
  "#0F1916",
];

export const QUICK_NIGHT_TEXTS = [
  "#E6EDF3",
  "#DCE0E8",
  "#F3EDE0",
  "#D7E9E2",
  "#C7D2FE",
];

function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

export function mixHex(hexA: string, hexB: string, weightB: number): string {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return hexA;
  const w = Math.max(0, Math.min(1, weightB));
  return toHex(
    a[0] * (1 - w) + b[0] * w,
    a[1] * (1 - w) + b[1] * w,
    a[2] * (1 - w) + b[2] * w,
  );
}

export interface ResolvedThemePalette extends ThemePalettePreset {
  editorActiveLine: string;
  editorSelection: string;
  editorCaret: string;
}

export interface AppearancePreferences {
  lightPresetId: LightThemePresetId;
  darkPresetId: DarkThemePresetId;
  lightBackgroundOverride: string | null;
  lightTextOverride: string | null;
  darkBackgroundOverride: string | null;
  darkTextOverride: string | null;
  uiFont: UiFontId;
  editorFont: EditorFontId;
  editorFontSize: 13 | 14 | 15 | 16;
  editorLineHeight: 1.45 | 1.6 | 1.75;
}

export function resolveThemePalette(
  mode: "light" | "dark",
  prefs: AppearancePreferences,
): ResolvedThemePalette {
  const isDark = mode === "dark";
  const presets = isDark ? DARK_THEME_PRESETS : LIGHT_THEME_PRESETS;
  const targetId = isDark ? prefs.darkPresetId : prefs.lightPresetId;
  const base = presets.find((p) => p.id === targetId) ?? presets[0];

  const bgOverride = isDark
    ? prefs.darkBackgroundOverride
    : prefs.lightBackgroundOverride;
  const textOverride = isDark
    ? prefs.darkTextOverride
    : prefs.lightTextOverride;

  const background =
    bgOverride && parseHex(bgOverride) ? bgOverride : base.background;
  const foreground =
    textOverride && parseHex(textOverride) ? textOverride : base.foreground;

  const hasCustomBg = Boolean(bgOverride && parseHex(bgOverride));
  const hasCustomText = Boolean(textOverride && parseHex(textOverride));

  const sidebar = hasCustomBg
    ? mixHex(background, isDark ? "#FFFFFF" : "#000000", isDark ? 0.04 : 0.035)
    : base.sidebar;
  const card = hasCustomBg
    ? mixHex(background, "#FFFFFF", isDark ? 0.05 : 0.65)
    : base.card;
  const muted = hasCustomBg
    ? mixHex(background, isDark ? "#FFFFFF" : "#000000", isDark ? 0.08 : 0.06)
    : base.muted;
  const border = hasCustomBg
    ? mixHex(background, foreground, isDark ? 0.16 : 0.14)
    : base.border;
  const mutedForeground = hasCustomText
    ? mixHex(foreground, background, 0.38)
    : base.mutedForeground;

  const editorBg = hasCustomBg
    ? mixHex(background, "#FFFFFF", isDark ? 0.015 : 0.35)
    : base.editorBg;
  const editorGutter = hasCustomBg
    ? mixHex(editorBg, isDark ? "#FFFFFF" : "#000000", isDark ? 0.035 : 0.03)
    : base.editorGutter;
  const editorText = hasCustomText ? foreground : base.editorText;

  return {
    ...base,
    background,
    foreground,
    sidebar,
    card,
    muted,
    mutedForeground,
    border,
    editorBg,
    editorGutter,
    editorText,
    editorActiveLine: isDark
      ? mixHex(editorBg, "#FFFFFF", 0.05)
      : mixHex(editorBg, "#000000", 0.04),
    editorSelection: isDark ? `${base.primary}40` : `${base.primary}2B`,
    editorCaret: base.primary,
  };
}

export function getUiFontCss(id: UiFontId): string {
  return (
    UI_FONT_OPTIONS.find((f) => f.id === id)?.cssFamily ??
    UI_FONT_OPTIONS[0].cssFamily
  );
}

export function getEditorFontCss(id: EditorFontId): string {
  return (
    EDITOR_FONT_OPTIONS.find((f) => f.id === id)?.cssFamily ??
    EDITOR_FONT_OPTIONS[0].cssFamily
  );
}
