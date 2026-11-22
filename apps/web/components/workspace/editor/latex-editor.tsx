"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { toast } from "sonner";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  scrollPastEnd,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { useTheme } from "next-themes";
import {
  search,
  highlightSelectionMatches,
  SearchQuery,
  setSearchQuery as setSearchQueryEffect,
  findNext,
  findPrevious,
} from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import {
  latex,
  latexCompletionSource as builtinLatexCompletionSource,
} from "codemirror-lang-latex";
import { compileActiveProject } from "@/lib/compile-active-project";
import {
  getEditorFontCss,
  resolveThemePalette,
  type ResolvedThemePalette,
} from "@/lib/appearance";
import { latexCompletionSource } from "@/lib/latex-autocomplete";
import { createProjectAwareLatexLinter } from "@/lib/latex-linter";
import { isImageFile, isTextFile } from "@/lib/project-files";
import { useAppearanceStore } from "@/stores/appearance-store";
import { useDocumentStore } from "@/stores/document-store";
import { AIDrawer } from "./ai-drawer";
import { EditorToolbar } from "./editor-toolbar";
import { ImagePreview } from "./image-preview";
import { LatexTools, PendingProposalsBanner } from "./latex-tools";
import { MathPreviewPopover } from "./math-preview-popover";
import { SearchPanel } from "./search-panel";

interface StickyItem {
  type: "section" | "begin";
  name: string;
  content: string;
  html: string;
  line: number;
}

interface ParsedLine {
  type: "section" | "begin" | "end";
  name: string;
  content: string;
  line: number;
}

function parseLatexStructure(content: string): ParsedLine[] {
  const lines = content.split("\n");
  const result: ParsedLine[] = [];

  const sectionRegex =
    /\\(part|chapter|section|subsection|subsubsection)\*?\s*\{[^}]*\}/;
  const beginRegex = /\\begin\{([^}]+)\}/;
  const endRegex = /\\end\{([^}]+)\}/;

  lines.forEach((lineContent, index) => {
    const sectionMatch = lineContent.match(sectionRegex);
    if (sectionMatch) {
      result.push({
        type: "section",
        name: sectionMatch[1],
        content: lineContent,
        line: index + 1,
      });
      return;
    }

    const beginMatch = lineContent.match(beginRegex);
    if (beginMatch) {
      result.push({
        type: "begin",
        name: beginMatch[1],
        content: lineContent,
        line: index + 1,
      });
      return;
    }

    const endMatch = lineContent.match(endRegex);
    if (endMatch) {
      result.push({
        type: "end",
        name: endMatch[1],
        content: lineContent,
        line: index + 1,
      });
    }
  });

  return result;
}

function getStickyLines(
  parsedLines: ParsedLine[],
  currentLine: number,
): StickyItem[] {
  const stack: StickyItem[] = [];

  const sectionLevelMap: Record<string, number> = {
    part: 0,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
  };

  for (const item of parsedLines) {
    if (item.line > currentLine) break;

    if (item.type === "section") {
      const level = sectionLevelMap[item.name] ?? 2;
      while (
        stack.length > 0 &&
        stack[stack.length - 1].type === "section" &&
        sectionLevelMap[stack[stack.length - 1].name] >= level
      ) {
        stack.pop();
      }
      stack.push({
        type: "section",
        name: item.name,
        content: item.content,
        html: "",
        line: item.line,
      });
    } else if (item.type === "begin") {
      stack.push({
        type: "begin",
        name: item.name,
        content: item.content,
        html: "",
        line: item.line,
      });
    } else if (item.type === "end") {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].type === "begin" && stack[i].name === item.name) {
          stack.splice(i, 1);
          break;
        }
      }
    }
  }

  return stack;
}

function getActiveFileContent(): string {
  const state = useDocumentStore.getState();
  const activeFile = state.files.find((f) => f.id === state.activeFileId);
  return activeFile?.content ?? "";
}

function buildDynamicEditorTheme(palette: ResolvedThemePalette) {
  return [
    EditorView.theme(
      {
        "&": {
          height: "100%",
          backgroundColor: palette.editorBg,
          color: palette.editorText,
        },
        ".cm-scroller": {
          overflow: "auto",
        },
        ".cm-gutters": {
          backgroundColor: palette.editorGutter,
          color: palette.mutedForeground,
          borderRight: `1px solid ${palette.border}`,
          paddingRight: "4px",
        },
        ".cm-lineNumbers .cm-gutterElement": {
          paddingLeft: "8px",
          paddingRight: "4px",
        },
        ".cm-activeLine": {
          backgroundColor: palette.editorActiveLine,
        },
        ".cm-activeLineGutter": {
          backgroundColor: palette.editorActiveLine,
          color: palette.editorText,
        },
        ".cm-cursor, .cm-dropCursor": {
          borderLeftColor: palette.editorCaret,
        },
        ".cm-content": {
          caretColor: palette.editorCaret,
          paddingLeft: "8px",
          paddingRight: "12px",
        },
        ".cm-searchMatch": {
          backgroundColor: "#facc15 !important",
          color: "#000 !important",
          borderRadius: "2px",
          boxShadow: "0 0 0 1px #eab308",
        },
        ".cm-searchMatch-selected": {
          backgroundColor: "#f97316 !important",
          color: "#fff !important",
          borderRadius: "2px",
          boxShadow: "0 0 0 2px #ea580c",
        },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
          backgroundColor: `${palette.editorSelection} !important`,
        },
      },
      { dark: palette.isDark },
    ),
    syntaxHighlighting(
      palette.isDark ? oneDarkHighlightStyle : defaultHighlightStyle,
    ),
  ];
}

function buildTypographyTheme(
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
) {
  return EditorView.theme({
    "&": {
      fontSize: `${fontSize}px`,
    },
    ".cm-content, .cm-gutters": {
      fontFamily,
      lineHeight: String(lineHeight),
    },
  });
}

export function LatexEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const typographyCompartmentRef = useRef(new Compartment());

  const { resolvedTheme } = useTheme();
  const appearancePrefs = useAppearanceStore();
  const editorPalette = useMemo(
    () =>
      resolveThemePalette(
        resolvedTheme === "dark" ? "dark" : "light",
        appearancePrefs,
      ),
    [resolvedTheme, appearancePrefs],
  );
  const editorFontCss = useMemo(
    () => getEditorFontCss(appearancePrefs.editorFont),
    [appearancePrefs.editorFont],
  );
  const editorPaletteRef = useRef(editorPalette);
  editorPaletteRef.current = editorPalette;
  const typographyRef = useRef({
    fontFamily: editorFontCss,
    fontSize: appearancePrefs.editorFontSize,
    lineHeight: appearancePrefs.editorLineHeight,
  });
  typographyRef.current = {
    fontFamily: editorFontCss,
    fontSize: appearancePrefs.editorFontSize,
    lineHeight: appearancePrefs.editorLineHeight,
  };

  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const setContent = useDocumentStore((s) => s.setContent);
  const cursorPosition = useDocumentStore((s) => s.cursorPosition);
  const setCursorPosition = useDocumentStore((s) => s.setCursorPosition);
  const setSelectionRange = useDocumentStore((s) => s.setSelectionRange);
  const jumpToPosition = useDocumentStore((s) => s.jumpToPosition);
  const clearJumpRequest = useDocumentStore((s) => s.clearJumpRequest);

  const activeFile = files.find((f) => f.id === activeFileId);
  const isEditableText = activeFile ? isTextFile(activeFile) : false;
  const activeFileContent = activeFile?.content;

  const [imageScale, setImageScale] = useState(0.5);
  const [currentLine, setCurrentLine] = useState(1);
  const [gutterWidth, setGutterWidth] = useState(0);
  const [lineHtmlCache, setLineHtmlCache] = useState<Record<number, string>>(
    {},
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);

  const parsedLines = useMemo(
    () => parseLatexStructure(activeFileContent ?? ""),
    [activeFileContent],
  );

  const stickyLines = useMemo(() => {
    const items = getStickyLines(parsedLines, currentLine);
    return items.map((item) => ({
      ...item,
      html: lineHtmlCache[item.line] || "",
    }));
  }, [parsedLines, currentLine, lineHtmlCache]);

  const compileRef = useRef<() => void>(() => {});
  const isSearchOpenRef = useRef(false);

  useEffect(() => {
    isSearchOpenRef.current = isSearchOpen;
  }, [isSearchOpen]);

  useEffect(() => {
    if (!searchQuery || !activeFileContent) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    const regex = new RegExp(
      searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi",
    );
    const matches = activeFileContent.match(regex);
    setMatchCount(matches?.length ?? 0);
    if (matches && matches.length > 0) {
      setCurrentMatch(1);
    } else {
      setCurrentMatch(0);
    }
  }, [searchQuery, activeFileContent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const query = new SearchQuery({
      search: searchQuery,
      caseSensitive: false,
      literal: true,
    });

    view.dispatch({
      effects: setSearchQueryEffect.of(query),
    });

    if (searchQuery) {
      findNext(view);
    }
  }, [searchQuery]);

  const handleFindNext = () => {
    const view = viewRef.current;
    if (!view) return;
    findNext(view);
    view.focus();
  };

  const handleFindPrevious = () => {
    const view = viewRef.current;
    if (!view) return;
    findPrevious(view);
    view.focus();
  };

  compileRef.current = () => {
    compileActiveProject();
  };

  const handleForwardSync = useCallback(async () => {
    const view = viewRef.current;
    const state = useDocumentStore.getState();
    const currentFile = state.files.find((f) => f.id === state.activeFileId);
    if (!view || !currentFile || !isTextFile(currentFile)) return;

    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    let buildId = state.compileBuildId;

    if (!buildId) {
      const ok = await compileActiveProject();
      if (!ok) return;
      buildId = useDocumentStore.getState().compileBuildId;
      if (!buildId) {
        toast.info(
          "No se pudieron generar datos SyncTeX para esta compilación.",
        );
        return;
      }
    }

    try {
      const res = await fetch("/api/compile/synctex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildId,
          direction: "forward",
          file: currentFile.name,
          line,
        }),
      });
      const data = (await res.json()) as {
        page?: number;
        xPt?: number;
        yPt?: number;
        widthPt?: number;
        heightPt?: number;
        error?: string;
      };
      if (!res.ok || !data.page) {
        toast.info(
          data.error || "No se encontró esa línea en el PDF compilado.",
        );
        return;
      }

      useDocumentStore.getState().requestPdfSyncTarget({
        page: data.page,
        xPt: data.xPt ?? 72,
        yPt: data.yPt ?? 72,
        widthPt: data.widthPt ?? 120,
        heightPt: data.heightPt ?? 14,
      });
    } catch {
      toast.error("Error al consultar SyncTeX hacia el PDF.");
    }
  }, []);

  useEffect(() => {
    const handleForwardShortcut = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "l"
      ) {
        e.preventDefault();
        void handleForwardSync();
      }
    };
    window.addEventListener("keydown", handleForwardShortcut);
    return () => window.removeEventListener("keydown", handleForwardShortcut);
  }, [handleForwardSync]);

  useEffect(() => {
    setCurrentLine(1);
    setLineHtmlCache({});
    if (!containerRef.current || !isEditableText) return;

    const currentContent = getActiveFileContent();

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setContent(update.state.doc.toString());
      }
      if (update.selectionSet) {
        const { from, to, head } = update.state.selection.main;
        setCursorPosition(head);
        if (from !== to) {
          setSelectionRange({ start: from, end: to });
        } else {
          setSelectionRange(null);
        }
      }
    });

    const scrollListener = EditorView.domEventHandlers({
      scroll: (_, view) => {
        const scrollTop = view.scrollDOM.scrollTop;
        const lineBlock = view.lineBlockAtHeight(scrollTop);
        const lineNumber = view.state.doc.lineAt(lineBlock.from).number;
        setCurrentLine(lineNumber);

        const gutter = view.dom.querySelector(".cm-gutters");
        if (gutter) {
          setGutterWidth(gutter.getBoundingClientRect().width);
        }

        const cmLines = view.dom.querySelectorAll(".cm-line");
        const newCache: Record<number, string> = {};
        cmLines.forEach((el) => {
          const lineInfo = view.lineBlockAt(
            view.posAtDOM(el as HTMLElement, 0),
          );
          const ln = view.state.doc.lineAt(lineInfo.from).number;
          newCache[ln] = el.innerHTML;
        });
        setLineHtmlCache((prev) => ({ ...prev, ...newCache }));
      },
    });

    const compileKeymap = Prec.highest(
      keymap.of([
        {
          key: "Enter",
          run: (view) => {
            if (isSearchOpenRef.current) {
              findNext(view);
              return true;
            }
            compileRef.current();
            return true;
          },
        },
        {
          key: "Shift-Enter",
          run: (view) => {
            if (isSearchOpenRef.current) {
              findPrevious(view);
              return true;
            }
            return insertNewlineAndIndent(view);
          },
        },
        {
          key: "Mod-s",
          run: () => {
            const { setIsSaving } = useDocumentStore.getState();
            setIsSaving(true);
            setTimeout(() => setIsSaving(false), 1000);
            return true;
          },
        },
        {
          key: "Mod-f",
          run: () => {
            setIsSearchOpen(true);
            return true;
          },
        },
        {
          key: "Escape",
          run: () => {
            if (isSearchOpenRef.current) {
              setIsSearchOpen(false);
              return true;
            }
            return false;
          },
        },
      ]),
    );

    const state = EditorState.create({
      doc: currentContent,
      extensions: [
        compileKeymap,
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap]),
        latex({ enableAutocomplete: false, enableLinting: false }),
        createProjectAwareLatexLinter(),
        autocompletion({
          override: [latexCompletionSource, builtinLatexCompletionSource(true)],
          defaultKeymap: true,
          activateOnTyping: true,
          icons: true,
        }),
        themeCompartmentRef.current.of(
          buildDynamicEditorTheme(editorPaletteRef.current),
        ),
        typographyCompartmentRef.current.of(
          buildTypographyTheme(
            typographyRef.current.fontFamily,
            typographyRef.current.fontSize,
            typographyRef.current.lineHeight,
          ),
        ),
        search(),
        highlightSelectionMatches(),
        updateListener,
        scrollListener,
        EditorView.lineWrapping,
        scrollPastEnd(),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [
    activeFileId,
    isEditableText,
    setContent,
    setCursorPosition,
    setSelectionRange,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        themeCompartmentRef.current.reconfigure(
          buildDynamicEditorTheme(editorPalette),
        ),
        typographyCompartmentRef.current.reconfigure(
          buildTypographyTheme(
            editorFontCss,
            appearancePrefs.editorFontSize,
            appearancePrefs.editorLineHeight,
          ),
        ),
      ],
    });
  }, [
    editorPalette,
    editorFontCss,
    appearancePrefs.editorFontSize,
    appearancePrefs.editorLineHeight,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isEditableText) return;

    const content = activeFileContent ?? "";
    const currentContent = view.state.doc.toString();
    if (currentContent !== content) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
      });
    }
  }, [activeFileContent, isEditableText]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || jumpToPosition === null) return;

    view.dispatch({
      selection: { anchor: jumpToPosition },
      effects: EditorView.scrollIntoView(jumpToPosition, { y: "center" }),
    });
    view.focus();
    clearJumpRequest();
  }, [jumpToPosition, clearJumpRequest]);

  if (!isEditableText && activeFile) {
    if (isImageFile(activeFile)) {
      return (
        <div className="flex h-full flex-col bg-background">
          <EditorToolbar
            editorView={viewRef}
            fileType="image"
            imageScale={imageScale}
            onImageScaleChange={setImageScale}
          />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <ImagePreview file={activeFile} scale={imageScale} />
            <AIDrawer />
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col bg-background">
        <EditorToolbar editorView={viewRef} />
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-muted/30 p-8 text-center">
          <p className="font-medium text-sm">{activeFile.name}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Archivo binario incluido en la compilación (no editable como texto).
          </p>
          <AIDrawer />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <EditorToolbar
        editorView={viewRef}
        onForwardSync={() => {
          void handleForwardSync();
        }}
      />
      <PendingProposalsBanner />
      {isSearchOpen && (
        <SearchPanel
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onClose={() => {
            setIsSearchOpen(false);
            setSearchQuery("");
            viewRef.current?.focus();
          }}
          onFindNext={handleFindNext}
          onFindPrevious={handleFindPrevious}
          matchCount={matchCount}
          currentMatch={currentMatch}
        />
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {stickyLines.length > 0 && (
          <div
            className="absolute inset-x-0 top-0 z-10 border-border border-b shadow-md"
            style={{
              backgroundColor: editorPalette.editorBg,
              color: editorPalette.editorText,
              fontFamily: editorFontCss,
              fontSize: `${appearancePrefs.editorFontSize}px`,
              lineHeight: appearancePrefs.editorLineHeight,
            }}
          >
            {stickyLines.map((section) => (
              <div
                key={section.line}
                className="flex cursor-pointer items-center hover:bg-muted/40"
                onClick={() => {
                  const view = viewRef.current;
                  if (!view) return;
                  const line = view.state.doc.line(section.line);
                  view.dispatch({
                    selection: { anchor: line.from },
                    effects: EditorView.scrollIntoView(line.from, {
                      y: "start",
                    }),
                  });
                  view.focus();
                }}
              >
                <span
                  className="shrink-0 py-px text-right"
                  style={{
                    width: gutterWidth ? gutterWidth - 8 : 32,
                    backgroundColor: editorPalette.editorGutter,
                    color: editorPalette.mutedForeground,
                  }}
                >
                  {section.line}
                </span>
                {section.html ? (
                  <span
                    className="py-px pl-5.5"
                    dangerouslySetInnerHTML={{ __html: section.html }}
                  />
                ) : (
                  <span
                    className="py-px pl-5.5"
                    style={{ color: editorPalette.editorText }}
                  >
                    {section.content}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />
        <MathPreviewPopover
          content={activeFileContent ?? ""}
          cursorPosition={cursorPosition}
          visible={isEditableText}
        />
        <AIDrawer />
      </div>
      <LatexTools />
    </div>
  );
}
