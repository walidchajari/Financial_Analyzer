import { NextResponse } from "next/server";

const API_BASE =
  process.env.BACKEND_API_BASE || "http://127.0.0.1:8000";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const response = await fetch(`${API_BASE}/alerts/${params.id}`, {
    method: "DELETE",
  });
  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}
