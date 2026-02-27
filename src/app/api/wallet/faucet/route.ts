import { NextRequest, NextResponse } from 'next/server';
import { 
  TransactionBuilder, 
  Operation, 
  xdr, 
  Keypair, 
  Address,
  hash 
} from '@stellar/stellar-sdk';
import { Server as SorobanRpcServer, Api as SorobanRpcApi } from '@stellar/stellar-sdk/lib/soroban';
import { assembleTransaction } from '@stellar/stellar-sdk/lib/soroban/transaction';

export async function POST(request: NextRequest) {
  try {
    const { recipientAddress } = await request.json();

    if (!recipientAddress) {
      return NextResponse.json(
        { error: 'recipientAddress is required' },
        { status: 400 }
      );
    }

    // Validate the recipient address format
    try {
      Address.fromString(recipientAddress);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid recipient address format' },
        { status: 400 }
      );
    }

    // Faucet configuration
    const faucetPrivateKey = process.env.FAUCET_PRIVATE_KEY;
    const faucetPublicKey = process.env.NEXT_PUBLIC_FAUCET_PUBLIC_KEY;
    const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL;
    const networkPassphrase = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE;
    // Native XLM Stellar Asset Contract IDs per network
    const isMainnet = networkPassphrase === "Public Global Stellar Network ; September 2015";
    const nativeContractId = isMainnet 
      ? "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"  // Mainnet XLM SAC
      : "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; // Testnet XLM SAC

    if (!faucetPrivateKey || !faucetPublicKey || !rpcUrl || !networkPassphrase) {
      console.error('Missing environment variables for faucet');
      return NextResponse.json(
        { error: 'Faucet configuration error' },
        { status: 500 }
      );
    }

    console.log(`Faucet request: Sending 0.00001 XLM to ${recipientAddress}`);

    // Step 1: Build transaction locally
    console.log("Step 1: Building faucet transaction locally...");
    const rpc = new SorobanRpcServer(rpcUrl);
    const sourceAccount = await rpc.getAccount(faucetPublicKey);
    
    const tx = new TransactionBuilder(sourceAccount, {
      fee: '1000', // 1 XLM base fee to ensure mainnet acceptance
      networkPassphrase: networkPassphrase
    })
      .addOperation(Operation.invokeContractFunction({
        contract: nativeContractId,
        function: 'transfer',
        args: [
          Address.fromString(faucetPublicKey).toScVal(), // from: faucet account
          Address.fromString(recipientAddress).toScVal(), // to: recipient address
          xdr.ScVal.scvI128(new xdr.Int128Parts({ 
            lo: xdr.Uint64.fromString('100'), // 0.00001 XLM = 100 stroops
            hi: xdr.Int64.fromString('0') 
          }))
        ]
      }))
      .setTimeout(30)
      .build();

    // Step 2: Simulate the transaction
    console.log("Step 2: Simulating faucet transaction...");
    const simulation = await rpc.simulateTransaction(tx);
    if (SorobanRpcApi.isSimulationError(simulation) || SorobanRpcApi.isSimulationRestore(simulation)) {
      console.error('Simulation failed:', simulation);
      return NextResponse.json(
        { error: 'Transaction simulation failed' },
        { status: 500 }
      );
    }

    // Step 3: Assemble and sign the transaction
    console.log("Step 3: Assembling and signing faucet transaction...");
    const assembledTx = assembleTransaction(tx, simulation).build();
    const faucetKeypair = Keypair.fromSecret(faucetPrivateKey);
    assembledTx.sign(faucetKeypair);

    // Step 4: Submit the transaction
    console.log("Step 4: Submitting faucet transaction...");
    const response = await fetch(`${process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'tx': assembledTx.toXDR() }),
    });

    const result = await response.json();

    if (result.successful) {
      console.log(`✅ Faucet transaction successful! Hash: ${result.hash}`);
      return NextResponse.json({
        success: true,
        hash: result.hash,
        message: '10 XLM sent successfully'
      });
    } else {
      console.error('Transaction failed:', result);
      return NextResponse.json(
        { error: 'Transaction failed', details: result },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Faucet API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
