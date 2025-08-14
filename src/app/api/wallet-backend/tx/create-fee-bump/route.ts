import { NextRequest, NextResponse } from "next/server";
import { buildAuthHeaderServer } from "@/lib/walletBackendAuth";

const BASE_URL = process.env.WALLET_BACKEND_URL!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const path = "/tx/create-fee-bump";

    const header = await buildAuthHeaderServer("POST", path, body);

    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: header,
      },
      body,
    });

    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch (e) {
      return NextResponse.json(
        { error: `wallet-backend non-JSON response (${res.status})`, body: text },
        { status: 502 },
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: "wallet-backend error", status: res.status, details: json },
        { status: res.status },
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
