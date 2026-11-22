import {
  compileLatex,
  gatherCompileResources,
  type LatexCompiler,
} from "@/lib/latex-compiler";
import { useDocumentStore } from "@/stores/document-store";

export async function compileActiveProject(
  overrideCompiler?: LatexCompiler,
): Promise<boolean> {
  const store = useDocumentStore.getState();
  if (store.isCompiling) return false;

  store.setIsCompiling(true);
  try {
    const latest = useDocumentStore.getState();
    const resources = gatherCompileResources(latest.files, latest.mainFileId);
    const data = await compileLatex(
      resources,
      overrideCompiler ?? latest.compiler,
    );
    useDocumentStore.getState().setPdfData(data);
    return true;
  } catch (error) {
    useDocumentStore
      .getState()
      .setCompileError(
        error instanceof Error ? error.message : "Error de compilación",
      );
    return false;
  } finally {
    useDocumentStore.getState().setIsCompiling(false);
  }
}
