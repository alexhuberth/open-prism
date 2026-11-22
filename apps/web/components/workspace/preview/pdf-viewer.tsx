"use client";

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { LoaderIcon } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PAGE_GAP_PX = 24;
const CONTAINER_PADDING_PX = 24;
const OVERSCAN_PAGES = 2;

export interface PdfSyncHighlight {
  page: number;
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  nonce: number;
}

interface PdfViewerProps {
  data: Uint8Array;
  scale: number;
  fitToWidth: boolean;
  jumpToPage?: { page: number; nonce: number } | null;
  syncHighlight?: PdfSyncHighlight | null;
  onError?: (error: string) => void;
  onLoadSuccess?: (numPages: number) => void;
  onCurrentPageChange?: (page: number) => void;
  onFitScaleChange?: (scale: number) => void;
  onManualScaleChange?: (scale: number) => void;
  onPageDoubleClick?: (hit: { page: number; xPt: number; yPt: number }) => void;
}

export function PdfViewer({
  data,
  scale,
  fitToWidth,
  jumpToPage,
  syncHighlight,
  onError,
  onLoadSuccess,
  onCurrentPageChange,
  onFitScaleChange,
  onManualScaleChange,
  onPageDoubleClick,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastReportedPage = useRef(1);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const prevFileRef = useRef<{
    bytes: Uint8Array;
    fileObj: { data: Uint8Array };
  } | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [basePageSize, setBasePageSize] = useState({
    width: 612,
    height: 792,
  });
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 5 });

  const file = useMemo(() => {
    const pdfData =
      data instanceof Uint8Array ? data : new Uint8Array(Object.values(data));
    const prev = prevFileRef.current;
    if (prev && prev.bytes.length === pdfData.length) {
      let identical = true;
      for (let i = 0; i < pdfData.length; i++) {
        if (prev.bytes[i] !== pdfData[i]) {
          identical = false;
          break;
        }
      }
      if (identical) {
        return prev.fileObj;
      }
    }
    const bytesCopy = pdfData.slice();
    const fileObj = { data: bytesCopy };
    prevFileRef.current = { bytes: bytesCopy, fileObj };
    return fileObj;
  }, [data]);

  const computeAndApplyFitScale = useCallback(() => {
    if (!fitToWidth || !containerRef.current || !onFitScaleChange) return;
    if (basePageSize.width <= 0) return;

    const availableWidth = Math.max(
      140,
      containerRef.current.clientWidth - CONTAINER_PADDING_PX,
    );
    const nextFit = Math.max(
      0.25,
      Math.min(4, availableWidth / basePageSize.width),
    );
    if (Math.abs(nextFit - scaleRef.current) > 0.008) {
      onFitScaleChange(nextFit);
    }
  }, [fitToWidth, basePageSize.width, onFitScaleChange]);

  useEffect(() => {
    if (!fitToWidth) return;
    computeAndApplyFitScale();

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      computeAndApplyFitScale();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitToWidth, computeAndApplyFitScale]);

  const scaledWidth = Math.round(basePageSize.width * scale);
  const scaledHeight = Math.round(basePageSize.height * scale);
  const slotPitch = Math.max(1, scaledHeight + PAGE_GAP_PX);

  const updateVisibleRange = useCallback(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;

    const scrollTop = Math.max(0, container.scrollTop - 12);
    const clientHeight = container.clientHeight || 800;

    const firstVisible = Math.max(1, Math.floor(scrollTop / slotPitch) + 1);
    const lastVisible = Math.min(
      numPages,
      Math.ceil((scrollTop + clientHeight) / slotPitch) + 1,
    );

    const start = Math.max(1, firstVisible - OVERSCAN_PAGES);
    const end = Math.min(
      numPages,
      Math.max(lastVisible + OVERSCAN_PAGES, start + 4),
    );

    setVisibleRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );

    const focalY = container.scrollTop + clientHeight * 0.35;
    const current = Math.min(
      numPages,
      Math.max(1, Math.floor(focalY / slotPitch) + 1),
    );
    if (current !== lastReportedPage.current) {
      lastReportedPage.current = current;
      onCurrentPageChange?.(current);
    }
  }, [numPages, slotPitch, onCurrentPageChange]);

  useEffect(() => {
    updateVisibleRange();
  }, [updateVisibleRange]);

  useEffect(() => {
    if (!jumpToPage || !containerRef.current || numPages === 0) return;
    const clampedPage = Math.min(numPages, Math.max(1, jumpToPage.page));
    const targetTop = Math.max(0, (clampedPage - 1) * slotPitch);
    containerRef.current.scrollTo({ top: targetTop, behavior: "smooth" });
    lastReportedPage.current = clampedPage;
    onCurrentPageChange?.(clampedPage);
  }, [jumpToPage, numPages, slotPitch, onCurrentPageChange]);

  useEffect(() => {
    if (!syncHighlight || !containerRef.current || numPages === 0) return;
    const clampedPage = Math.min(numPages, Math.max(1, syncHighlight.page));
    const container = containerRef.current;
    const pageTop = (clampedPage - 1) * slotPitch;
    const targetTop = Math.max(
      0,
      pageTop + syncHighlight.yPt * scale - container.clientHeight * 0.35,
    );
    container.scrollTo({ top: targetTop, behavior: "smooth" });
    lastReportedPage.current = clampedPage;
    onCurrentPageChange?.(clampedPage);
  }, [syncHighlight, numPages, slotPitch, scale, onCurrentPageChange]);

  const handleLoadSuccess = useCallback(
    ({ numPages: pages }: { numPages: number }) => {
      setNumPages(pages);
      lastReportedPage.current = 1;
      onLoadSuccess?.(pages);
      onCurrentPageChange?.(1);
    },
    [onLoadSuccess, onCurrentPageChange],
  );

  const handlePageLoadSuccess = useCallback(
    (page: {
      width: number;
      height: number;
      originalWidth?: number;
      originalHeight?: number;
    }) => {
      const origW = page.originalWidth ?? page.width / scaleRef.current;
      const origH = page.originalHeight ?? page.height / scaleRef.current;
      if (origW > 0 && origH > 0) {
        setBasePageSize((prev) =>
          Math.abs(prev.width - origW) < 1 && Math.abs(prev.height - origH) < 1
            ? prev
            : { width: origW, height: origH },
        );
      }
    },
    [],
  );

  const handleLoadError = useCallback(
    (error: Error) => {
      onError?.(error.message);
    },
    [onError],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onManualScaleChange) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        onManualScaleChange(
          Math.max(0.25, Math.min(4, scaleRef.current + delta)),
        );
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [onManualScaleChange]);

  return (
    <div
      ref={containerRef}
      onScroll={updateVisibleRange}
      className="flex-1 overflow-auto bg-zinc-200/70 dark:bg-zinc-950/60"
    >
      <div className="flex flex-col items-center p-3">
        <Document
          file={file}
          className="flex flex-col items-center"
          onLoadSuccess={handleLoadSuccess}
          onLoadError={handleLoadError}
          loading={
            <div className="flex items-center gap-2 text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              Cargando PDF...
            </div>
          }
        >
          {Array.from({ length: numPages }, (_, i) => {
            const pageNum = i + 1;
            const shouldRender =
              pageNum >= visibleRange.start && pageNum <= visibleRange.end;
            const hasHighlight = syncHighlight?.page === pageNum;

            return (
              <div key={pageNum} className="flex flex-col items-center">
                <div
                  data-page-number={pageNum}
                  style={{ width: scaledWidth, height: scaledHeight }}
                  onDoubleClick={(e) => {
                    if (!onPageDoubleClick) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const xPt = (e.clientX - rect.left) / scale;
                    const yPt = (e.clientY - rect.top) / scale;
                    onPageDoubleClick({ page: pageNum, xPt, yPt });
                  }}
                  title="Doble clic para saltar a esta línea en el código (SyncTeX)"
                  className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-slate-300/90 bg-white shadow-md dark:border-zinc-700/80"
                >
                  {shouldRender ? (
                    <Page
                      pageNumber={pageNum}
                      scale={scale}
                      onLoadSuccess={
                        pageNum === 1 ? handlePageLoadSuccess : undefined
                      }
                      loading={
                        <span className="text-muted-foreground text-xs">
                          Página {pageNum}
                        </span>
                      }
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Página {pageNum}
                    </span>
                  )}
                  {hasHighlight && syncHighlight && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute animate-pulse rounded border border-amber-500/80 bg-amber-400/25 shadow-sm"
                      style={{
                        left: Math.max(0, syncHighlight.xPt * scale - 4),
                        top: Math.max(0, syncHighlight.yPt * scale - 2),
                        width: Math.max(36, syncHighlight.widthPt * scale + 8),
                        height: Math.max(
                          16,
                          syncHighlight.heightPt * scale + 6,
                        ),
                      }}
                    />
                  )}
                </div>

                {pageNum < numPages && (
                  <div
                    aria-hidden="true"
                    data-page-divider={pageNum}
                    style={{ height: PAGE_GAP_PX, width: scaledWidth }}
                    className="flex shrink-0 select-none items-center gap-2.5 px-1"
                  >
                    <div className="h-px flex-1 bg-slate-400/75 dark:bg-zinc-600/85" />
                    <span className="font-medium text-[10px] text-slate-600 tracking-wide dark:text-zinc-400">
                      Pág. {pageNum} / {pageNum + 1}
                    </span>
                    <div className="h-px flex-1 bg-slate-400/75 dark:bg-zinc-600/85" />
                  </div>
                )}
              </div>
            );
          })}
        </Document>
      </div>
    </div>
  );
}
