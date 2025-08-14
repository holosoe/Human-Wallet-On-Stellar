import { NextRequest, NextResponse } from "next/server";
import { buildAuthHeaderServer } from "@/lib/walletBackendAuth";

const BASE_URL = process.env.WALLET_BACKEND_URL!;

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();
    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "Missing address" },
        { status: 400 },
      );
    }

    const encoded = encodeURIComponent(address);
    const path = `/accounts/${encoded}`;

    const header = await buildAuthHeaderServer("DELETE", path, "");
    if (!header) {
      return NextResponse.json(
        { error: "Failed to generate JWT header" },
        { status: 500 },
      );
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: {
        Authorization: header,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {}
      return NextResponse.json(
        { error: "wallet-backend error", status: res.status, details: json || text },
        { status: res.status },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
