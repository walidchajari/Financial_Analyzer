import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.BACKEND_API_BASE || "http://127.0.0.1:8000";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const response = await fetch(`${API_BASE}/portfolio/${id}`, {
    method: "DELETE",
  });
  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}
