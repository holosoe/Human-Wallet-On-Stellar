import { getContractBalance } from "@/lib/contract";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/wallet/balance?contractAddress=C...
 * Returns the native XLM balance of a Stellar smart-contract wallet.
 *
 * The balance is read directly from the Soroban RPC ledger, bypassing Horizon,
 * so it works for contract accounts that have no classic Stellar account record.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractAddress = searchParams.get("contractAddress");

    if (!contractAddress) {
      return NextResponse.json(
        { error: "contractAddress query parameter is required" },
        { status: 400 },
      );
    }

    if (!contractAddress.startsWith("C") || contractAddress.length < 50) {
      return NextResponse.json(
        { error: "contractAddress must be a valid Stellar contract address (starts with C)" },
        { status: 400 },
      );
    }

    const xlmBalance = await getContractBalance(contractAddress);

    return NextResponse.json({
      success: true,
      contractAddress,
      xlmBalance, // already converted to XLM (not stroops)
    });
  } catch (error) {
    console.error("Balance fetch error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch balance",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
