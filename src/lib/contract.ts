import {
  StrKey,
  xdr,
  hash,
  Address,
  SorobanRpc,
  Account,
  TransactionBuilder,
  Operation,
  Contract,
} from "@stellar/stellar-sdk";
import { Asset, Keypair } from "@stellar/stellar-sdk";

/**
 * Get the XLM balance of a deployed contract
 * @param contractAddress - The Stellar contract address
 * @returns The XLM balance as a string
 */
export async function getContractBalance(
  contractAddress: string
): Promise<string> {
  try {
    console.log(
      "Getting contract internal balance via RPC for:",
      contractAddress
    );

    const server = new SorobanRpc.Server(
      process.env.NEXT_PUBLIC_STELLAR_RPC_URL!
    );

    const nativeContractId =
      // process.env.NEXT_PUBLIC_STELLAR_NATIVE_CONTRACT_ID ||
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

    // Build the ContractData ledger key for the native token's Balance(Address)
    const balanceKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: Address.fromString(nativeContractId).toScAddress(),
        key: xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol("Balance"),
          xdr.ScVal.scvAddress(
            Address.fromString(contractAddress).toScAddress()
          ),
        ]),
        durability: xdr.ContractDataDurability.persistent(),
      })
    );

    const res = await server.getLedgerEntries(balanceKey);
    console.log(
      "LedgerEntries response:",
      JSON.stringify({ count: res.entries.length }, null, 2)
    );
    if (res.entries.length === 0) {
      console.log("No balance ledger entry found; defaulting to 0");
      return "0";
    }

    const entry = res.entries[0];
    const contractData = entry.val.contractData?.();
    if (!contractData) {
      console.log("Ledger entry did not contain contractData; defaulting to 0");
      return "0";
    }

    try {
      const raw = parseEntry(nativeContractId, entry);
      const xlm = (Number(BigInt(raw)) / 10_000_000).toString();
      return xlm;
    } catch (e) {
      console.log("Failed to parse balance; returning 0", e);
      return "0";
    }
  } catch (error) {
    console.error("Error getting contract balance:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error name:", error.name);
    }
    return "0";
  }
}

/**
 * Batch fetch raw balances (128-bit integer string) for multiple token contracts
 * for the same holder (G... account or C... contract).
 * Returns a map from contractId -> raw integer string (not scaled by decimals).
 */
export async function getContractBalances(
  holder: string,
  tokenContractIds: string[]
): Promise<Record<string, string>> {
  const balances: Record<string, string> = {};
  if (tokenContractIds.length === 0) return balances;

  const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL!;
  const server = new SorobanRpc.Server(rpcUrl);

  const holderSc = Address.fromString(holder).toScAddress();

  const keys = tokenContractIds.map((cid) =>
    xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: Address.fromString(cid).toScAddress(),
        key: xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol("Balance"),
          xdr.ScVal.scvAddress(holderSc),
        ]),
        durability: xdr.ContractDataDurability.persistent(),
      })
    )
  );

  // try single-key query
  for (let i = 0; i < tokenContractIds.length; i++) {
    const cid = tokenContractIds[i];
    try {
      let single: any;
      try {
        single = await server.getLedgerEntries(keys[i]);
      } catch (e) {
        single = await server.getLedgerEntries([keys[i]] as any);
      }
      const parsed = parseEntry(cid, (single as any).entries?.[0]);
      balances[cid] = parsed;
    } catch (e) {
      console.warn("[getContractBalances] Single fetch failed for", cid, e);
      balances[cid] = "0";
    }
  }

  return balances;
}

// Helper to parse a single entry -> raw string
const parseEntry = (cid: string, entry: unknown): string => {
  try {
    const e = entry as any;
    if (!e) return "0";
    const cd = e.val.contractData?.();
    if (!cd) return "0";
    const scv = cd.val();
    const t = scv.switch().value;
    if (t === xdr.ScValType.scvI128().value) {
      const p = scv.i128();
      const bi = (BigInt(p.hi().toString()) << 64n) + BigInt(p.lo().toString());
      return bi.toString();
    }
    if (t === xdr.ScValType.scvU128().value) {
      const p = scv.u128();
      const bi = (BigInt(p.hi().toString()) << 64n) + BigInt(p.lo().toString());
      return bi.toString();
    }
    // Map/struct case: look for 'balance' (or 'amount') field containing i128/u128
    if (t === xdr.ScValType.scvMap().value) {
      const m = scv.map();
      if (m) {
        const entries: any[] = Array.isArray(m) ? (m as any[]) : (m as any);
        for (const me of entries) {
          try {
            const k = me.key();
            const v = me.val();
            const isSymbol = k.switch().value === xdr.ScValType.scvSymbol().value;
            const name = isSymbol ? k.sym().toString() : "";
            if (isSymbol && (name === "balance" || name === "amount")) {
              const vt = v.switch().value;
              if (vt === xdr.ScValType.scvI128().value) {
                const p = v.i128();
                const bi = (BigInt(p.hi().toString()) << 64n) + BigInt(p.lo().toString());
                return bi.toString();
              }
              if (vt === xdr.ScValType.scvU128().value) {
                const p = v.u128();
                const bi = (BigInt(p.hi().toString()) << 64n) + BigInt(p.lo().toString());
                return bi.toString();
              }
            }
          } catch (inner) {
            console.warn("[getContractBalances] Map iterate error for", cid, inner);
          }
        }
      }
    }
    // Some implementations wrap the map inside a vector; search inside vec for a map with balance
    if (t === xdr.ScValType.scvVec().value) {
      const vec = scv.vec();
      if (Array.isArray(vec)) {
        for (const item of vec) {
          if (item.switch().value === xdr.ScValType.scvMap().value) {
            const m = item.map();
            const entries: any[] = Array.isArray(m) ? (m as any[]) : (m as any);
            for (const me of entries) {
              try {
                const k = me.key();
                const v = me.val();
                const isSymbol = k.switch().value === xdr.ScValType.scvSymbol().value;
                const name = isSymbol ? k.sym().toString() : "";
                if (isSymbol && (name === "balance" || name === "amount")) {
                  const vt = v.switch().value;
                  if (vt === xdr.ScValType.scvI128().value) {
                    const p = v.i128();
                    const bi = (BigInt(p.hi().toString()) << 64n) + BigInt(p.lo().toString());
                    return bi.toString();
                  }
                  if (vt === xdr.ScValType.scvU128().value) {
                    const p = v.u128();
                    const bi = (BigInt(p.hi().toString()) << 64n) + BigInt(p.lo().toString());
                    return bi.toString();
                  }
                }
              } catch (inner) {
                console.warn("[getContractBalances] Vec->Map iterate error for", cid, inner);
              }
            }
          }
        }
      }
    }
    console.warn("[getContractBalances] Unexpected ScVal type for", cid, t, "(unable to parse balance)");
    return "0";
  } catch (e) {
    console.warn("[getContractBalances] Parse error for", cid, e);
    return "0";
  }
};

/**
 * Check if a contract address exists on the network
 * @param contractAddress - The contract address to check
 * @returns True if the contract exists, false otherwise
 */
export async function checkContractExists(
  contractAddress: string
): Promise<boolean> {
  try {
    console.log("Checking if contract exists:", contractAddress);
    console.log("Using RPC URL:", process.env.NEXT_PUBLIC_STELLAR_RPC_URL);

    const server = new SorobanRpc.Server(
      process.env.NEXT_PUBLIC_STELLAR_RPC_URL!
    );

    // Try to get the contract's ledger entry using Contract.getFootprint()
    // This is the most reliable way to check if a contract exists
    try {
      console.log("Checking contract existence via Contract.getFootprint()...");

      // Step 1: Get the contract's ledger entry to find the Wasm hash
      const contractLedgerKey = new Contract(contractAddress)
        .getFootprint()
        .toXDR("base64");

      // Convert the base64 string to a LedgerKey object
      const ledgerKey = xdr.LedgerKey.fromXDR(contractLedgerKey, "base64");
      const contractEntryResponse = await server.getLedgerEntries(ledgerKey);

      if (
        contractEntryResponse.entries.length === 0 ||
        !contractEntryResponse.entries[0].val.contractData
      ) {
        console.log(
          "❌ Contract does not exist on network (no contract ledger entries)"
        );
        return false;
      }

      console.log(
        "✅ Contract exists on network (contract ledger entry found)"
      );
      return true;
    } catch (ledgerError) {
      console.log("❌ Contract ledger check failed");
      console.log("Ledger error details:", ledgerError);

      // Check if the error indicates the contract doesn't exist
      const errorStr =
        ledgerError instanceof Error
          ? ledgerError.message
          : String(ledgerError);
      console.log("❌ Contract does not exist on network");
      return false;
    }
  } catch (error) {
    console.error("Error checking contract existence:", error);
    return false;
  }
}
