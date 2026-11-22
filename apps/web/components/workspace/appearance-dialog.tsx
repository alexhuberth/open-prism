"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  RotateCcwIcon,
  SunIcon,
  TypeIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DARK_THEME_PRESETS,
  EDITOR_FONT_OPTIONS,
  getEditorFontCss,
  LIGHT_THEME_PRESETS,
  QUICK_DAY_BACKGROUNDS,
  QUICK_DAY_TEXTS,
  QUICK_NIGHT_BACKGROUNDS,
  QUICK_NIGHT_TEXTS,
  resolveThemePalette,
  UI_FONT_OPTIONS,
  type DarkThemePresetId,
  type LightThemePresetId,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/stores/appearance-store";

interface AppearanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FONT_SIZE_OPTIONS: Array<13 | 14 | 15 | 16> = [13, 14, 15, 16];
const LINE_HEIGHT_OPTIONS: Array<{ value: 1.45 | 1.6 | 1.75; label: string }> =
  [
    { value: 1.45, label: "Compacto (1.45)" },
    { value: 1.6, label: "Estándar (1.60)" },
    { value: 1.75, label: "Amplio (1.75)" },
  ];

export function AppearanceDialog({
  open,
  onOpenChange,
}: AppearanceDialogProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const prefs = useAppearanceStore();

  const [editingMode, setEditingMode] = useState<"light" | "dark">(
    resolvedTheme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    if (open) {
      setEditingMode(resolvedTheme === "dark" ? "dark" : "light");
    }
  }, [open, resolvedTheme]);

  const previewPalette = useMemo(
    () => resolveThemePalette(editingMode, prefs),
    [editingMode, prefs],
  );

  const activePresets =
    editingMode === "dark" ? DARK_THEME_PRESETS : LIGHT_THEME_PRESETS;
  const selectedPresetId =
    editingMode === "dark" ? prefs.darkPresetId : prefs.lightPresetId;
  const quickBackgrounds =
    editingMode === "dark" ? QUICK_NIGHT_BACKGROUNDS : QUICK_DAY_BACKGROUNDS;
  const quickTexts =
    editingMode === "dark" ? QUICK_NIGHT_TEXTS : QUICK_DAY_TEXTS;
  const hasCustomOverride =
    editingMode === "dark"
      ? Boolean(prefs.darkBackgroundOverride || prefs.darkTextOverride)
      : Boolean(prefs.lightBackgroundOverride || prefs.lightTextOverride);

  const handleSelectModeTab = (nextMode: "light" | "dark") => {
    setEditingMode(nextMode);
    setTheme(nextMode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PaletteIcon className="size-4 text-primary" />
            Apariencia, colores y tipografía
          </DialogTitle>
          <DialogDescription>
            Configura paletas de fondo, color de texto y fuentes profesionales
            por separado para el modo de día y el modo de noche.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {/* Selector de modo activo */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
            <span className="font-medium text-xs">Modo visual activo</span>
            <div className="flex items-center gap-1 rounded-md bg-muted p-1">
              <button
                type="button"
                onClick={() => handleSelectModeTab("light")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium text-xs transition-colors",
                  theme === "light"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <SunIcon className="size-3.5" />
                Día (Claro)
              </button>
              <button
                type="button"
                onClick={() => handleSelectModeTab("dark")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium text-xs transition-colors",
                  theme === "dark"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <MoonIcon className="size-3.5" />
                Noche (Oscuro)
              </button>
              <button
                type="button"
                onClick={() => setTheme("system")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium text-xs transition-colors",
                  theme === "system"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <MonitorIcon className="size-3.5" />
                Sistema
              </button>
            </div>
          </div>

          {/* Paletas por modo (Día / Noche) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-md bg-muted p-1">
                <button
                  type="button"
                  onClick={() => handleSelectModeTab("light")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium text-xs transition-colors",
                    editingMode === "light"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <SunIcon className="size-3.5 text-amber-500" />
                  Paleta de Día
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectModeTab("dark")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium text-xs transition-colors",
                    editingMode === "dark"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <MoonIcon className="size-3.5 text-indigo-400" />
                  Paleta de Noche
                </button>
              </div>

              {hasCustomOverride && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => prefs.resetCustomColors(editingMode)}
                >
                  <RotateCcwIcon className="size-3" />
                  Usar colores del tema
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {activePresets.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      editingMode === "dark"
                        ? prefs.setDarkPreset(preset.id as DarkThemePresetId)
                        : prefs.setLightPreset(preset.id as LightThemePresetId)
                    }
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border p-3 text-left transition-all",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs">
                          {preset.name}
                        </span>
                        {preset.recommended && (
                          <span className="rounded bg-primary/15 px-1.5 py-0.5 font-medium text-[10px] text-primary">
                            Recomendado
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <CheckIcon className="size-3.5 text-primary" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {preset.description}
                    </p>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span
                        className="size-4 rounded-full border border-border/80"
                        style={{ backgroundColor: preset.background }}
                        title={`Fondo: ${preset.background}`}
                      />
                      <span
                        className="size-4 rounded-full border border-border/80"
                        style={{ backgroundColor: preset.sidebar }}
                        title={`Barra lateral: ${preset.sidebar}`}
                      />
                      <span
                        className="size-4 rounded-full border border-border/80"
                        style={{ backgroundColor: preset.foreground }}
                        title={`Texto: ${preset.foreground}`}
                      />
                      <span
                        className="size-4 rounded-full border border-border/80"
                        style={{ backgroundColor: preset.primary }}
                        title={`Acento: ${preset.primary}`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Personalización fina de Fondo y Texto */}
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs">Color de fondo</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {previewPalette.background}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {quickBackgrounds.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        editingMode === "dark"
                          ? prefs.setDarkBackgroundOverride(color)
                          : prefs.setLightBackgroundOverride(color)
                      }
                      className={cn(
                        "size-6 rounded-md border transition-transform hover:scale-105",
                        previewPalette.background.toLowerCase() ===
                          color.toLowerCase()
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-border",
                      )}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  <label
                    className="inline-flex h-6 cursor-pointer items-center rounded-md border border-border bg-background px-2 text-[11px] hover:bg-accent"
                    title="Elegir color personalizado"
                  >
                    <input
                      type="color"
                      aria-label="Color de fondo personalizado"
                      value={previewPalette.background}
                      onChange={(e) =>
                        editingMode === "dark"
                          ? prefs.setDarkBackgroundOverride(e.target.value)
                          : prefs.setLightBackgroundOverride(e.target.value)
                      }
                      className="mr-1.5 size-3.5 cursor-pointer border-0 bg-transparent p-0"
                    />
                    Otro
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs">Color de texto</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {previewPalette.foreground}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {quickTexts.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        editingMode === "dark"
                          ? prefs.setDarkTextOverride(color)
                          : prefs.setLightTextOverride(color)
                      }
                      className={cn(
                        "size-6 rounded-md border transition-transform hover:scale-105",
                        previewPalette.foreground.toLowerCase() ===
                          color.toLowerCase()
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-border",
                      )}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  <label
                    className="inline-flex h-6 cursor-pointer items-center rounded-md border border-border bg-background px-2 text-[11px] hover:bg-accent"
                    title="Elegir color de texto personalizado"
                  >
                    <input
                      type="color"
                      aria-label="Color de texto personalizado"
                      value={previewPalette.foreground}
                      onChange={(e) =>
                        editingMode === "dark"
                          ? prefs.setDarkTextOverride(e.target.value)
                          : prefs.setLightTextOverride(e.target.value)
                      }
                      className="mr-1.5 size-3.5 cursor-pointer border-0 bg-transparent p-0"
                    />
                    Otro
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Tipografía recomendada */}
          <div className="space-y-3 border-border border-t pt-4">
            <div className="flex items-center gap-2">
              <TypeIcon className="size-4 text-primary" />
              <span className="font-medium text-sm">
                Fuentes profesionales recomendadas
              </span>
            </div>

            <div className="space-y-2">
              <span className="block font-medium text-muted-foreground text-xs">
                Fuente del editor LaTeX
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {EDITOR_FONT_OPTIONS.map((font) => {
                  const selected = prefs.editorFont === font.id;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => prefs.setEditorFont(font.id)}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="font-medium text-xs"
                          style={{ fontFamily: font.cssFamily }}
                        >
                          {font.name}
                        </span>
                        <div className="flex items-center gap-1">
                          {font.recommended && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-medium text-[10px] text-primary">
                              Recomendada
                            </span>
                          )}
                          {selected && (
                            <CheckIcon className="size-3.5 text-primary" />
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {font.category} · {font.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <span className="block font-medium text-muted-foreground text-xs">
                  Fuente de interfaz
                </span>
                <div className="flex flex-col gap-1">
                  {UI_FONT_OPTIONS.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => prefs.setUiFont(font.id)}
                      className={cn(
                        "flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                        prefs.uiFont === font.id
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:bg-accent/50",
                      )}
                      style={{ fontFamily: font.cssFamily }}
                    >
                      <span>{font.name}</span>
                      {prefs.uiFont === font.id && (
                        <CheckIcon className="size-3 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block font-medium text-muted-foreground text-xs">
                  Tamaño de letra (Editor)
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {FONT_SIZE_OPTIONS.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => prefs.setEditorFontSize(size)}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                        prefs.editorFontSize === size
                          ? "border-primary bg-primary/5 font-medium text-primary"
                          : "border-border hover:bg-accent/50",
                      )}
                    >
                      {size} px
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block font-medium text-muted-foreground text-xs">
                  Interlineado
                </span>
                <div className="flex flex-col gap-1">
                  {LINE_HEIGHT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => prefs.setEditorLineHeight(opt.value)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-left text-xs transition-colors",
                        prefs.editorLineHeight === opt.value
                          ? "border-primary bg-primary/5 font-medium text-primary"
                          : "border-border hover:bg-accent/50",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Vista previa en vivo del editor */}
            <div className="space-y-1.5 pt-1">
              <span className="block font-medium text-muted-foreground text-xs">
                Vista previa en vivo ({previewPalette.name})
              </span>
              <div
                className="overflow-hidden rounded-lg border p-3"
                style={{
                  backgroundColor: previewPalette.editorBg,
                  color: previewPalette.editorText,
                  borderColor: previewPalette.border,
                  fontFamily: getEditorFontCss(prefs.editorFont),
                  fontSize: `${prefs.editorFontSize}px`,
                  lineHeight: prefs.editorLineHeight,
                }}
              >
                <div>
                  <span style={{ color: previewPalette.primary }}>
                    \section
                  </span>
                  &#123;Marco Teórico&#125;
                </div>
                <div>
                  La relación fundamental se expresa como{" "}
                  <span style={{ color: previewPalette.primary }}>
                    $E = mc^2$
                  </span>
                  .
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-border border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => prefs.resetAllAppearance()}
          >
            <RotateCcwIcon className="size-3.5" />
            Restablecer todo
          </Button>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Listo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
