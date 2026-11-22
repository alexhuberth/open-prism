import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      buildId?: string;
      direction?: "inverse" | "forward";
      page?: number;
      xPt?: number;
      yPt?: number;
      file?: string;
      line?: number;
    };

    const buildId = body.buildId?.trim();
    if (!buildId || !/^[a-zA-Z0-9-]+$/.test(buildId)) {
      return NextResponse.json(
        { error: "Identificador de compilación inválido" },
        { status: 400 },
      );
    }

    const latexApiUrl = process.env.LATEX_API_URL || "http://localhost:3001";
    const response = await fetch(`${latexApiUrl}/builds/${buildId}/synctex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: body.direction,
        page: body.page,
        xPt: body.xPt,
        yPt: body.yPt,
        file: body.file,
        line: body.line,
      }),
    });

    const rawText = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      parsed = { error: rawText };
    }

    return NextResponse.json(parsed, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar SyncTeX",
      },
      { status: 500 },
    );
  }
}
