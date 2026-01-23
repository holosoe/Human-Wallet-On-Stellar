import {
  Account,
  Address,
  Operation,
  SorobanRpc,
  TransactionBuilder,
  xdr,
  hash,
} from "@stellar/stellar-sdk";

export async function sendTxWithFeeBump(params: {
  rpcUrl: string;
  networkPassphrase: string;
  innerTransactionXdr: string; // base64 envelope
}): Promise<{ hash: string }> {
  const { rpcUrl, innerTransactionXdr } = params;
  // Create fee bump via internal API endpoint
  const fbRes = await fetch("/api/wallet-backend/tx/create-fee-bump", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: innerTransactionXdr }),
  });
  const fbText = await fbRes.text();
  let fbJson: { transaction?: string; networkPassphrase?: string } = {};
  try {
    fbJson = fbText ? JSON.parse(fbText) : {};
  } catch (e) {
    throw new Error(`create-fee-bump non-JSON (${fbRes.status}): ${fbText}`);
  }
  if (!fbRes.ok || !fbJson.transaction) {
    throw new Error(
      `create-fee-bump error ${fbRes.status}: ${JSON.stringify(fbJson)}`,
    );
  }
  const feeBumpXdr: string = fbJson.transaction;

  // Submit fee-bump to Horizon (not Soroban RPC)
  const horizonUrl = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
  const res = await fetch(`${horizonUrl}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tx: feeBumpXdr }),
  });
  const json = (await res.json()) as { hash?: string; successful?: boolean };
  if (!json.hash && !json.successful) throw new Error(`Submission failed: ${JSON.stringify(json)}`);
  return { hash: json.hash || "" };
}

export interface ContractInteractionConfig {
  contractId: string;
  functionName: string;
  args: xdr.ScVal[];
  description: string;
  onSuccess?: (hash: string) => void;
  onError?: (error: any) => void;
}

export interface AuthSigningResult {
  signedAuthEntries: xdr.SorobanAuthorizationEntry[];
  simulation: any;
}

export async function buildAndSimulateTx(
  contractId: string,
  functionName: string,
  args: xdr.ScVal[],
  sourcePublicKey: string,
  rpcUrl: string,
  networkPassphrase: string,
): Promise<{
  tx: any;
  simulation: any;
  authEntries: xdr.SorobanAuthorizationEntry[];
}> {
  console.log(
    `Building ${functionName} transaction for contract ${contractId}...`,
  );

  const rpc = new SorobanRpc.Server(rpcUrl);
  const sourceAccount = await rpc.getAccount(sourcePublicKey);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: functionName,
        args: args,
      }),
    )
    .setTimeout(30)
    .build();

  console.log(`Simulating ${functionName} transaction...`);
  const simulation = await rpc.simulateTransaction(tx);
  if (
    SorobanRpc.Api.isSimulationError(simulation) ||
    SorobanRpc.Api.isSimulationRestore(simulation)
  ) {
    throw simulation;
  }

  const authEntries = simulation.result?.auth ?? [];
  if (authEntries.length === 0) {
    throw new Error("No authorization entries found in simulation");
  }

  return { tx, simulation, authEntries };
}

export async function signAuthEntries(
  authEntries: xdr.SorobanAuthorizationEntry[],
  simulation: any,
  networkPassphrase: string,
  signMessage: (message: string) => Promise<string>,
): Promise<xdr.SorobanAuthorizationEntry[]> {
  console.log("Signing auth entries with user's wallet...");

  const signedAuthEntries: xdr.SorobanAuthorizationEntry[] = [];

  for (const authEntry of authEntries) {
    const validUntilLedger = simulation.latestLedger + 100;

    // Compute auth hash from the unsigned entry
    const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId: hash(Buffer.from(networkPassphrase, "utf-8")),
        nonce: authEntry.credentials().address().nonce(),
        signatureExpirationLedger: validUntilLedger,
        invocation: authEntry.rootInvocation(),
      }),
    ).toXDR();
    const authHash = hash(preimage);

    console.log("Auth hash:", authHash.toString("hex"));

    // Sign with user's wallet
    const messageToSign = "auth hash: " + authHash.toString("hex");
    const userSig = await signMessage(messageToSign);
    const rawHex = userSig.startsWith("0x") ? userSig.slice(2) : userSig;
    const sigBytes = Buffer.from(rawHex, "hex");
    if (sigBytes.length !== 65)
      throw new Error(
        `Invalid signature length: expected 65 bytes, got ${sigBytes.length}`,
      );
    const r = sigBytes.slice(0, 32);
    const s = sigBytes.slice(32, 64);
    let v = sigBytes[64];
    if (v >= 27) v -= 27;
    const sigBuffer = Buffer.alloc(65);
    r.copy(sigBuffer, 0);
    s.copy(sigBuffer, 32);
    sigBuffer[64] = v;

    // Create signed auth entry
    const signedEntry = xdr.SorobanAuthorizationEntry.fromXDR(
      authEntry.toXDR(),
    );
    const creds = signedEntry.credentials().address();
    creds.signatureExpirationLedger(validUntilLedger);
    creds.signature(xdr.ScVal.scvBytes(sigBuffer));

    signedAuthEntries.push(signedEntry);
  }

  console.log("Auth entries signed successfully.");
  return signedAuthEntries;
}

export async function sendTxWithWalletBackend(
  tx: any,
  signedAuthEntries: xdr.SorobanAuthorizationEntry[],
  sourcePublicKey: string,
  rpcUrl: string,
  networkPassphrase: string,
): Promise<string> {
  console.log("Building transaction with signed auth entries...");

  const rpc = new SorobanRpc.Server(rpcUrl);

  // Get fresh account sequence for the inner transaction
  const freshAccount = await rpc.getAccount(sourcePublicKey);

  const signedTx = new TransactionBuilder(freshAccount, {
    fee: "100",
    networkPassphrase: networkPassphrase,
  })
    .addOperation(
      Operation.invokeHostFunction({
        ...(tx.operations[0] as Operation.InvokeHostFunction),
        auth: signedAuthEntries,
      }),
    )
    .setTimeout(30)
    .build();

  console.log("Simulating signed transaction...");
  const signedSimulation = await rpc.simulateTransaction(signedTx);
  if (
    SorobanRpc.Api.isSimulationError(signedSimulation) ||
    SorobanRpc.Api.isSimulationRestore(signedSimulation)
  ) {
    throw signedSimulation;
  }

  console.log("Sending to wallet-backend for fee-bumping...");

  // Register the source account with wallet-backend for sponsorship
  console.log("Registering source account with wallet-backend...");
  try {
    const regRes = await fetch("/api/wallet-backend/account/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: sourcePublicKey }),
    });
    if (!regRes.ok) {
      const text = await regRes.text();
      throw new Error(`register-account failed ${regRes.status}: ${text}`);
    }
    console.log("Source account registered successfully.");
  } catch (error) {
    // console.warn(
    //   "Account registration failed (might already be registered):",
    //   error,
    // );
  }

  const assembledTx = SorobanRpc.assembleTransaction(
    signedTx,
    signedSimulation,
  ).build();

  // Sign the assembledTx server-side
  const signRes = await fetch("/api/wallet-backend/tx/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionXdr: assembledTx.toXDR() }),
  });
  if (!signRes.ok) {
    const text = await signRes.text();
    throw new Error(`server-side sign failed ${signRes.status}: ${text}`);
  }
  const signJson = (await signRes.json()) as { transactionXdr?: string };
  if (!signJson.transactionXdr) {
    throw new Error("server-side sign: missing transactionXdr in response");
  }

  const { hash: txHash } = await sendTxWithFeeBump({
    rpcUrl: rpcUrl,
    networkPassphrase: networkPassphrase,
    innerTransactionXdr: signJson.transactionXdr,
  });

  console.log("✅ Transaction submitted successfully!");
  return txHash;
}

export async function handleTxWithWalletBackend(
  config: ContractInteractionConfig,
  deployedContractAddress: string,
  signMessage: (message: string) => Promise<string>,
  setIsLoading: (loading: boolean) => void,
  setIsSigning: (signing: boolean) => void,
  notify: (type: "success" | "error" | "info", message: string) => void,
): Promise<string | null> {
  const sourcePublicKey =
    process.env.NEXT_PUBLIC_WALLET_SOURCE_PUBLIC_KEY!;
  const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL!;
  const networkPassphrase = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE!;

  setIsLoading(true);
  try {
    // Step 1: Build and simulate transaction
    const { tx, simulation, authEntries } = await buildAndSimulateTx(
      config.contractId,
      config.functionName,
      config.args,
      sourcePublicKey,
      rpcUrl,
      networkPassphrase,
    );

    // Step 2: Sign auth entries
    setIsSigning(true);
    const signedAuthEntries = await signAuthEntries(
      authEntries,
      simulation,
      networkPassphrase,
      signMessage,
    );
    setIsSigning(false);

    // Step 3: Send Tx with wallet backend
    const txHash = await sendTxWithWalletBackend(
      tx,
      signedAuthEntries,
      sourcePublicKey,
      rpcUrl,
      networkPassphrase,
    );

    console.log(`✅ ${config.description} successful! Hash: ${txHash}`);
    notify(
      "success",
      `${config.description} successful! Transaction hash: ${txHash}`,
    );

    if (config.onSuccess) {
      config.onSuccess(txHash);
    }

    return txHash;
  } catch (error) {
    console.error(`${config.description} error:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    notify(
      "error",
      `Failed to ${config.description.toLowerCase()}: ${errorMessage}`,
    );

    if (config.onError) {
      config.onError(error);
    }

    return null;
  } finally {
    setIsLoading(false);
    setIsSigning(false);
  }
}
