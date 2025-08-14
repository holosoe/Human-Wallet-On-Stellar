import { NextRequest, NextResponse } from "next/server";
import { checkContractExists } from "@/lib/contract";
import { StrKey, xdr, hash, Address } from "@stellar/stellar-sdk";

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

    const salt = process.env.WALLET_SALT;
    if (!salt) {
      throw new Error("WALLET_SALT environment variable is not set");
    }
    const saltBuffer = Buffer.from(salt, "hex");
    if (saltBuffer.length !== 12) {
      return NextResponse.json(
        { error: "WALLET_SALT must be a 12-byte hex string" },
        { status: 500 },
      );
    }

    // Combine Ethereum address (20 bytes) and salt (12 bytes) to create 32-byte deterministic salt
    const deterministicSalt = Buffer.concat([ethAddressBuffer, saltBuffer]);

    console.log(
      `Checking for existing wallet deployment for address: ${ethAddress}`,
    );

    // get deployer address from env (use factory contract as deployer)
    const deployerAddress =
      process.env.NEXT_PUBLIC_STELLAR_ECDSA_SECP256K1_FACTORY_CONTRACT_ID;
    if (!deployerAddress) {
      throw new Error(
        "NEXT_PUBLIC_STELLAR_ECDSA_SECP256K1_FACTORY_CONTRACT_ID environment variable is not set",
      );
    }

    // Calculate the contract address using the same logic as deploy API
    const walletContractAddress = StrKey.encodeContract(
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

    // check if wallet contract has been deployed
    console.log("About to check if contract exists:", walletContractAddress);
    const exists = await checkContractExists(walletContractAddress);
    console.log("Contract exists result:", exists);

    if (exists) {
      console.log(
        `✅ Found existing wallet deployment: ${walletContractAddress}`,
      );
      return NextResponse.json({
        success: true,
        exists: true,
        contractAddress: walletContractAddress,
        message: "Smart contract wallet found",
      });
    } else {
      console.log(`❌ No existing wallet deployment found for: ${ethAddress}`);
      return NextResponse.json({
        success: true,
        exists: false,
        contractAddress: walletContractAddress,
        message: "No smart contract wallet found",
      });
    }
  } catch (error) {
    console.error("Wallet check error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// GET endpoint for convenience
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ethAddress = searchParams.get("ethAddress");

  if (!ethAddress) {
    return NextResponse.json(
      { error: "ethAddress parameter is required" },
      { status: 400 },
    );
  }

  // Create a mock request object for the POST handler
  const mockRequest = {
    json: async () => ({ ethAddress }),
  } as NextRequest;

  return POST(mockRequest);
}
