import {
  compileLatex,
  gatherCompileResources,
  type LatexCompiler,
} from "@/lib/latex-compiler";
import { saveProjectPdf } from "@/lib/storage/indexeddb-storage";
import { useDocumentStore } from "@/stores/document-store";

export async function compileActiveProject(
  overrideCompiler?: LatexCompiler,
): Promise<boolean> {
  const store = useDocumentStore.getState();
  if (store.isCompiling) return false;

  const compileProjectId = store.activeProjectId;
  store.setIsCompiling(true);
  try {
    const latest = useDocumentStore.getState();
    const resources = gatherCompileResources(latest.files, latest.mainFileId);
    const data = await compileLatex(
      resources,
      overrideCompiler ?? latest.compiler,
    );

    if (useDocumentStore.getState().activeProjectId === compileProjectId) {
      useDocumentStore.getState().setPdfData(data);
    } else if (compileProjectId) {
      saveProjectPdf(compileProjectId, data).catch(() => {});
    }
    return true;
  } catch (error) {
    if (useDocumentStore.getState().activeProjectId === compileProjectId) {
      useDocumentStore
        .getState()
        .setCompileError(
          error instanceof Error ? error.message : "Error de compilación",
        );
    }
    return false;
  } finally {
    useDocumentStore.getState().setIsCompiling(false);
  }
}
