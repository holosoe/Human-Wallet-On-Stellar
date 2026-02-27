import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { beneficiaries, disbursements } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { ethers } from "ethers";
import { buildTransaction } from "@/lib/tx_build";
import { sendTransaction } from "@/lib/tx_send";
import { Address, xdr } from "@stellar/stellar-sdk";

export async function POST(request: NextRequest) {
  try {
    const { disbursementId, signature } = await request.json();

    if (!disbursementId || !signature) {
      return NextResponse.json(
        { error: "disbursementId and signature are required" },
        { status: 400 },
      );
    }

    // 1. Fetch disbursement & beneficiary info
    const disbursementArray = await db
      .select({
        disbursement: disbursements,
        beneficiary: beneficiaries,
      })
      .from(disbursements)
      .innerJoin(beneficiaries, eq(disbursements.beneficiaryId, beneficiaries.id))
      .where(eq(disbursements.id, disbursementId))
      .limit(1);

    if (disbursementArray.length === 0) {
      return NextResponse.json({ error: "Disbursement not found" }, { status: 404 });
    }

    const { disbursement, beneficiary } = disbursementArray[0];

    // Check if already redeemed
    if (disbursement.txHash) {
      return NextResponse.json({ error: "Disbursement already redeemed" }, { status: 400 });
    }

    if (!beneficiary.stellarAddress) {
      return NextResponse.json({ error: "Beneficiary Wallet not deployed on Stellar yet" }, { status: 400 });
    }

    // 2. Recover signer from signature.
    // Frontend hex-encodes the message ("0x" + hex) before personal_sign — this is equivalent
    // to ethers.hashMessage(rawString) since personal_sign hashes the underlying bytes.
    const message = `Redeem disbursement ${disbursementId} for amount ${disbursement.amount} XLM`;
    const messageHash = ethers.hashMessage(message);
    const recoveredAddress = ethers.recoverAddress(messageHash, signature);

    // Validate signature
    if (recoveredAddress.toLowerCase() !== beneficiary.ethAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "Invalid signature: signer does not match beneficiary address" },
        { status: 401 }
      );
    }

    // 3. Send transaction on Stellar Testnet
    // We send from WALLET_SOURCE_PRIVATE_KEY to beneficiary.stellarAddress
    const amountInStroops = Math.floor(Number(disbursement.amount) * 1e7);
    
    // NOTE: This uses the native XLM asset transfer. If using a specific token, this must use a contract call.
    // Standard asset transfer
    let txHashToSave = "";

    try {
      // Use the native token contract to transfer XLM.
      // This correctly handles C... Soroban contract addresses as destinations.
      const networkPassphrase = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE;
      const isMainnet = networkPassphrase === "Public Global Stellar Network ; September 2015";
      const NATIVE_TOKEN_CONTRACT = isMainnet
        ? "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"
        : "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

      const { transaction } = await buildTransaction(
        NATIVE_TOKEN_CONTRACT,
        "transfer",
        [
          Address.fromString(process.env.NEXT_PUBLIC_WALLET_SOURCE_PUBLIC_KEY!).toScVal(),
          Address.fromString(beneficiary.stellarAddress).toScVal(),
          xdr.ScVal.scvI128(new xdr.Int128Parts({
            hi: xdr.Int64.fromString("0"),
            lo: xdr.Uint64.fromString(amountInStroops.toString()),
          })),
        ],
      );

      if (!transaction) {
        throw new Error("Failed to build payment transaction");
      }

      const result = await sendTransaction(transaction);
      if (!result) throw new Error("Transaction returned no result");
      txHashToSave = result.hash;
      console.log(`Disbursement tx successful: ${txHashToSave}`);
    } catch (err: unknown) {
      console.error("Stellar transaction failed:", err);
      const details = err instanceof Error ? err.message : JSON.stringify(err, Object.getOwnPropertyNames(err));
      return NextResponse.json({ error: "Stellar transaction failed", details }, { status: 500 });
    }

    // 4. Record txHash in neon DB
    await db
      .update(disbursements)
      .set({ txHash: txHashToSave })
      .where(eq(disbursements.id, disbursementId));

    return NextResponse.json({
      success: true,
      transactionHash: txHashToSave,
      message: "Disbursement redeemed successfully",
    });
  } catch (error: unknown) {
    console.error("Redeem error:", error);
    return NextResponse.json(
      {
        error: "Redemption failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
