export ADMIN_ACCOUNT=soe
export NETWORK=testnet
export CHICKEN_V_EGG=CDDDDTW7CU3DRJJPHQJDYLB2PPJKB5LTOWU4RKXXJOFZWVQMUIS4LNAL
export ECDSA_SECP256K1_FACTORY=CCQUNR6EIF6XF4CMSTCJ5TBPQD3KWJZXEXNPGOGF7RSN2EIW5D4UM5HK
# https://stellar.expert/explorer/testnet/contract/CBD633F4GCCK4KGIIDUADZKMLAKJ4X7JOOQQ4LMC2QNJAA5XIOBKNWPN
export ECDSA_SECP256K1_WASM=d74e42681defe3de5fd70bf9268eb5cadbb1a3345b06267ef50910a5a866aae8

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