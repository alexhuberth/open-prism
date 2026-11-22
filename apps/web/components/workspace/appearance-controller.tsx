"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { getUiFontCss, resolveThemePalette } from "@/lib/appearance";
import { useAppearanceStore } from "@/stores/appearance-store";

export function AppearanceController() {
  const { resolvedTheme } = useTheme();
  const lightPresetId = useAppearanceStore((s) => s.lightPresetId);
  const darkPresetId = useAppearanceStore((s) => s.darkPresetId);
  const lightBackgroundOverride = useAppearanceStore(
    (s) => s.lightBackgroundOverride,
  );
  const lightTextOverride = useAppearanceStore((s) => s.lightTextOverride);
  const darkBackgroundOverride = useAppearanceStore(
    (s) => s.darkBackgroundOverride,
  );
  const darkTextOverride = useAppearanceStore((s) => s.darkTextOverride);
  const uiFont = useAppearanceStore((s) => s.uiFont);
  const editorFont = useAppearanceStore((s) => s.editorFont);
  const editorFontSize = useAppearanceStore((s) => s.editorFontSize);
  const editorLineHeight = useAppearanceStore((s) => s.editorLineHeight);

  useEffect(() => {
    const mode = resolvedTheme === "dark" ? "dark" : "light";
    const palette = resolveThemePalette(mode, {
      lightPresetId,
      darkPresetId,
      lightBackgroundOverride,
      lightTextOverride,
      darkBackgroundOverride,
      darkTextOverride,
      uiFont,
      editorFont,
      editorFontSize,
      editorLineHeight,
    });

    const root = document.documentElement;
    root.style.setProperty("--background", palette.background);
    root.style.setProperty("--foreground", palette.foreground);
    root.style.setProperty("--card", palette.card);
    root.style.setProperty("--card-foreground", palette.foreground);
    root.style.setProperty("--popover", palette.card);
    root.style.setProperty("--popover-foreground", palette.foreground);
    root.style.setProperty("--primary", palette.primary);
    root.style.setProperty("--primary-foreground", palette.primaryForeground);
    root.style.setProperty("--secondary", palette.muted);
    root.style.setProperty("--secondary-foreground", palette.foreground);
    root.style.setProperty("--muted", palette.muted);
    root.style.setProperty("--muted-foreground", palette.mutedForeground);
    root.style.setProperty("--accent", palette.muted);
    root.style.setProperty("--accent-foreground", palette.foreground);
    root.style.setProperty("--border", palette.border);
    root.style.setProperty("--input", palette.border);
    root.style.setProperty("--sidebar", palette.sidebar);
    root.style.setProperty("--sidebar-foreground", palette.foreground);
    root.style.setProperty("--sidebar-primary", palette.primary);
    root.style.setProperty(
      "--sidebar-primary-foreground",
      palette.primaryForeground,
    );
    root.style.setProperty("--sidebar-accent", palette.muted);
    root.style.setProperty("--sidebar-accent-foreground", palette.foreground);
    root.style.setProperty("--sidebar-border", palette.border);
    root.style.setProperty("--app-font-sans", getUiFontCss(uiFont));
  }, [
    resolvedTheme,
    lightPresetId,
    darkPresetId,
    lightBackgroundOverride,
    lightTextOverride,
    darkBackgroundOverride,
    darkTextOverride,
    uiFont,
    editorFont,
    editorFontSize,
    editorLineHeight,
  ]);

  return null;
}
