import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.BACKEND_API_BASE || "http://127.0.0.1:8000";
const ALERT_URL = `${API_BASE}/alerts`;

export async function GET() {
  const response = await fetch(ALERT_URL, { cache: "no-store" });
  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const response = await fetch(ALERT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}
