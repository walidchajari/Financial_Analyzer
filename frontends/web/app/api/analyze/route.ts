import { NextRequest, NextResponse } from "next/server";
type OverridePayload = Record<string, number>;

type RequestPayload = {
  ticker: string;
  wacc?: number;
  terminalGrowth?: number;
  sector?: string;
  overrides?: OverridePayload;
};

const API_BASE =
  process.env.BACKEND_API_BASE || "http://127.0.0.1:8000";
const API_URL = `${API_BASE}/analyze`;

function sanitizePayload(body: unknown): RequestPayload {
  const source =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const ticker = (source?.ticker ?? "").toString().trim().toUpperCase();
  const wacc =
    typeof source?.wacc === "number"
      ? source.wacc
      : typeof source?.wacc === "string" && source.wacc.trim()
        ? Number(source.wacc)
        : undefined;
  const terminalGrowth =
    typeof source?.terminalGrowth === "number"
      ? source.terminalGrowth
      : typeof source?.terminalGrowth === "string" && source.terminalGrowth.trim()
        ? Number(source.terminalGrowth)
        : undefined;

  const overridesRaw = source?.overrides ?? {};
  const overrides: OverridePayload = {};
  if (overridesRaw && typeof overridesRaw === "object") {
    for (const [key, value] of Object.entries(overridesRaw)) {
      if (value === null || value === undefined || value === "") continue;
      const numeric =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? Number(value)
            : NaN;
      if (!Number.isNaN(numeric)) {
        overrides[key] = numeric;
      }
    }
  }

  return {
    ticker,
    wacc,
    terminalGrowth,
    sector:
      typeof source?.sector === "string" && source.sector.trim()
        ? source.sector.trim()
        : undefined,
    overrides: Object.keys(overrides).length ? overrides : undefined,
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const payload = sanitizePayload(body);
  if (!payload.ticker) {
    return NextResponse.json(
      { error: "Merci de fournir un ticker valide." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: json.detail || json.error || "Analyse impossible" },
        { status: response.status },
      );
    }
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de contacter l'API backend.",
      },
      { status: 500 },
    );
  }
}
