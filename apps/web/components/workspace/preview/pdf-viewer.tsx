"use client";

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { LoaderIcon } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PAGE_GAP_PX = 16;
const OVERSCAN_PAGES = 2;

interface PdfViewerProps {
  data: Uint8Array;
  scale: number;
  jumpToPage?: { page: number; nonce: number } | null;
  onError?: (error: string) => void;
  onLoadSuccess?: (numPages: number) => void;
  onCurrentPageChange?: (page: number) => void;
  onScaleChange?: (scale: number) => void;
  onTextClick?: (text: string) => void;
}

export function PdfViewer({
  data,
  scale,
  jumpToPage,
  onError,
  onLoadSuccess,
  onCurrentPageChange,
  onScaleChange,
  onTextClick,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasSetInitialScale = useRef(false);
  const lastReportedPage = useRef(1);

  const [numPages, setNumPages] = useState(0);
  const [basePageSize, setBasePageSize] = useState({
    width: 612,
    height: 792,
  });
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 5 });

  const file = useMemo(() => {
    const pdfData =
      data instanceof Uint8Array ? data : new Uint8Array(Object.values(data));
    hasSetInitialScale.current = false;
    return { data: pdfData.slice() };
  }, [data]);

  const scaledWidth = Math.round(basePageSize.width * scale);
  const scaledHeight = Math.round(basePageSize.height * scale);
  const slotPitch = Math.max(1, scaledHeight + PAGE_GAP_PX);

  const updateVisibleRange = useCallback(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;

    const scrollTop = Math.max(0, container.scrollTop - PAGE_GAP_PX);
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
      const origW = page.originalWidth ?? page.width / scale;
      const origH = page.originalHeight ?? page.height / scale;
      if (origW > 0 && origH > 0) {
        setBasePageSize((prev) =>
          Math.abs(prev.width - origW) < 1 && Math.abs(prev.height - origH) < 1
            ? prev
            : { width: origW, height: origH },
        );
      }

      if (hasSetInitialScale.current) return;
      if (containerRef.current && onScaleChange && origW > 0) {
        hasSetInitialScale.current = true;
        const containerWidth = containerRef.current.clientWidth - 32;
        const fitScale = containerWidth / origW;
        onScaleChange(Math.max(0.25, Math.min(fitScale, 2)));
      }
    },
    [onScaleChange, scale],
  );

  const handleLoadError = useCallback(
    (error: Error) => {
      onError?.(error.message);
    },
    [onError],
  );

  const handleTextLayerClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onTextClick) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === "SPAN" &&
        target.closest(".react-pdf__Page__textContent")
      ) {
        const text = target.textContent?.trim();
        if (text && text.length > 2) {
          onTextClick(text);
        }
      }
    },
    [onTextClick],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onScaleChange) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        onScaleChange(Math.max(0.25, Math.min(4, scale + delta)));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [scale, onScaleChange]);

  return (
    <div
      ref={containerRef}
      onScroll={updateVisibleRange}
      className="flex-1 overflow-auto"
    >
      <div
        className="flex flex-col items-center gap-4 p-4"
        onClick={handleTextLayerClick}
      >
        <Document
          file={file}
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

            return (
              <div
                key={pageNum}
                data-page-number={pageNum}
                style={{ width: scaledWidth, height: scaledHeight }}
                className="flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-md"
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
              </div>
            );
          })}
        </Document>
      </div>
    </div>
  );
}
