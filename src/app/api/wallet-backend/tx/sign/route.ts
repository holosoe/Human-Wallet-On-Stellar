import { NextRequest, NextResponse } from "next/server";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

// Server-side private key (DO NOT expose via NEXT_PUBLIC)
const WALLET_SOURCE_PRIVATE_KEY = process.env.WALLET_SOURCE_PRIVATE_KEY;
const STELLAR_NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE;

export async function POST(request: NextRequest) {
  try {
    if (!WALLET_SOURCE_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "WALLET_SOURCE_PRIVATE_KEY is not set" },
        { status: 500 },
      );
    }
    if (!STELLAR_NETWORK_PASSPHRASE) {
      return NextResponse.json(
        { error: "STELLAR_NETWORK_PASSPHRASE is not set" },
        { status: 500 },
      );
    }

    const { transactionXdr } = (await request.json()) as {
      transactionXdr?: string;
    };

    if (!transactionXdr || typeof transactionXdr !== "string") {
      return NextResponse.json(
        { error: "Missing transactionXdr" },
        { status: 400 },
      );
    }

    // Parse the transaction with network passphrase, sign server-side, return XDR
    const tx = TransactionBuilder.fromXDR(
      transactionXdr,
      STELLAR_NETWORK_PASSPHRASE,
    );
    const signer = Keypair.fromSecret(WALLET_SOURCE_PRIVATE_KEY);
    tx.sign(signer);

    // Return XDR string (SDK's toXDR returns base64 string)
    return NextResponse.json({ transactionXdr: tx.toXDR() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
