# WaaP on Stellar

Please refer to [`stellar` branch](https://github.com/holosoe/Human-Wallet-On-Stellar/tree/stellar) of this repo for the on-going work.

Work-in-progress documentation is [accessible here](https://docs.google.com/document/d/1hoeo0HDstiABZua-FJJlE8AUoPmqkQPSJgEM2ez8UgQ/edit?usp=sharing).

## Embedded wallet experience

WaaP offers an embedded wallet experience to seamlessly onboard users to Stellar.

WaaP removes complexities and UX frictions of activating wallets for users while ensuring self-custody and security with 2PC technology.

WaaP can be integrated via a few lines of code. More info here: https://docs.waap.xyz

## WaaP 🤝 Stellar

Via WaaP, users can deploy a smart contract wallet on Stellar accessing the tools and services in the Stellar ecosystem.

## Features

- **ECDSA Secp256k1 Smart Contract Wallet**: Deploy Soroban smart contract wallets using existing Ethereum keys
- **Gasless Transactions**: Users don't need XLM to interact with the blockchain - fees are sponsored via wallet backend
- **Social Authentication**: Support for Google, Twitter, Discord, and GitHub login methods

---

## How It Works

### 1. ECDSA Secp256k1 Smart Contract Wallet

WaaP deploys Soroban smart contract wallets that are controlled by the user's existing Ethereum/secp256k1 key. This enables seamless onboarding of users to Stellar with the embedded UX.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                     Factory Contract                           │
│  (ECDSA Secp256k1 Factory - deployed once per network)         │
│                                                                 │
│  • Stores WASM hash of wallet contract                         │
│  • Tracks all deployed wallets by Ethereum address             │
│  • deploy(salt, publicKey) → deploys new wallet instance       │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ deploys
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Wallet Contract                            │
│  (One per user - controlled by their secp256k1 key)            │
│                                                                 │
│  • Stores owner's 65-byte uncompressed public key              │
│  • __check_auth() validates Ethereum-style signatures          │
│  • Supports EIP-191 personal_sign message format               │
│  • Can receive/send tokens and interact with Soroban dApps     │
└─────────────────────────────────────────────────────────────────┘
```

**Signature Verification:**

The wallet contract verifies signatures using Ethereum's `personal_sign` format:

1. The Soroban auth hash is computed from the transaction context
2. The user signs the message `"auth hash: <hex>"` using their Ethereum wallet
3. The contract reconstructs the EIP-191 prefixed message: `"\x19Ethereum Signed Message:\n75auth hash: <hex>"`
4. Keccak-256 hash is computed and the public key is recovered via `secp256k1_recover`
5. The recovered key is compared against the stored owner's public key

**Source Code:**
- [Factory Contract](./contracts/contract-ecdsa-secp256k1-factory/src/lib.rs)
- [Wallet Contract](./contracts/contract-ecdsa-secp256k1/src/lib.rs)

---

### 2. Integration with Wallet Backend for Gasless Transactions

Users can interact with Stellar without holding XLM through the Wallet Backend service, which sponsors transaction fees.

**Flow:**

```
┌───────────┐    1. Build & Sign Auth    ┌───────────────┐
│   User    │ ──────────────────────────▶│   Frontend    │
│  (WaaP)   │                            │   (Next.js)   │
└───────────┘                            └───────┬───────┘
                                                 │
                    2. Simulate & prepare tx     │
                                                 ▼
                                         ┌───────────────┐
                    3. Sign transaction  │  Internal API │
                         on server       │  (/api/...)   │
                                         └───────┬───────┘
                                                 │
                    4. Create fee-bump tx        │
                                                 ▼
                                         ┌───────────────┐
                    5. Sponsor signs     │Wallet Backend │
                         fee-bump        │   (Railway)   │
                                         └───────┬───────┘
                                                 │
                    6. Submit to network         │
                                                 ▼
                                         ┌───────────────┐
                                         │   Horizon /   │
                                         │  Soroban RPC  │
                                         └───────────────┘
```

**Key Components:**

| Component | Purpose |
|-----------|---------|
| `walletBackendHelpers.ts` | Handles transaction building, simulation, and fee-bump creation |
| `/api/wallet-backend/tx/sign` | Server-side transaction signing |
| `/api/wallet-backend/tx/create-fee-bump` | Creates fee-bump transactions via wallet backend |
| `/api/wallet-backend/account/register` | Registers accounts for sponsorship |

**How Fee Sponsorship Works:**

1. **Transaction Building**: The frontend builds a Soroban transaction with the user's contract wallet as the source
2. **Simulation**: The transaction is simulated to compute required resources
3. **Auth Signing**: The user signs the authorization payload with their Ethereum wallet
4. **Server Signing**: The source account signs the assembled transaction server-side
5. **Fee-Bump Creation**: The wallet backend wraps the transaction in a fee-bump, paying the fees with its own account
6. **Submission**: The fee-bumped transaction is submitted to Horizon

**Source Code:**
- [Wallet Backend Helpers](./src/lib/walletBackendHelpers.ts)
- [Fee-Bump API Route](./src/app/api/wallet-backend/tx/create-fee-bump/route.ts)

## Integration with Human ID

Human ID offers sybil resistance through privacy-preserving KYC. This privacy-preserving attestation is then minted as a SBT on Stellar.

More info about Human ID on Stellar: https://docs.holonym.id/stellar
