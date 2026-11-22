import {
  CompileFailureError,
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
    const result = await compileLatex(
      resources,
      overrideCompiler ?? latest.compiler,
    );

    if (useDocumentStore.getState().activeProjectId === compileProjectId) {
      const next = useDocumentStore.getState();
      next.setPdfData(result.pdf);
      next.setCompileDiagnostics({
        buildId: result.buildId,
        warnings: result.warnings,
        warningCount: result.warningCount,
        fullLog: null,
      });
    } else if (compileProjectId) {
      saveProjectPdf(compileProjectId, result.pdf).catch(() => {});
    }
    return true;
  } catch (error) {
    if (useDocumentStore.getState().activeProjectId === compileProjectId) {
      const next = useDocumentStore.getState();
      next.setCompileError(
        error instanceof Error ? error.message : "Error de compilación",
      );
      if (error instanceof CompileFailureError) {
        next.setCompileDiagnostics({
          buildId: error.buildId,
          warnings: [],
          warningCount: 0,
          fullLog: error.fullLog,
        });
      }
    }
    return false;
  } finally {
    useDocumentStore.getState().setIsCompiling(false);
  }
}
