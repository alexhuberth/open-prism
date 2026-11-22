import { NextResponse } from "next/server";

function sanitizeBibKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "") || "ref";
}

function escapeBibText(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[{}]/g, "");
}

function parseDoi(input: string): string | null {
  const trimmed = input
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  return /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(trimmed) ? trimmed : null;
}

function parseArxivId(input: string): string | null {
  const trimmed = input
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, "")
    .replace(/\.pdf$/i, "")
    .replace(/^arxiv:\s*/i, "");
  return /^(?:\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[a-z-]+)?\/\d{7}(?:v\d+)?)$/i.test(
    trimmed,
  )
    ? trimmed
    : null;
}

function extractXmlTag(xml: string, tag: string): string {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return match ? match[1].trim() : "";
}

async function fetchDoiBibtex(doi: string): Promise<string> {
  const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}/transform/application/x-bibtex`;
  const res = await fetch(crossrefUrl, {
    headers: {
      "User-Agent": "Open-Prism/1.0 (mailto:open-prism@example.com)",
    },
  });

  if (res.ok) {
    const text = (await res.text()).trim();
    if (text.startsWith("@")) return text;
  }

  const doiOrgRes = await fetch(`https://doi.org/${encodeURIComponent(doi)}`, {
    headers: { Accept: "application/x-bibtex" },
  });
  if (doiOrgRes.ok) {
    const text = (await doiOrgRes.text()).trim();
    if (text.startsWith("@")) return text;
  }

  throw new Error("No se encontró una entrada BibTeX para ese DOI.");
}

async function fetchArxivBibtex(arxivId: string): Promise<string> {
  const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) {
    throw new Error("No se pudo consultar arXiv en este momento.");
  }

  const xml = await res.text();
  const entry = extractXmlTag(xml, "entry");
  if (!entry) {
    throw new Error("No se encontró ningún artículo en arXiv con ese ID.");
  }

  const rawTitle = escapeBibText(extractXmlTag(entry, "title"));
  if (!rawTitle) {
    throw new Error("No se encontró ningún artículo en arXiv con ese ID.");
  }

  const published = extractXmlTag(entry, "published");
  const yearMatch = published.match(/^(\d{4})/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

  const authorMatches = Array.from(
    entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/gi),
  );
  const authors = authorMatches.map((m) => escapeBibText(m[1]));
  const firstSurname =
    authors[0]?.trim().split(/\s+/).pop()?.toLowerCase() ?? "arxiv";
  const key = sanitizeBibKey(`${firstSurname}${year}arxiv`);

  const baseId = arxivId.replace(/v\d+$/i, "");

  return [
    `@article{${key},`,
    `  author        = {${authors.join(" and ") || "Desconocido"}},`,
    `  title         = {{${rawTitle}}},`,
    `  journal       = {arXiv preprint arXiv:${baseId}},`,
    `  year          = {${year}},`,
    `  eprint        = {${baseId}},`,
    `  archivePrefix = {arXiv},`,
    `  url           = {https://arxiv.org/abs/${baseId}}`,
    `}`,
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { query?: string };
    const query = body.query?.trim() ?? "";
    if (!query) {
      return NextResponse.json(
        { error: "Ingresa un DOI o un identificador de arXiv." },
        { status: 400 },
      );
    }

    const doi = parseDoi(query);
    if (doi) {
      const bibtex = await fetchDoiBibtex(doi);
      return NextResponse.json({ source: "doi", identifier: doi, bibtex });
    }

    const arxivId = parseArxivId(query);
    if (arxivId) {
      const bibtex = await fetchArxivBibtex(arxivId);
      return NextResponse.json({
        source: "arxiv",
        identifier: arxivId,
        bibtex,
      });
    }

    return NextResponse.json(
      {
        error:
          "Formato no reconocido. Ingresa un DOI (ej. 10.1038/nature14539) o un ID/enlace de arXiv (ej. 1706.03762).",
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo importar la referencia.",
      },
      { status: 500 },
    );
  }
}
