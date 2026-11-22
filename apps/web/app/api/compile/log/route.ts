import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const buildId = searchParams.get("id")?.trim();

  if (!buildId || !/^[a-zA-Z0-9-]+$/.test(buildId)) {
    return NextResponse.json(
      { error: "Identificador de compilación inválido" },
      { status: 400 },
    );
  }

  try {
    const latexApiUrl = process.env.LATEX_API_URL || "http://localhost:3001";
    const response = await fetch(`${latexApiUrl}/builds/${buildId}/log`, {
      cache: "no-store",
    });
    const rawText = await response.text();
    let parsed: { log?: string; error?: string } = {};
    try {
      parsed = JSON.parse(rawText) as { log?: string; error?: string };
    } catch {
      parsed = { error: rawText };
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: parsed.error || "No se pudo obtener el log de compilación" },
        { status: response.status },
      );
    }

    return NextResponse.json({ buildId, log: parsed.log ?? "" });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener el log de compilación",
      },
      { status: 500 },
    );
  }
}
