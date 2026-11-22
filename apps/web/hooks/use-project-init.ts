"use client";

import { useEffect } from "react";
import { useDocumentStore } from "@/stores/document-store";

const DEFAULT_IMAGE_FILE = {
  name: "hand-write.jpg",
  path: "/hand-write.jpg",
};

async function loadImageAsDataUrl(path: string): Promise<string> {
  const res = await fetch(path);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useProjectInit() {
  const activeProjectId = useDocumentStore((s) => s.activeProjectId);
  const files = useDocumentStore((s) => s.files);
  const addFile = useDocumentStore((s) => s.addFile);
  const hydrated = useDocumentStore((s) => s.hydrated);
  const initialized = useDocumentStore((s) => s.initialized);
  const setInitialized = useDocumentStore((s) => s.setInitialized);

  useEffect(() => {
    if (!hydrated || initialized) return;

    const referencesShowcaseImage = files.some((f) =>
      f.content?.includes("hand-write.jpg"),
    );

    if (!referencesShowcaseImage) {
      setInitialized();
      return;
    }

    const existingImage = files.find(
      (f) => f.type === "image" && f.name === DEFAULT_IMAGE_FILE.name,
    );

    if (existingImage?.dataUrl) {
      setInitialized();
      return;
    }

    loadImageAsDataUrl(DEFAULT_IMAGE_FILE.path)
      .then((dataUrl) => {
        if (useDocumentStore.getState().activeProjectId !== activeProjectId) {
          setInitialized();
          return;
        }
        if (existingImage) {
          useDocumentStore.getState().addFile(
            {
              name: DEFAULT_IMAGE_FILE.name,
              type: "image",
              dataUrl,
            },
            { activate: false },
          );
        } else {
          addFile(
            {
              name: DEFAULT_IMAGE_FILE.name,
              type: "image",
              dataUrl,
            },
            { activate: false },
          );
        }
        setInitialized();
      })
      .catch((err) => {
        console.error("Failed to load default image:", err);
        setInitialized();
      });
  }, [activeProjectId, files, addFile, hydrated, initialized, setInitialized]);
}
