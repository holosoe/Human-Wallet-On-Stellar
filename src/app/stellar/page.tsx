"use client";
import RootStyle from "@/components/RootStyle";
import { useToast } from "@/hooks/useToast";
import { useHumanWalletStore } from "@/store/useHumanWalletStore";
import { motion } from "framer-motion";
import Image from "next/image";
import { useState, useEffect } from "react";
import { getContractBalance, getContractBalances } from "@/lib/contract";
import { Address, StrKey, xdr } from "@stellar/stellar-sdk";
import { ethers } from "ethers";
import { Buffer } from "buffer";
import { handleTxWithWalletBackend } from "@/lib/walletBackendHelpers";

export default function HumanWalletPage() {
  const [signature, setSignature] = useState("");
  const [recoveredPublicKey, setRecoveredPublicKey] = useState("");
  const [isDeployingContract, setIsDeployingContract] = useState(false);
  const [isCheckingExistingDeployment, setIsCheckingExistingDeployment] =
    useState(false);
  const [walletContractAddress, setWalletContractAddress] = useState("");
  const [isVotingWithEcdsaContract, setIsVotingWithEcdsaContract] =
    useState(false);
  const [isSigningAuthHash, setIsSigningAuthHash] = useState(false);
  const [voteChoice, setVoteChoice] = useState<"chicken" | "egg" | null>(null);
  const [hasCheckedExistingDeployment, setHasCheckedExistingDeployment] =
    useState(false);
  const [contractBalance, setContractBalance] = useState<string>("0");
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isSendingXLM, setIsSendingXLM] = useState(false);
  const [isSigningSendTransaction, setIsSigningSendTransaction] =
    useState(false);
  const [lastTransactionHash, setLastTransactionHash] = useState<string>("");
  const [isRequestingFaucet, setIsRequestingFaucet] = useState(false);

  const notify = useToast();

  const {
    address,
    isConnected,
    chainId,
    walletName,
    login,
    logout,
    switchChain,
    signMessage,
  } = useHumanWalletStore();

  // Check for existing ECDSA contract on page load when wallet is connected
  useEffect(() => {
    if (isConnected && address && !hasCheckedExistingDeployment) {
      checkExistingDeploymentOnLoad();
    }

    if (isConnected && address && hasCheckedExistingDeployment) {
      handleCheckContractBalance();
    }
  }, [isConnected, address, hasCheckedExistingDeployment]);

  const checkExistingDeploymentOnLoad = async () => {
    if (!address) return;

    setIsCheckingExistingDeployment(true);
    try {
      // Use the Ethereum address from the wallet
      const ethAddressHex =
        address && address.startsWith("0x") ? address.slice(2) : address;
      if (!ethAddressHex || ethAddressHex.length !== 40) {
        console.log(
          "Invalid Ethereum address for checking existing deployment",
        );
        setHasCheckedExistingDeployment(true);
        return;
      }

      // check for contract /api/wallet/check
      const response = await fetch(
        `/api/wallet/check?ethAddress=0x${encodeURIComponent(ethAddressHex)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        console.error(
          "Failed to check existing deployment:",
          response.statusText,
        );
        setWalletContractAddress("");
        return;
      }

      const result = await response.json();
      if (result.success && result.exists) {
        setWalletContractAddress(result.contractAddress);
        console.log(
          "Found existing ECDSA contract on page load:",
          result.contractAddress,
        );
        // Automatically check balance when contract is found
        setTimeout(() => {
          handleCheckContractBalance();
        }, 1000);
      } else {
        setWalletContractAddress("");
        console.log("No existing ECDSA contract found on page load");
      }
    } catch (error) {
      console.error("Error checking existing deployment on page load:", error);
      setWalletContractAddress("");
    } finally {
      setIsCheckingExistingDeployment(false);
      setHasCheckedExistingDeployment(true);
    }
  };

  const handleLogin = async () => {
    try {
      await login();
      notify("success", "Wallet connected successfully!");
    } catch (error) {
      console.log("Login error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setSignature("");
      setRecoveredPublicKey("");
      setWalletContractAddress("");
      setHasCheckedExistingDeployment(false);
      notify("success", "Wallet disconnected");
    } catch (error) {
      console.log("Logout error:", error);
    }
  };

  const handleDeployEcdsaContract = async () => {
    if (!isConnected) {
      notify("error", "Please connect your wallet first");
      return;
    }

    // If user hasn't signed yet, sign and then deploy automatically
    if (!recoveredPublicKey) {
      setIsDeployingContract(true);
      try {
        // Sign the message first
        const sig = await signMessage(
          process.env.NEXT_PUBLIC_WALLET_DEPLOY_MESSAGE!,
        );
        setSignature(sig);

        // Recover the public key from the signature
        const messageHash = ethers.hashMessage(
          process.env.NEXT_PUBLIC_WALLET_DEPLOY_MESSAGE!,
        );
        const publicKey = ethers.SigningKey.recoverPublicKey(messageHash, sig);
        setRecoveredPublicKey(publicKey);

        console.log("Recovered public key:", publicKey);
        notify("success", "Message signed successfully! Deploying contract...");

        // Immediately deploy the contract after signing
        const response = await fetch("/api/wallet/deploy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ signature: sig }),
        });

        if (!response.ok) {
          notify("error", "Failed to deploy ECDSA contract");
          return;
        }

        const result = await response.json();
        console.log("Deploy response:", result);

        if (result.success && result.contractAddress) {
          setWalletContractAddress(result.contractAddress);
          notify("success", "Contract deployed successfully!");
        }

        // Automatically check balance after deployment
        setTimeout(() => {
          handleCheckContractBalance();
        }, 1000);
      } catch (error) {
        console.error("Sign and deploy error:", error);
        notify("error", "Failed to sign message or deploy contract");
      } finally {
        setIsDeployingContract(false);
      }
      return;
    }

    // If user has already signed, just deploy
    setIsDeployingContract(true);
    try {
      // call api/wallet/deploy with signature
      const response = await fetch("/api/wallet/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ signature }),
      });

      if (!response.ok) {
        notify("error", "Failed to deploy ECDSA contract");
        return;
      }

      const result = await response.json();
      console.log("Deploy response:", result);

      if (result.success && result.contractAddress) {
        setWalletContractAddress(result.contractAddress);
        notify("success", "Contract deployed successfully!");
      }

      // Automatically check balance after deployment
      setTimeout(() => {
        handleCheckContractBalance();
      }, 1000);
    } catch (error) {
      console.error("Deploy contract error:", error);
      notify("error", "Failed to deploy ECDSA contract");
    } finally {
      setIsDeployingContract(false);
    }
  };

  const handleCheckContractBalance = async () => {
    if (!walletContractAddress) {
      // notify("error", "No deployed contract found");
      return;
    }

    setIsLoadingBalance(true);
    try {
      // Prepare token list: native + optional extras (comma-separated)
      const nativeId =
        process.env.NEXT_PUBLIC_STELLAR_NATIVE_CONTRACT_ID ||
        "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
      const extra = (process.env.NEXT_PUBLIC_STELLAR_TOKEN_CONTRACT_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const tokenIds = [nativeId, ...extra];

      const balances = await getContractBalances(
        walletContractAddress,
        tokenIds,
      );
      console.log("balances:", balances);
      setTokenBalances(balances);

      // Update displayed native balance (convert stroops->XLM)
      const raw = balances[nativeId];
      const xlm = (Number(BigInt(raw)) / 10_000_000).toString();
      setContractBalance(xlm);

      // notify("success", `Contract balance: ${balance} XLM`);
    } catch (error) {
      console.error("Error checking contract balance:", error);
      notify("error", "Failed to get contract balance");
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const handleSendXLM = async () => {
    if (!walletContractAddress) {
      notify("error", "No deployed contract address");
      return;
    }

    if (!isConnected) {
      notify("error", "Please connect your wallet first");
      return;
    }

    const nativeContractId =
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    const faucetPublicKey = process.env.NEXT_PUBLIC_FAUCET_PUBLIC_KEY;

    if (!faucetPublicKey || typeof faucetPublicKey !== "string") {
      notify(
        "error",
        "Faucet public key is not configured. Set NEXT_PUBLIC_FAUCET_PUBLIC_KEY",
      );
      return;
    }

    if (!StrKey.isValidEd25519PublicKey(faucetPublicKey)) {
      notify(
        "error",
        "Faucet public key is invalid. It must be a Stellar G... public key.",
      );
      return;
    }

    if (!walletContractAddress.startsWith("C")) {
      notify(
        "error",
        "Contract address looks invalid. Expected a Stellar contract address starting with 'C'.",
      );
      return;
    }

    const txHash = await handleTxWithWalletBackend(
      {
        contractId: nativeContractId,
        functionName: "transfer",
        args: [
          // transfer(from, to, amount)
          Address.fromString(walletContractAddress).toScVal(),
          Address.fromString(faucetPublicKey).toScVal(),
          xdr.ScVal.scvI128(
            new xdr.Int128Parts({
              // 0.1 XLM = 1_000_000 stroops
              lo: xdr.Uint64.fromString("1000000"),
              hi: xdr.Int64.fromString("0"),
            }),
          ),
        ],
        description: "XLM transfer",
        onSuccess: (hash: string) => {
          setLastTransactionHash(hash);
          // Refresh balance after transfer
          setTimeout(() => {
            handleCheckContractBalance();
          }, 2000);
        },
      },
      walletContractAddress,
      signMessage,
      setIsSendingXLM,
      setIsSigningSendTransaction,
      notify,
    );
  };

  const handleRequestFaucet = async () => {
    if (!isConnected) {
      notify("error", "Please connect your wallet first");
      return;
    }

    if (!walletContractAddress) {
      notify("error", "Please deploy an ECDSA contract first");
      return;
    }

    setIsRequestingFaucet(true);
    try {
      console.log(
        "Requesting 10 XLM from faucet for contract address:",
        walletContractAddress,
      );

      // request faucet from /api/faucet with contract address
      const response = await fetch("/api/wallet/faucet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientAddress: walletContractAddress,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || "Faucet request failed",
          details: result.details,
        };
      }

      console.log("✅ Faucet request successful:", result.hash);
      notify(
        "success",
        `10 XLM sent successfully! Transaction hash: ${result.hash}`,
      );

      // Wait a bit then check balance
      setTimeout(async () => {
        await handleCheckContractBalance();
      }, 2000);
    } catch (error) {
      console.error("Faucet request error:", error);
      notify(
        "error",
        "Failed to request XLM from faucet: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setIsRequestingFaucet(false);
    }
  };

  const handleVoteWithEcdsaContract = async () => {
    if (!voteChoice) {
      notify("error", "Please select a vote choice (Chicken or Egg)");
      return;
    }

    if (!walletContractAddress) {
      notify("error", "Please deploy an ECDSA contract first");
      return;
    }

    if (!isConnected) {
      notify("error", "Please connect your wallet first");
      return;
    }

    const voteContractId = process.env.NEXT_PUBLIC_STELLAR_VOTE_CONTRACT_ID!;

    const txHash = await handleTxWithWalletBackend(
      {
        contractId: voteContractId,
        functionName: "vote",
        args: [
          Address.fromString(walletContractAddress).toScVal(),
          xdr.ScVal.scvBool(voteChoice === "chicken"),
        ],
        description: "Vote submission",
        onSuccess: (hash: string) => {
          setLastTransactionHash(hash);
          setVoteChoice(null); // Reset vote choice
        },
      },
      walletContractAddress,
      signMessage,
      setIsVotingWithEcdsaContract,
      setIsSigningAuthHash,
      notify,
    );
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify("success", `${label} copied to clipboard`);
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <RootStyle>
      <div className="flex flex-col h-full p-6 space-y-6 overflow-auto scrollbar-hide">
        {/* Header Section */}
        <motion.div
          className="text-center space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex justify-center">
            <Image
              src="/assets/svg/human.tech.logo.svg"
              alt="Human.tech logo"
              width={120}
              height={40}
              className="mb-4"
            />
          </div>
          {/* <h1 className="text-black font-pp-hatton text-[32px] font-semibold">
            Human Wallet Showcase
          </h1>
          <p className="text-gray-600 text-[16px] leading-[24px] max-w-md mx-auto">
            Experience seamless Web3 interactions with Human Wallet&apos;s
            powerful SDK
          </p> */}
        </motion.div>

        {/* Connection Status */}
        <motion.div
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <h2 className="text-[20px] font-semibold mb-4">Wallet Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Status:</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isConnected
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>

            {isConnected && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Address:</span>
                  <button
                    onClick={() => copyToClipboard(address, "Address")}
                    className="text-blue-600 hover:text-blue-800 font-mono text-sm cursor-pointer"
                  >
                    {truncateAddress(address)}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Chain ID:</span>
                  <span className="font-mono text-sm">{chainId}</span>
                </div>

                {walletName && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Wallet:</span>
                    <span className="text-sm">{walletName}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>

        {/* Wallet Actions */}
        <motion.div
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="text-[20px] font-semibold mb-4">
            Human Wallet 🤝 Stellar
          </h2>

          {!isConnected ? (
            <motion.button
              className="w-full h-[44px] px-[20px] py-[10px] bg-black text-white rounded-[8px] font-medium cursor-pointer"
              onClick={handleLogin}
              whileHover={{ backgroundColor: "#333", scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Connect Human Wallet
            </motion.button>
          ) : (
            <div className="space-y-4">
              {/* Message Signing */}
              <div>
                {/* {signature && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Signature:
                    </p>
                    <button
                      onClick={() => copyToClipboard(signature, "Signature")}
                      className="text-xs font-mono text-gray-600 hover:text-gray-800 break-all cursor-pointer"
                    >
                      {signature}
                    </button>
                  </div>
                )} */}

                {/* {recoveredPublicKey && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Recovered Public Key:
                    </p>
                    <button
                      onClick={() =>
                        copyToClipboard(recoveredPublicKey, "Public Key")
                      }
                      className="text-xs font-mono text-blue-600 hover:text-blue-800 break-all cursor-pointer"
                    >
                      {recoveredPublicKey}
                    </button>
                  </div>
                )} */}

                {/* {formattedPublicKey && (
                  <div className="mt-3 p-3 bg-green-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Formatted Public Key:
                    </p>
                    <button
                      onClick={() =>
                        copyToClipboard(formattedPublicKey, "Formatted Public Key")
                      }
                      className="text-xs font-mono text-green-600 hover:text-green-800 break-all cursor-pointer whitespace-pre-wrap"
                    >
                      {formattedPublicKey}
                    </button>
                  </div>
                )} */}
              </div>

              {/* Stellar ECDSA Contract Deployment */}
              <div>
                <h3 className="text-[16px] font-medium mb-2">
                  Stellar Contract Wallet
                </h3>

                {/* Show deployment status */}
                {isCheckingExistingDeployment && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-700">
                      Checking for existing ECDSA SCW...
                    </p>
                  </div>
                )}

                {walletContractAddress && (
                  <div className="p-3 bg-green-50 rounded-lg">
                    {/* <p className="text-sm font-medium text-green-700 mb-1">
                      ✅ ECDSA SCW Found:
                    </p> */}
                    <button
                      onClick={() =>
                        copyToClipboard(
                          walletContractAddress,
                          "Contract Address",
                        )
                      }
                      className="text-xs font-mono text-green-600 hover:text-green-800 break-all cursor-pointer"
                    >
                      {walletContractAddress}
                    </button>
                  </div>
                )}

                {!isCheckingExistingDeployment &&
                  !walletContractAddress &&
                  hasCheckedExistingDeployment && (
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <p className="text-sm text-yellow-700">
                        No Stellar contract wallet deployed yet. Get one now.
                      </p>
                    </div>
                  )}

                <div className="space-y-3">
                  {/* Deploy new contract - only show if no existing contract */}
                  {!walletContractAddress && (
                    <motion.button
                      className="w-full mt-4 px-4 py-2 bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      onClick={handleDeployEcdsaContract}
                      disabled={isDeployingContract}
                      whileHover={
                        !isDeployingContract
                          ? { backgroundColor: "#059669", scale: 1.02 }
                          : {}
                      }
                      whileTap={!isDeployingContract ? { scale: 0.98 } : {}}
                    >
                      {isDeployingContract
                        ? "Signing & Deploying..."
                        : "Sign & Deploy ECDSA SCW"}
                    </motion.button>
                  )}

                  {/* Assets */}
                  <div className="space-y-3 mt-8">
                    <h3 className="text-[16px] font-medium mb-2">Assets</h3>

                    {walletContractAddress && (
                      <div className="space-y-3">
                        {/* Contract Balance */}
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-300">
                              Balance:
                            </span>
                            <motion.button
                              className="p-1 text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              onClick={handleCheckContractBalance}
                              disabled={isLoadingBalance}
                              whileHover={
                                !isLoadingBalance ? { scale: 1.1 } : {}
                              }
                              whileTap={!isLoadingBalance ? { scale: 0.9 } : {}}
                              title="Refresh Balance"
                            >
                              {isLoadingBalance ? (
                                <svg
                                  className="w-4 h-4 animate-spin"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                              ) : (
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                              )}
                            </motion.button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-lg font-mono text-blue-600">
                              {isLoadingBalance
                                ? "Loading..."
                                : `${contractBalance} XLM`}
                            </div>
                          </div>
                        </div>

                        {/* XLM Transfer Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                          <motion.button
                            className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            onClick={handleRequestFaucet}
                            disabled={isRequestingFaucet}
                            whileHover={
                              !isRequestingFaucet
                                ? { backgroundColor: "#ea580c", scale: 1.02 }
                                : {}
                            }
                            whileTap={
                              !isRequestingFaucet ? { scale: 0.98 } : {}
                            }
                          >
                            {isRequestingFaucet
                              ? "Requesting..."
                              : "Request 10 XLM"}
                          </motion.button>

                          <motion.button
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            onClick={handleSendXLM}
                            disabled={isSendingXLM || isSigningSendTransaction}
                            whileHover={
                              !isSendingXLM && !isSigningSendTransaction
                                ? { backgroundColor: "#ea580c", scale: 1.02 }
                                : {}
                            }
                            whileTap={
                              !isSendingXLM && !isSigningSendTransaction
                                ? { scale: 0.98 }
                                : {}
                            }
                          >
                            {isSigningSendTransaction
                              ? "Signing..."
                              : isSendingXLM
                                ? "Sending..."
                                : "Send 0.1 XLM"}
                          </motion.button>
                        </div>

                        {/* Transaction Check Button */}
                        {/* {lastTransactionHash && (
                          <motion.button
                            className="w-full px-3 py-2 bg-purple-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            onClick={handleCheckTransactionDetails}
                            disabled={isCheckingTransaction}
                            whileHover={!isCheckingTransaction ? { backgroundColor: "#7c3aed", scale: 1.02 } : {}}
                            whileTap={!isCheckingTransaction ? { scale: 0.98 } : {}}
                          >
                            {isCheckingTransaction ? "Checking..." : "Check Transaction Details"}
                          </motion.button>
                        )} */}
                      </div>
                    )}
                  </div>

                  {/* Vote with ECDSA SCW */}
                  {walletContractAddress && (
                    <div className="space-y-3 mt-8">
                      <h3 className="text-[16px] font-medium mb-2 mt-4">
                        Invoke a vote contract
                      </h3>
                      <h4 className="text-sm font-medium text-gray-700">
                        Vote Choice:
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <motion.button
                          className={`px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer ${
                            voteChoice === "chicken"
                              ? "bg-yellow-50 border-yellow-200 text-yellow-800"
                              : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                          }`}
                          onClick={() => setVoteChoice("chicken")}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          🐔 Chicken
                        </motion.button>
                        <motion.button
                          className={`px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer ${
                            voteChoice === "egg"
                              ? "bg-blue-50 border-blue-200 text-blue-800"
                              : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                          }`}
                          onClick={() => setVoteChoice("egg")}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          🥚 Egg
                        </motion.button>
                      </div>
                      <motion.button
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        onClick={handleVoteWithEcdsaContract}
                        disabled={
                          isVotingWithEcdsaContract ||
                          isSigningAuthHash ||
                          !voteChoice
                        }
                        whileHover={
                          !isVotingWithEcdsaContract &&
                          !isSigningAuthHash &&
                          voteChoice
                            ? { backgroundColor: "#059669", scale: 1.02 }
                            : {}
                        }
                        whileTap={
                          !isVotingWithEcdsaContract &&
                          !isSigningAuthHash &&
                          voteChoice
                            ? { scale: 0.98 }
                            : {}
                        }
                      >
                        {isSigningAuthHash
                          ? "Signing Transaction..."
                          : isVotingWithEcdsaContract
                            ? "Voting..."
                            : "Vote with ECDSA SCW"}
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>

              {/* Disconnect */}
              <div className="mt-16"></div>
              <motion.button
                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg font-medium cursor-pointer"
                onClick={handleLogout}
                whileHover={{ backgroundColor: "#dc2626", scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Disconnect Wallet
              </motion.button>
            </div>
          )}
        </motion.div>
      </div>
    </RootStyle>
  );
}
