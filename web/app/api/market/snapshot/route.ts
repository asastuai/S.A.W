import { NextRequest, NextResponse } from "next/server";
import { getSnapshot } from "@/lib/market";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const asset = req.nextUrl.searchParams.get("asset") ?? "SOL";
  try {
    const snap = await getSnapshot(asset);
    return NextResponse.json(snap);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? String(e) },
      { status: 500 }
    );
  }
}
