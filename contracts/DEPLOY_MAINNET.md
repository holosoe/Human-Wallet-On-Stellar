# 🚀 Stellar Soroban Mainnet Deployment Guide

## Prerequisites

### 1. Verify Your Key is Configured

```bash
stellar keys show soe
```

### 2. Fund Your Account on MAINNET

> [!WARNING]
> `stellar keys fund` does **NOT** work on mainnet. You must manually send XLM to your account.

Get your public address:
```bash
stellar keys address soe
```

Fund this address via:
- An exchange (Binance, Coinbase, Kraken, etc.)
- StellarX (https://stellarx.com)
- Another funded Stellar wallet

You'll need at least **2-3 XLM** for deployment fees.

---

## Deployment Steps

### Step 1: Build the Contracts

```bash
cd contracts
make build
```

This compiles and optimizes all 3 contracts:
- `chicken_v_egg`
- `ecdsa_secp256k1_factory`
- `ecdsa_secp256k1`

Output will be in the `out/` directory as `.optimized.wasm` files.

### Step 2: Deploy to Mainnet

```bash
make deploy-all-mainnet
```

This will:
- Give you a 5-second warning before deploying
- Deploy `chicken_v_egg` contract
- Deploy `ecdsa_secp256k1_factory` contract
- Upload `ecdsa_secp256k1` WASM (the factory uses this)

> [!IMPORTANT]
> **Save the output!** You'll get contract addresses and WASM hash that you need for the next step.

### Step 3: Initialize the Factory

Set your environment variables with values from Step 2:
```bash
export ECDSA_SECP256K1_FACTORY=<factory_address_from_step2>
export ECDSA_SECP256K1_WASM=<wasm_hash_from_step2>
```

Then initialize:
```bash
make init-mainnet
```

### Step 4: Update Makefile (Optional)

Update lines 13-15 in your `Makefile` with the mainnet addresses for future reference:
```makefile
export CHICKEN_V_EGG_MAINNET=<your_new_address>
export ECDSA_SECP256K1_FACTORY_MAINNET=<your_new_address>
export ECDSA_SECP256K1_WASM_MAINNET=<your_wasm_hash>
```

---

## Quick Reference Commands

| Action | Command |
|--------|---------|
| Build contracts | `make build` |
| Deploy all to mainnet | `make deploy-all-mainnet` |
| Deploy only chicken | `make deploy-chicken-mainnet` |
| Deploy only factory | `make deploy-factory-mainnet` |
| Upload only ecdsa WASM | `make upload-ecdsa-mainnet` |
| Initialize factory | `make init-mainnet` |

---

## Verify Your Deployment

After deployment, check your contracts on:
- **Stellar Expert**: https://stellar.expert/explorer/public
- **Stellar Laboratory**: https://laboratory.stellar.org

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Account not found" | Your account needs to be funded on mainnet |
| "Insufficient balance" | You need more XLM in your account |
| "Network mismatch" | Make sure you're using `--network mainnet` consistently |
| "Contract already deployed" | The contract address already exists (this is fine if redeploying) |

---

## Example Full Session

```bash
# 1. Navigate to contracts directory
cd contracts

# 2. Build all contracts
make build

# 3. Check your account balance (must be funded manually on mainnet)
stellar keys address soe  # Use this address to fund via exchange

# 4. Deploy all contracts (wait for funding first!)
make deploy-all-mainnet

# 5. Save the output, then set environment variables
export ECDSA_SECP256K1_FACTORY=<new_factory_address>
export ECDSA_SECP256K1_WASM=<wasm_hash_from_upload>

# 6. Initialize factory
make init-mainnet
```


Chicken v Egg	
CDL6PCMNFU274ZMCBXA7KPV626DIDEJRN4U4ZFATAF7D6HTROH4WMLUU

ECDSA Factory	
CDSWLTRFE2HCDJIX6IMZU23AB752K7I5BI2CVVXX5NX2B7NWHWIPIXIM

ECDSA WASM Hash	b0f46d8e286c8f77f18ec6acb061c7487fcbc08ed9220ee28159ebed3e6aef33

Successfully deployed all 3 contracts to Stellar mainnet: Factory (CDSWLTRFE2HCDJIX6IMZU23AB752K7I5BI2CVVXX5NX2B7NWHWIPIXIM), Chicken v Egg (CDL6PCMNFU274ZMCBXA7KPV626DIDEJRN4U4ZFATAF7D6HTROH4WMLUU), and uploaded ECDSA WASM (hash: b0f46d8e286c8f77f18ec6acb061c7487fcbc08ed9220ee28159ebed3e6aef33). Factory initialized successfully.