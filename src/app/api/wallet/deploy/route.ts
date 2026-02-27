import { NextRequest, NextResponse } from "next/server";
import { StrKey, xdr, hash, Address } from "@stellar/stellar-sdk";
import { buildTransaction } from "@/lib/tx_build";
import { sendTransaction } from "@/lib/tx_send";
import { ethers } from "ethers";
import { checkContractExists } from "@/lib/contract";

export async function POST(request: NextRequest) {
  try {
    const { ethAddress } = await request.json();

    if (!ethAddress) {
      return NextResponse.json(
        { error: "ethAddress is required" },
        { status: 400 },
      );
    }

    // Validate the Ethereum address format
    if (!ethAddress.startsWith("0x") || ethAddress.length !== 42) {
      return NextResponse.json(
        {
          error:
            "Invalid Ethereum address format. Must be 0x-prefixed hex string.",
        },
        { status: 400 },
      );
    }

    // Convert hex string to Buffer
    const ethAddressHex = ethAddress.startsWith("0x")
      ? ethAddress.slice(2)
      : ethAddress;
    if (ethAddressHex.length !== 40) {
      return NextResponse.json(
        { error: "Invalid Ethereum address length" },
        { status: 400 },
      );
    }

    const ethAddressBuffer = Buffer.from(ethAddressHex, "hex");

    console.log(`Deploying ECDSA contract for address: ${ethAddress}`);

    // Get salt from environment variable
    const salt = process.env.WALLET_SALT;
    if (!salt) {
      return NextResponse.json(
        { error: "WALLET_SALT environment variable is required" },
        { status: 500 },
      );
    }

    // Convert salt to Buffer
    const saltBuffer = Buffer.from(salt, "hex");

    console.log(`Salt buffer: ${saltBuffer}`);
    if (saltBuffer.length !== 12) {
      return NextResponse.json(
        { error: "WALLET_SALT must be a 12-byte hex string" },
        { status: 500 },
      );
    }

    // Combine Ethereum address (20 bytes) and salt (12 bytes) to create 32-byte deterministic salt
    const deterministicSalt = Buffer.concat([ethAddressBuffer, saltBuffer]);

    // Get deployer address from env (use factory contract as deployer)
    const deployerAddress =
      process.env.NEXT_PUBLIC_STELLAR_ECDSA_SECP256K1_FACTORY_CONTRACT_ID;
    if (!deployerAddress) {
      return NextResponse.json(
        {
          error:
            "NEXT_PUBLIC_STELLAR_ECDSA_SECP256K1_FACTORY_CONTRACT_ID environment variable is required",
        },
        { status: 500 },
      );
    }

    // Calculate the contract address that will be deployed
    const contractAddress = StrKey.encodeContract(
      hash(
        xdr.HashIdPreimage.envelopeTypeContractId(
          new xdr.HashIdPreimageContractId({
            networkId: hash(
              Buffer.from(
                process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE!,
                "utf-8",
              ),
            ),
            contractIdPreimage:
              xdr.ContractIdPreimage.contractIdPreimageFromAddress(
                new xdr.ContractIdPreimageFromAddress({
                  address: Address.fromString(deployerAddress).toScAddress(),
                  salt: deterministicSalt,
                }),
              ),
          }),
        ).toXDR(),
      ),
    );

    console.log(`Computed contract address: ${contractAddress}`);

    // Check if contract already exists
    const exists = await checkContractExists(contractAddress);
    if (exists) {
      console.log(`Contract already exists at: ${contractAddress}`);
      return NextResponse.json({
        success: true,
        contractAddress,
        message: "Contract already deployed",
      });
    }

    // debug log
    console.log(`Deployer address: ${deployerAddress}`);
    console.log(`Deterministic salt: ${deterministicSalt}`);
    console.log(`Contract address: ${contractAddress}`);
    console.log(`ETH address: ${ethAddress}`);

    // Build the deployment transaction
    const { transaction } = await buildTransaction(
      process.env.NEXT_PUBLIC_STELLAR_ECDSA_SECP256K1_FACTORY_CONTRACT_ID!,
      "deploy",
      [
        xdr.ScVal.scvBytes(deterministicSalt),
        xdr.ScVal.scvBytes(ethAddressBuffer),
      ],
    );

    if (!transaction) {
      return NextResponse.json(
        { error: "Failed to build deployment transaction" },
        { status: 500 },
      );
    }

    // Send the transaction
    const result = await sendTransaction(transaction);
    if (!result) {
      return NextResponse.json({ error: "Transaction returned no result" }, { status: 500 });
    }

    console.log(`✅ Contract deployed successfully: ${contractAddress}`);
    console.log(`Transaction hash: ${result.hash}`);

    return NextResponse.json({
      success: true,
      contractAddress,
      transactionHash: result.hash,
      message: "Contract deployed successfully",
    });
  } catch (error: unknown) {
    console.error("Deployment error:", error);
    return NextResponse.json(
      {
        error: "Deployment failed",
        details: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
      },
      { status: 500 },
    );
  }
}
