"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppearancePreferences,
  DarkThemePresetId,
  EditorFontId,
  LightThemePresetId,
  UiFontId,
} from "@/lib/appearance";

interface AppearanceState extends AppearancePreferences {
  setLightPreset: (id: LightThemePresetId) => void;
  setDarkPreset: (id: DarkThemePresetId) => void;
  setLightBackgroundOverride: (color: string | null) => void;
  setLightTextOverride: (color: string | null) => void;
  setDarkBackgroundOverride: (color: string | null) => void;
  setDarkTextOverride: (color: string | null) => void;
  resetCustomColors: (mode: "light" | "dark") => void;
  setUiFont: (font: UiFontId) => void;
  setEditorFont: (font: EditorFontId) => void;
  setEditorFontSize: (size: 13 | 14 | 15 | 16) => void;
  setEditorLineHeight: (lineHeight: 1.45 | 1.6 | 1.75) => void;
  resetAllAppearance: () => void;
}

const DEFAULT_APPEARANCE: AppearancePreferences = {
  lightPresetId: "editorial-paper",
  darkPresetId: "obsidian-blue",
  lightBackgroundOverride: null,
  lightTextOverride: null,
  darkBackgroundOverride: null,
  darkTextOverride: null,
  uiFont: "geist",
  editorFont: "jetbrains-mono",
  editorFontSize: 14,
  editorLineHeight: 1.6,
};

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      ...DEFAULT_APPEARANCE,

      setLightPreset: (lightPresetId) =>
        set({
          lightPresetId,
          lightBackgroundOverride: null,
          lightTextOverride: null,
        }),

      setDarkPreset: (darkPresetId) =>
        set({
          darkPresetId,
          darkBackgroundOverride: null,
          darkTextOverride: null,
        }),

      setLightBackgroundOverride: (lightBackgroundOverride) =>
        set({ lightBackgroundOverride }),

      setLightTextOverride: (lightTextOverride) => set({ lightTextOverride }),

      setDarkBackgroundOverride: (darkBackgroundOverride) =>
        set({ darkBackgroundOverride }),

      setDarkTextOverride: (darkTextOverride) => set({ darkTextOverride }),

      resetCustomColors: (mode) =>
        set(
          mode === "dark"
            ? { darkBackgroundOverride: null, darkTextOverride: null }
            : { lightBackgroundOverride: null, lightTextOverride: null },
        ),

      setUiFont: (uiFont) => set({ uiFont }),
      setEditorFont: (editorFont) => set({ editorFont }),
      setEditorFontSize: (editorFontSize) => set({ editorFontSize }),
      setEditorLineHeight: (editorLineHeight) => set({ editorLineHeight }),
      resetAllAppearance: () => set({ ...DEFAULT_APPEARANCE }),
    }),
    {
      name: "open-prism-appearance",
    },
  ),
);
