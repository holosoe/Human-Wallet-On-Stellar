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
 * @param transaction - The transaction to send
 * @param signerKey - The keypair to sign the transaction
 * @returns The transaction response
 */
export async function sendTransaction(
  transaction: Transaction<Memo<MemoType>, Operation[]>,
) {
  const signerKey = Keypair.fromSecret(
    process.env.WALLET_SOURCE_PRIVATE_KEY!,
  );

  // warn if signerKey is not found
  if (!signerKey) {
    console.warn("Signer key not found");
    return;
  }

  transaction.sign(signerKey);

  const txResp = await (
    await fetch(`${process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ tx: transaction.toXDR() }),
    })
  ).json();

  if (txResp.successful) {
    console.log("Transaction successful:", txResp);
    return txResp;
  } else {
    throw txResp;
  }
}
