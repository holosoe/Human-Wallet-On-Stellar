export ADMIN_ACCOUNT=soe
export NETWORK=testnet

export CHICKEN_V_EGG=CDDZBYT5ZV7CQDCO6W74QVZF63K6HQOKWIATHCYO6QZJUJGCIBNNOUDG
export ECDSA_SECP256K1_FACTORY=CAVK6OBYT5BKLDBZZBUXBHFU5UCCQPHBCGDQPJFAUITZSON4EG76577M
export ECDSA_SECP256K1_WASM=b0f46d8e286c8f77f18ec6acb061c7487fcbc08ed9220ee28159ebed3e6aef33

# Mainnet contract addresses (deployed Dec 10, 2025)
export CHICKEN_V_EGG_MAINNET=CDL6PCMNFU274ZMCBXA7KPV626DIDEJRN4U4ZFATAF7D6HTROH4WMLUU
export ECDSA_SECP256K1_FACTORY_MAINNET=CDSWLTRFE2HCDJIX6IMZU23AB752K7I5BI2CVVXX5NX2B7NWHWIPIXIM
export ECDSA_SECP256K1_WASM_MAINNET=b0f46d8e286c8f77f18ec6acb061c7487fcbc08ed9220ee28159ebed3e6aef33

build:
	@cd contract-chicken-v-egg && stellar contract build --out-dir ../out
	@cd contract-ecdsa-secp256k1-factory && stellar contract build --out-dir ../out
	@cd contract-ecdsa-secp256k1 && stellar contract build --out-dir ../out

	stellar contract optimize --wasm ./out/chicken_v_egg.wasm
	stellar contract optimize --wasm ./out/ecdsa_secp256k1_factory.wasm
	stellar contract optimize --wasm ./out/ecdsa_secp256k1.wasm

	ls -lah out/*.optimized.wasm

deploy-all:
	stellar keys fund $(ADMIN_ACCOUNT) --network $(NETWORK) || true
	stellar contract deploy --wasm ./out/chicken_v_egg.optimized.wasm --network $(NETWORK) --source $(ADMIN_ACCOUNT)
	stellar contract deploy --wasm ./out/ecdsa_secp256k1_factory.optimized.wasm --network $(NETWORK) --source $(ADMIN_ACCOUNT)
	stellar contract upload --wasm ./out/ecdsa_secp256k1.optimized.wasm --network $(NETWORK) --source $(ADMIN_ACCOUNT)

deploy:
	stellar contract deploy --wasm ./out/ecdsa_secp256k1_factory.optimized.wasm --network $(NETWORK) --source $(ADMIN_ACCOUNT)

upload:
	stellar contract upload --wasm ./out/ecdsa_secp256k1.optimized.wasm --network $(NETWORK) --source $(ADMIN_ACCOUNT)

fmt:
	@cd contract-chicken-v-egg && cargo fmt --all
	@cd contract-ecdsa_secp256k1-factory && cargo fmt --all
	@cd contract-ecdsa_secp256k1 && cargo fmt --all

clean:
	@cd contract-chicken-v-egg && cargo clean
	@cd contract-ecdsa-secp256k1-factory && cargo clean
	@cd contract-ecdsa-secp256k1 && cargo clean

init:
	stellar network use testnet
	stellar contract invoke --id $(ECDSA_SECP256K1_FACTORY) --source-account $(ADMIN_ACCOUNT) -- init --wasm_hash $(ECDSA_SECP256K1_WASM)

# Mainnet deployment targets (fee in stroops: 1000000 = 0.1 XLM max fee)
deploy-all-mainnet:
	@echo "⚠️  WARNING: Deploying to MAINNET. Make sure your account is funded!"
	@echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	stellar contract deploy --wasm ./out/chicken_v_egg.optimized.wasm --network mainnet --source $(ADMIN_ACCOUNT) --fee 100000000
	stellar contract deploy --wasm ./out/ecdsa_secp256k1_factory.optimized.wasm --network mainnet --source $(ADMIN_ACCOUNT) --fee 100000000
	stellar contract upload --wasm ./out/ecdsa_secp256k1.optimized.wasm --network mainnet --source $(ADMIN_ACCOUNT) --fee 100000000

deploy-chicken-mainnet:
	@echo "⚠️  WARNING: Deploying to MAINNET"
	stellar contract deploy --wasm ./out/chicken_v_egg.optimized.wasm --network mainnet --source $(ADMIN_ACCOUNT) --fee 100000000

deploy-factory-mainnet:
	@echo "⚠️  WARNING: Deploying to MAINNET"
	stellar contract deploy --wasm ./out/ecdsa_secp256k1_factory.optimized.wasm --network mainnet --source $(ADMIN_ACCOUNT) --fee 100000000

upload-ecdsa-mainnet:
	@echo "⚠️  WARNING: Uploading to MAINNET"
	stellar contract upload --wasm ./out/ecdsa_secp256k1.optimized.wasm --network mainnet --source $(ADMIN_ACCOUNT) --fee 100000000

init-mainnet:
	@echo "⚠️  WARNING: Initializing on MAINNET"
	@echo "Make sure ECDSA_SECP256K1_FACTORY and ECDSA_SECP256K1_WASM are set for mainnet!"
	stellar network use mainnet
	stellar contract invoke --id $(ECDSA_SECP256K1_FACTORY) --source-account $(ADMIN_ACCOUNT) -- init --wasm_hash $(ECDSA_SECP256K1_WASM)