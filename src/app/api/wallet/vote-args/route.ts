import { Address, xdr } from "@stellar/stellar-sdk";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/wallet/vote-args
 *
 * Serializes the vote contract arguments (contractAddress ScAddress, isChicken bool)
 * into base64-encoded XDR ScVal strings so the mobile client (which cannot run
 * @stellar/stellar-sdk) can hand them to /api/wallet/execute.
 *
 * Body: { contractAddress: string, isChicken: boolean }
 * Response: { encodedArgs: string[], voteContractId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { contractAddress, isChicken } = await request.json();

    if (!contractAddress || typeof isChicken !== "boolean") {
      return NextResponse.json(
        { error: "contractAddress (string) and isChicken (boolean) are required" },
        { status: 400 },
      );
    }

    const voteContractId = process.env.NEXT_PUBLIC_STELLAR_VOTE_CONTRACT_ID;
    if (!voteContractId) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_STELLAR_VOTE_CONTRACT_ID is not configured" },
        { status: 500 },
      );
    }

    // Encode the two ScVal arguments: voter (ScAddress) and isChicken (bool)
    const encodedArgs = [
      Address.fromString(contractAddress).toScVal().toXDR("base64"),
      xdr.ScVal.scvBool(isChicken).toXDR("base64"),
    ];

    return NextResponse.json({ success: true, encodedArgs, voteContractId });
  } catch (error) {
    console.error("vote-args error:", error);
    return NextResponse.json(
      {
        error: "Failed to encode vote arguments",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
