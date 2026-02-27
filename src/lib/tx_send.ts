import {
  Memo,
  Operation,
  Transaction,
  xdr,
  Keypair,
  type MemoType,
  SorobanRpc,
} from "@stellar/stellar-sdk";

/**
 * Generic function to send a transaction that requires ECDSA authentication
 * @param authTxn - The transaction that requires authentication
 * @param lastLedger - The last ledger sequence number
 * @param ecdsaSignature - The ECDSA signature (65 bytes: r (32) + s (32) + recovery_id (1))
 * @param options - Optional configuration
 * @returns The transaction response
 */
export async function sendEcdsaTransaction(
  authTxn: Transaction<Memo<MemoType>, Operation[]>,
  lastLedger: number,
  ecdsaSignature: Buffer, // 65 bytes: r (32) + s (32) + recovery_id (1)
  options?: {
    timeout?: number;
    signatureExpirationOffset?: number;
  },
) {
  const server = new SorobanRpc.Server(
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL!,
  );

  // Validate signature length
  if (ecdsaSignature.length !== 65) {
    throw new Error(
      `Invalid ECDSA signature length: expected 65 bytes, got ${ecdsaSignature.length}`,
    );
  }

  const signerKey = Keypair.fromSecret(
    process.env.WALLET_SOURCE_PRIVATE_KEY!,
  );

  // warn if signerKey is not found
  if (!signerKey) {
    console.warn("Signer key not found");
    return;
  }

  const op = authTxn.operations[0] as Operation.InvokeHostFunction;
  // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
  const creds = op.auth?.[0].credentials().address()!;

  creds.signatureExpirationLedger(
    lastLedger + (options?.signatureExpirationOffset || 100),
  );

  // Pass the ECDSA signature directly as bytes (65 bytes: r + s + recovery_id)
  // This matches the contract's __check_auth function expectation
  creds.signature(xdr.ScVal.scvBytes(ecdsaSignature));

  const sim = await server.simulateTransaction(authTxn);

  if (
    SorobanRpc.Api.isSimulationError(sim) ||
    SorobanRpc.Api.isSimulationRestore(sim)
  )
    throw sim;

  const transaction = SorobanRpc.assembleTransaction(authTxn, sim)
    .setTimeout(options?.timeout || 30)
    .build();

  transaction.sign(signerKey);

  const txResp = await (
    await fetch(`${process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ tx: transaction.toXDR() }),
    })
  ).json();

  if (txResp.successful) {
    console.log(txResp);
    return txResp;
  } else {
    throw txResp;
  }
}

/**
 * Generic function to send a regular transaction (no ECDSA authentication required)
 * Uses the Soroban RPC endpoint (not Horizon) since these are Soroban contract invocations.
 * @param transaction - The transaction to send
 * @returns The transaction response with hash
 */
export async function sendTransaction(
  transaction: Transaction<Memo<MemoType>, Operation[]>,
) {
  const server = new SorobanRpc.Server(process.env.NEXT_PUBLIC_STELLAR_RPC_URL!);

  const signerKey = Keypair.fromSecret(process.env.WALLET_SOURCE_PRIVATE_KEY!);
  if (!signerKey) {
    console.warn("Signer key not found");
    return;
  }

  transaction.sign(signerKey);

  const sendResp = await server.sendTransaction(transaction);

  if (sendResp.status === "ERROR") {
    throw new Error(`sendTransaction failed: ${JSON.stringify(sendResp.errorResult)}`);
  }

  // Poll using raw JSON-RPC to avoid SDK XDR parsing issues
  const txHash = sendResp.hash;
  const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL!;
  let status = "NOT_FOUND";
  let retries = 0;
  while (status === "NOT_FOUND" && retries < 20) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const pollResp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: { hash: txHash },
      }),
    });
    const pollData = await pollResp.json();
    status = pollData?.result?.status ?? "NOT_FOUND";
    retries++;
  }

  if (status === "SUCCESS") {
    console.log("Transaction successful:", txHash);
    return { hash: txHash };
  } else {
    throw new Error(`Transaction ${status === "NOT_FOUND" ? "timed out" : status} after ${retries} retries`);
  }
}
