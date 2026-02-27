import {
    hash,
    Operation,
    SorobanRpc,
    Transaction,
    TransactionBuilder,
    xdr,
} from "@stellar/stellar-sdk";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/wallet/execute
 *
 * A general-purpose endpoint that:
 *  1. Builds & simulates a Soroban contract-invocation transaction on behalf of
 *     the server-side source account (NEXT_PUBLIC_WALLET_SOURCE_PUBLIC_KEY).
 *  2. Returns the auth hash that the client (mobile wallet) must sign with their
 *     ECDSA key via `personal_sign`.
 *  3. Once the client POSTs back the signed auth entry, assembles the transaction,
 *     has it server-signed, wraps it in a fee-bump, and submits to Horizon.
 *
 * Two-phase API:
 *  Phase 1 – POST { action: "prepare", contractId, functionName, encodedArgs }
 *             → { authHash, encodedAuthEntry, latestLedger }
 *
 *  Phase 2 – POST { action: "submit", encodedAuthEntry, signature, contractAddress }
 *             → { txHash }
 *
 * `encodedArgs` is a JSON array of base64-encoded XDR ScVal strings.
 * `encodedAuthEntry` is a base64-encoded XDR SorobanAuthorizationEntry (returned in phase 1).
 * `signature` is the 0x-prefixed 65-byte ECDSA signature from the mobile wallet.
 */

const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL!;
const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE!;
const SOURCE_PUBLIC_KEY = process.env.NEXT_PUBLIC_WALLET_SOURCE_PUBLIC_KEY!;
const HORIZON_URL = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL!;

interface PrepareBody {
  contractId: string;
  functionName: string;
  encodedArgs?: string[];
}

interface SubmitBody {
  encodedAuthEntry: string;
  signature: string;
  contractAddress: string;
  encodedTx: string;
  validUntilLedger: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action: string } & PrepareBody & SubmitBody;
    const { action } = body;

    if (action === "prepare") {
      return handlePrepare(body as PrepareBody);
    }
    if (action === "submit") {
      return handleSubmit(body as SubmitBody);
    }

    return NextResponse.json({ error: "action must be 'prepare' or 'submit'" }, { status: 400 });
  } catch (error) {
    console.error("Execute error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Phase 1: build & simulate – return auth hash the client must sign
// ---------------------------------------------------------------------------
async function handlePrepare(body: PrepareBody) {
  const { contractId, functionName, encodedArgs } = body;

  if (!contractId || !functionName) {
    return NextResponse.json({ error: "contractId and functionName are required" }, { status: 400 });
  }

  const args: xdr.ScVal[] = (encodedArgs || []).map((a: string) =>
    xdr.ScVal.fromXDR(a, "base64"),
  );

  const rpc = new SorobanRpc.Server(RPC_URL);
  const sourceAccount = await rpc.getAccount(SOURCE_PUBLIC_KEY);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: functionName,
        args,
      }),
    )
    .setTimeout(30)
    .build();

  const simulation = await rpc.simulateTransaction(tx);
  if (
    SorobanRpc.Api.isSimulationError(simulation) ||
    SorobanRpc.Api.isSimulationRestore(simulation)
  ) {
    return NextResponse.json(
      { error: "Simulation failed", details: JSON.stringify(simulation) },
      { status: 400 },
    );
  }

  const authEntries = (simulation as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.auth ?? [];
  if (authEntries.length === 0) {
    return NextResponse.json({ error: "No authorization entries in simulation" }, { status: 400 });
  }

  const authEntry = authEntries[0];
  const validUntilLedger = simulation.latestLedger + 100;

  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(NETWORK_PASSPHRASE, "utf-8")),
      nonce: authEntry.credentials().address().nonce(),
      signatureExpirationLedger: validUntilLedger,
      invocation: authEntry.rootInvocation(),
    }),
  ).toXDR();

  const authHash = hash(preimage).toString("hex");

  return NextResponse.json({
    success: true,
    authHash,
    encodedAuthEntry: authEntry.toXDR("base64"),
    latestLedger: simulation.latestLedger,
    validUntilLedger,
    // Encode the tx so phase 2 can reuse it (avoid re-simulating)
    encodedTx: tx.toXDR(),
  });
}

// ---------------------------------------------------------------------------
// Phase 2: assemble signed tx, fee-bump & submit
// ---------------------------------------------------------------------------
async function handleSubmit(body: SubmitBody) {
  const { encodedAuthEntry, signature, contractAddress, encodedTx, validUntilLedger } = body;

  if (!encodedAuthEntry || !signature || !encodedTx) {
    return NextResponse.json(
      { error: "encodedAuthEntry, signature, and encodedTx are required" },
      { status: 400 },
    );
  }

  // Parse the signed auth entry
  const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(encodedAuthEntry, "base64");
  const creds = authEntry.credentials().address();

  // Parse and normalize the signature (65 bytes: r + s + v, v adjusted to 0/1)
  const rawHex = signature.startsWith("0x") ? signature.slice(2) : signature;
  const sigBytes = Buffer.from(rawHex, "hex");
  if (sigBytes.length !== 65) {
    return NextResponse.json(
      { error: `Invalid signature length: expected 65 bytes, got ${sigBytes.length}` },
      { status: 400 },
    );
  }
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  let v = sigBytes[64];
  if (v >= 27) v -= 27;
  const normalizedSig = Buffer.alloc(65);
  r.copy(normalizedSig, 0);
  s.copy(normalizedSig, 32);
  normalizedSig[64] = v;

  creds.signatureExpirationLedger(validUntilLedger);
  creds.signature(xdr.ScVal.scvBytes(normalizedSig));

  const rpc = new SorobanRpc.Server(RPC_URL);

  // Re-build the transaction (fresh sequence number) with the signed auth entry
  const freshAccount = await rpc.getAccount(SOURCE_PUBLIC_KEY);
  const parsedTx = TransactionBuilder.fromXDR(encodedTx as string, NETWORK_PASSPHRASE) as Transaction;

  const signedTx = new TransactionBuilder(freshAccount, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeHostFunction({
        ...(parsedTx.operations[0] as Operation.InvokeHostFunction),
        auth: [authEntry],
      }),
    )
    .setTimeout(30)
    .build();

  // Re-simulate to get resource fees
  const signedSimulation = await rpc.simulateTransaction(signedTx);
  if (
    SorobanRpc.Api.isSimulationError(signedSimulation) ||
    SorobanRpc.Api.isSimulationRestore(signedSimulation)
  ) {
    return NextResponse.json(
      { error: "Re-simulation failed", details: JSON.stringify(signedSimulation) },
      { status: 400 },
    );
  }

  // Register account for sponsorship
  try {
    const regRes = await fetch(
      `${process.env.WALLET_BACKEND_URL}/accounts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: SOURCE_PUBLIC_KEY }),
      },
    );
    if (!regRes.ok) console.warn("Account registration returned:", regRes.status);
  } catch (e) {
    console.warn("Account registration failed:", e);
  }

  const assembledTx = SorobanRpc.assembleTransaction(signedTx, signedSimulation).build();

  // Server-sign via wallet-backend proxy
  const signRes = await fetch(
    new URL("/api/wallet-backend/tx/sign", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionXdr: assembledTx.toXDR() }),
    },
  );
  if (!signRes.ok) {
    const text = await signRes.text();
    return NextResponse.json(
      { error: `server-side sign failed: ${text}` },
      { status: 502 },
    );
  }

  const signJson = (await signRes.json()) as { transactionXdr?: string };
  if (!signJson.transactionXdr) {
    return NextResponse.json({ error: "Missing transactionXdr in sign response" }, { status: 502 });
  }

  // Create fee-bump via wallet-backend proxy
  const fbRes = await fetch(
    new URL("/api/wallet-backend/tx/create-fee-bump", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: signJson.transactionXdr }),
    },
  );
  if (!fbRes.ok) {
    const text = await fbRes.text();
    return NextResponse.json({ error: `create-fee-bump failed: ${text}` }, { status: 502 });
  }

  const fbJson = (await fbRes.json()) as { transaction?: string };
  if (!fbJson.transaction) {
    return NextResponse.json({ error: "Missing fee-bump transaction in response" }, { status: 502 });
  }

  // Submit to Horizon
  const horizonRes = await fetch(`${HORIZON_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tx: fbJson.transaction }),
  });
  const horizonJson = (await horizonRes.json()) as { hash?: string; successful?: boolean };

  if (!horizonJson.hash && !horizonJson.successful) {
    return NextResponse.json(
      { error: "Transaction submission failed", details: JSON.stringify(horizonJson) },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, txHash: horizonJson.hash || "" });
}
