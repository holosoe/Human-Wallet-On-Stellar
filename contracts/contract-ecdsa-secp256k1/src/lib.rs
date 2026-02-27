//! This a minimal exapmle of an account contract.
//!
//! The account is owned by a single secp256k1 public key that is also used for
//! authentication.
//!
//! For a more advanced example that demonstrates all the capabilities of the
//! Soroban account contracts see `src/account` example.
#![no_std]

#[contract]
struct EcdsaAccount;

use soroban_sdk::{
    auth::Context, contract, contracterror, contractimpl, crypto::Hash, symbol_short, Address,
    Bytes, BytesN, Env, IntoVal, String, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum Error {
    NotInited = 1,
    AlreadyInited = 2,
    Secp256k1VerifyFailed = 3,
}

const STORAGE_KEY_ETH_ADDRESS: Symbol = symbol_short!("ethaddr");

#[contractimpl]
impl EcdsaAccount {
    pub fn extend_ttl(env: Env) {
        let max_ttl = env.storage().max_ttl();
        let contract_address = env.current_contract_address();

        env.storage().instance().extend_ttl(max_ttl, max_ttl);
        env.deployer()
            .extend_ttl(contract_address.clone(), max_ttl, max_ttl);
        env.deployer()
            .extend_ttl_for_code(contract_address.clone(), max_ttl, max_ttl);
        env.deployer()
            .extend_ttl_for_contract_instance(contract_address.clone(), max_ttl, max_ttl);
    }

    // Initialize the contract with an owner's Ethereum address (20 bytes).
    pub fn init(env: Env, eth_address: BytesN<20>) -> Result<(), Error> {
        if env.storage().instance().has(&STORAGE_KEY_ETH_ADDRESS) {
            return Err(Error::AlreadyInited);
        }

        env.storage().instance().set(&STORAGE_KEY_ETH_ADDRESS, &eth_address);

        Self::extend_ttl(env);

        Ok(())
    }

    // This is the 'entry point' of the account contract and every account
    // contract has to implement it. `require_auth` calls for the Address of
    // this contract will result in calling this `__check_auth` function with
    // the appropriate arguments.
    //
    // This should return `()` if authentication and authorization checks have
    // been passed and return an error (or panic) otherwise.
    //
    // `__check_auth` takes the payload that needed to be signed, arbitrarily
    // typed signatures (`BytesN<65>` type here) and authorization
    // context that contains all the invocations that this call tries to verify
    // (not used in this example).
    //
    // In this example `__check_auth` only verifies the signature.
    //
    // Note, that `__check_auth` function shouldn't call `require_auth` on the
    // contract's own address in order to avoid infinite recursion.
    #[allow(non_snake_case)]
    pub fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: BytesN<65>,
        _auth_context: Vec<Context>,
    ) -> Result<(), Error> {
        let stored_eth_address: BytesN<20> = env
            .storage()
            .instance()
            .get(&STORAGE_KEY_ETH_ADDRESS)
            .ok_or(Error::NotInited)?;

        // Extract the signature (first 64 bytes) and recovery_id (last byte)
        let signature_array = signature.to_array();
        let mut signature_bytes = [0u8; 64];
        signature_bytes.copy_from_slice(&signature_array[..64]);
        let signature_bytes = BytesN::from_array(&env, &signature_bytes);
        let recovery_id = signature_array[64] as u32;

        // For personal_sign, we need to reconstruct the Ethereum message prefix
        // Format: "\x19Ethereum Signed Message:\n75auth hash: <64 hex characters>"
        let payload_array = signature_payload.to_array();
        let mut message_bytes = [0u8; 103]; // 26 prefix + 2 length + 11 "auth hash: " + 64 hex

        // Add the prefix
        let prefix = b"\x19Ethereum Signed Message:\n75auth hash: ";
        message_bytes[..39].copy_from_slice(prefix);

        // Add the hex string
        const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";
        for i in 0..32 {
            let byte = payload_array[i];
            message_bytes[39 + i * 2] = HEX_CHARS[(byte >> 4) as usize];
            message_bytes[39 + i * 2 + 1] = HEX_CHARS[(byte & 0x0F) as usize];
        }

        // Create Bytes from the array
        let message = Bytes::from_slice(&env, &message_bytes);

        // Hash the complete message with Keccak-256 (same as Ethereum)
        let message_hash = env.crypto().keccak256(&message);

        // Recover the public key from the signature using the message hash
        let recovered_public_key =
            env.crypto()
                .secp256k1_recover(&message_hash, &signature_bytes, recovery_id);

        // Verify that the recovered public key matches the stored Ethereum address
        // The uncompressed public key is 65 bytes (0x04 format byte + 64 bytes)
        let recovered_array = recovered_public_key.to_array();

        // Extract the 64 bytes of the public key (skip the 0x04 format byte)
        let pk_hash = env.crypto().keccak256(&Bytes::from_slice(&env, &recovered_array[1..65]));
        let pk_hash_array = pk_hash.to_array();

        // Extract the last 20 bytes for the Ethereum address
        let mut recovered_address = [0u8; 20];
        recovered_address.copy_from_slice(&pk_hash_array[12..32]);

        let stored_array = stored_eth_address.to_array();

        // Direct comparison
        if recovered_address != stored_array {
            panic!("Mismatch! Recovered: {:?}, Stored: {:?}", recovered_address, stored_array);
        }

        Self::extend_ttl(env);

        Ok(())
    }
}

mod test;
