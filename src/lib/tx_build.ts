import { Account, Address, Operation, SorobanRpc, TransactionBuilder, hash, xdr } from "@stellar/stellar-sdk";

export async function buildTransaction(
    contractId: string, 
    functionName: string, 
    args: xdr.ScVal[] = []
) {
    const sourcePublicKey = process.env.NEXT_PUBLIC_WALLET_SOURCE_PUBLIC_KEY!;
    
    const rpc = new SorobanRpc.Server(process.env.NEXT_PUBLIC_STELLAR_RPC_URL!);
    const lastLedger = await rpc.getLatestLedger().then(({ sequence }) => sequence)
    const sourceKeyAccount = await rpc.getAccount(sourcePublicKey).then((res) => new Account(res.accountId(), res.sequenceNumber()))

    const simTxn = new TransactionBuilder(sourceKeyAccount, {
        fee: '100',
        networkPassphrase: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE!
    })
        .addOperation(Operation.invokeContractFunction({
            contract: contractId,
            function: functionName,
            args: args
        }))
        .setTimeout(0)
        .build()

    const sim = await rpc.simulateTransaction(simTxn)

    if (
        SorobanRpc.Api.isSimulationError(sim)
        || SorobanRpc.Api.isSimulationRestore(sim)
    ) throw sim

    const transaction = SorobanRpc.assembleTransaction(simTxn, sim).setTimeout(0).build()

    // Check if this transaction requires ECDSA authentication
    if (sim.result?.auth && sim.result.auth.length > 0) {
        // This is an ECDSA-authenticated transaction (like voting)
        const auth = sim.result.auth[0]
        const authHash = hash(
            xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
                new xdr.HashIdPreimageSorobanAuthorization({
                    networkId: hash(Buffer.from(process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE!, 'utf-8')),
                    nonce: auth.credentials().address().nonce(),
                    signatureExpirationLedger: lastLedger + 100,
                    invocation: auth.rootInvocation()
                })
            ).toXDR()
        )

        return {
            authTxn: transaction,
            authHash,
            lastLedger
        }
    } else {
        // This is a regular transaction (like deployment)
        return {
            transaction,
            simulation: sim
        }
    }
}
