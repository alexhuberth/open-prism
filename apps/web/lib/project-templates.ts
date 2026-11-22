import type { LatexCompiler } from "@/lib/latex-compiler";
import type { ProjectFile } from "@/lib/project-files";

export type ProjectTemplateId =
  | "showcase"
  | "article"
  | "thesis"
  | "beamer"
  | "blank";

export interface ProjectTemplate {
  id: ProjectTemplateId;
  name: string;
  description: string;
  compiler: LatexCompiler;
  mainFileName: string;
  files: Omit<ProjectFile, "id">[];
}

export const SHOWCASE_TEX_CONTENT = `\\documentclass[11pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{tikz-cd}
\\usepackage{multicol}

\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{1\\baselineskip}

\\begin{document}

\\section*{¿Qué es Open-Prism?}

\\textbf{Open-Prism} es un editor de \\LaTeX{} impulsado por IA para redactar documentos científicos. Incluye un asistente integrado para ayudarte a escribir y editar texto, desarrollar ideas y dar formato a tus proyectos.

\\section*{Funcionalidades}

\\begin{multicols}{2}
Open-Prism integra la IA directamente en el editor con acceso a tu proyecto, así que puedes pedirle cosas como:

\`\`Agrega la transformada de Laplace de $t\\cos(at)$ en la introducción.''
\\[
  \\mathcal{L}\\left\\{ t \\cos(a t) \\right\\} = \\frac{ s^2 - a^2 }{ (s^2 + a^2)^2 }
\\]

\`\`Agrega una tabla de 4\\,$\\times$\\,4 en la sección de resultados.''
\\begin{center}
\\resizebox{0.5\\linewidth}{!}{%
\\begin{tabular}{|c|c|c|c|}
  \\hline
  1 & 2 & 3 & 4 \\\\
  \\hline
  5 & 6 & 7 & 8 \\\\
  \\hline
  9 & 10 & 11 & 12 \\\\
  \\hline
  13 & 14 & 15 & 16 \\\\
  \\hline
\\end{tabular}%
}
\\end{center}

\`\`Por favor revisa esta sección, señala errores o vacíos lógicos y sugiere mejoras de claridad.''

\`\`¿Me falta algún corolario o implicación del Teorema 3.1? ¿Todas las cotas son ajustadas o alguna se puede relajar?''

\\columnbreak

\`\`Redacta un resumen ejecutivo basado en el resto del artículo.''

\`\`Agrega referencias a mi artículo y sugiere trabajos relacionados que pueda haber pasado por alto.''

\`\`Convierte este diagrama dibujado a mano en código \\LaTeX{}.''
\\par\\noindent
\\begin{minipage}[t]{0.49\\linewidth}
  \\vspace{0pt}
  \\centering
  \\includegraphics[width=\\linewidth]{hand-write.jpg}
\\end{minipage}\\hfill
\\begin{minipage}[t]{0.49\\linewidth}
  \\vspace{0pt}
  \\centering
  \\resizebox{\\linewidth}{!}{$
    \\begin{tikzcd}[row sep=2em, column sep=1.5em, ampersand replacement=\\&]
      E
        \\arrow[dr, "e"']
        \\arrow[drr, "p_2"]
        \\arrow[ddr, "p_1"']
      \\& \\& \\\\
      \\& A \\times B \\arrow[r, "\\pi_2"'] \\arrow[d, "\\pi_1"] \\& B \\arrow[d, "g"] \\\\
      \\& A \\arrow[r, "f"'] \\& C
    \\end{tikzcd}
  $}
\\end{minipage}
\\par

\`\`Completa todas las dependencias faltantes en mi proyecto.''

\`\`Genera un resumen de 200 palabras para público general.''

\`\`Crea una presentación en Beamer con cada diapositiva en un archivo separado.''
\\end{multicols}

\\section*{Primeros pasos}

Presiona \\textbf{Enter} para compilar tu documento. Usa \\textbf{Shift+Enter} para insertar un salto de línea. El panel del asistente de IA en la parte inferior del editor está listo para ayudarte con cualquier duda o tarea en \\LaTeX{}.

\\end{document}
`;

const ARTICLE_TEX_CONTENT = `\\documentclass[11pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Título de tu artículo científico}
\\author{Tu Nombre \\\\ Institución}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Resumen breve del objetivo, la metodología y los resultados principales del trabajo.
\\end{abstract}

\\section{Introducción}
Presenta el contexto del problema y las contribuciones principales. Puedes citar bibliografía como \\cite{einstein1905}.

\\section{Metodología}
Describe el modelo matemático o experimento:
\\begin{equation}
  E = mc^2
\\end{equation}

\\section{Conclusiones}
Resume los hallazgos y el trabajo futuro.

\\bibliographystyle{plain}
\\bibliography{referencias}

\\end{document}
`;

const ARTICLE_BIB_CONTENT = `@article{einstein1905,
  author  = {Albert Einstein},
  title   = {Zur Elektrodynamik bewegter K{\\"o}rper},
  journal = {Annalen der Physik},
  year    = {1905},
  volume  = {322},
  number  = {10},
  pages   = {891--921}
}
`;

const BEAMER_TEX_CONTENT = `\\documentclass{beamer}
\\usepackage[T1]{fontenc}
\\usetheme{Madrid}

\\title{Título de la presentación}
\\subtitle{Subtítulo o evento}
\\author{Tu Nombre}
\\date{\\today}

\\begin{document}

\\begin{frame}
  \\titlepage
\\end{frame}

\\begin{frame}{Agenda}
  \\tableofcontents
\\end{frame}

\\section{Introducción}
\\begin{frame}{Introducción}
  \\begin{itemize}
    \\item Primer punto clave
    \\item Segundo punto clave
    \\item Ecuación destacada: $a^2 + b^2 = c^2$
  \\end{itemize}
\\end{frame}

\\section{Conclusiones}
\\begin{frame}{Conclusiones}
  Gracias por su atención.
\\end{frame}

\\end{document}
`;

const BLANK_TEX_CONTENT = `\\documentclass[11pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath}

\\begin{document}

\\section{Introducción}

Escribe aquí tu documento en \\LaTeX{}.

\\end{document}
`;

const THESIS_MAIN_CONTENT = `\\documentclass[12pt,oneside]{book}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[spanish,es-tabla]{babel}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{\\textbf{Título de tu Tesis o Libro}}
\\author{Tu Nombre Completo}
\\date{\\today}

\\begin{document}

\\frontmatter
\\maketitle

\\tableofcontents
\\listoffigures
\\listoftables

\\mainmatter
\\include{capitulos/01_introduccion}
\\include{capitulos/02_marco_teorico}
\\include{capitulos/03_conclusiones}

\\backmatter
\\bibliographystyle{plain}
\\bibliography{referencias}

\\end{document}
`;

const THESIS_CH1_CONTENT = `\\chapter{Introducción}
\\label{cap:introduccion}

Presenta el tema principal del libro o tesis, la motivación del estudio y el alcance general de la obra. Puedes referenciar bibliografía como \\cite{einstein1905}.

\\section{Planteamiento del problema}
Describe la problemática central y las preguntas de investigación.

\\section{Objetivos}
\\begin{itemize}
  \\item Objetivo general del trabajo.
  \\item Objetivos específicos por capítulo.
\\end{itemize}
`;

const THESIS_CH2_CONTENT = `\\chapter{Marco Teórico}
\\label{cap:marco}

Expón los fundamentos matemáticos, conceptuales o históricos sobre los que se construye tu trabajo.

\\section{Fundamentos}
Por ejemplo, una relación clave en el capítulo~\\ref{cap:marco}:
\\begin{equation}
  E = mc^2
\\end{equation}
`;

const THESIS_CH3_CONTENT = `\\chapter{Conclusiones}
\\label{cap:conclusiones}

Sintetiza los hallazgos principales obtenidos a lo largo de los capítulos anteriores.

\\section{Trabajo futuro}
Propón líneas abiertas de investigación para futuras ediciones o estudios.
`;

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "blank",
    name: "Documento en blanco",
    description: "Plantilla mínima lista para empezar desde cero",
    compiler: "pdflatex",
    mainFileName: "main.tex",
    files: [{ name: "main.tex", type: "tex", content: BLANK_TEX_CONTENT }],
  },
  {
    id: "article",
    name: "Artículo científico",
    description: "Incluye resumen, secciones, ecuaciones y referencias.bib",
    compiler: "pdflatex",
    mainFileName: "main.tex",
    files: [
      { name: "main.tex", type: "tex", content: ARTICLE_TEX_CONTENT },
      { name: "referencias.bib", type: "text", content: ARTICLE_BIB_CONTENT },
    ],
  },
  {
    id: "thesis",
    name: "Tesis / Libro modular",
    description:
      "Estructura book con capítulos separados, índice automático y babel en español",
    compiler: "pdflatex",
    mainFileName: "main.tex",
    files: [
      { name: "main.tex", type: "tex", content: THESIS_MAIN_CONTENT },
      {
        name: "capitulos/01_introduccion.tex",
        type: "tex",
        content: THESIS_CH1_CONTENT,
      },
      {
        name: "capitulos/02_marco_teorico.tex",
        type: "tex",
        content: THESIS_CH2_CONTENT,
      },
      {
        name: "capitulos/03_conclusiones.tex",
        type: "tex",
        content: THESIS_CH3_CONTENT,
      },
      { name: "referencias.bib", type: "text", content: ARTICLE_BIB_CONTENT },
    ],
  },
  {
    id: "beamer",
    name: "Presentación Beamer",
    description: "Diapositivas académicas con tema Madrid",
    compiler: "pdflatex",
    mainFileName: "presentacion.tex",
    files: [
      { name: "presentacion.tex", type: "tex", content: BEAMER_TEX_CONTENT },
    ],
  },
  {
    id: "showcase",
    name: "Ejemplo Open-Prism",
    description: "Documento demostrativo con tabla y diagrama tikz-cd",
    compiler: "pdflatex",
    mainFileName: "document.tex",
    files: [
      { name: "document.tex", type: "tex", content: SHOWCASE_TEX_CONTENT },
    ],
  },
];

export function getProjectTemplate(id: ProjectTemplateId): ProjectTemplate {
  return PROJECT_TEMPLATES.find((t) => t.id === id) ?? PROJECT_TEMPLATES[0];
}
