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

const STORAGE_KEY_PK: Symbol = symbol_short!("pk");

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

    // Initialize the contract with an owner's secp256k1 public key (uncompressed, 65 bytes).
    pub fn init(env: Env, public_key: BytesN<65>) -> Result<(), Error> {
        if env.storage().instance().has(&STORAGE_KEY_PK) {
            return Err(Error::AlreadyInited);
        }

        env.storage().instance().set(&STORAGE_KEY_PK, &public_key);

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
        let stored_public_key: BytesN<65> = env
            .storage()
            .instance()
            .get(&STORAGE_KEY_PK)
            .ok_or(Error::NotInited)?;

        // Extract the signature (first 64 bytes) and recovery_id (last byte)
        let signature_array = signature.to_array();
        let mut signature_bytes = [0u8; 64];
        signature_bytes.copy_from_slice(&signature_array[..64]);
        let signature_bytes = BytesN::from_array(&env, &signature_bytes);
        let recovery_id = signature_array[64] as u32;

        // For personal_sign, we need to reconstruct the Ethereum message prefix
        // The signature was created from: "\x19Ethereum Signed Message:\n" + length + "auth hash: " + hex_string
        let payload_array = signature_payload.to_array();

        // Convert the 32-byte payload to a hex string (64 characters)
        let mut hex_string = [0u8; 64];
        for i in 0..32 {
            let byte = payload_array[i];
            let high_nibble = (byte >> 4) & 0x0F;
            let low_nibble = byte & 0x0F;

            // Convert to ASCII hex characters
            hex_string[i * 2] = if high_nibble < 10 {
                high_nibble + 0x30
            } else {
                high_nibble - 10 + 0x61
            };
            hex_string[i * 2 + 1] = if low_nibble < 10 {
                low_nibble + 0x30
            } else {
                low_nibble - 10 + 0x61
            };
        }

        // Create the message string: "auth hash: " + hex_string (11 + 64 = 75 characters)
        let mut message_string = [0u8; 75];
        let mut msg_index = 0;

        // Add "auth hash: "
        message_string[msg_index] = 0x61;
        msg_index += 1; // a
        message_string[msg_index] = 0x75;
        msg_index += 1; // u
        message_string[msg_index] = 0x74;
        msg_index += 1; // t
        message_string[msg_index] = 0x68;
        msg_index += 1; // h
        message_string[msg_index] = 0x20;
        msg_index += 1; // space
        message_string[msg_index] = 0x68;
        msg_index += 1; // h
        message_string[msg_index] = 0x61;
        msg_index += 1; // a
        message_string[msg_index] = 0x73;
        msg_index += 1; // s
        message_string[msg_index] = 0x68;
        msg_index += 1; // h
        message_string[msg_index] = 0x3a;
        msg_index += 1; // :
        message_string[msg_index] = 0x20;
        msg_index += 1; // space

        // Add the hex string
        for i in 0..64 {
            message_string[msg_index] = hex_string[i];
            msg_index += 1;
        }

        // Create the Ethereum message prefix
        // Format: "\x19Ethereum Signed Message:\n" + length + message_string
        let mut message_bytes = [0u8; 109]; // 26 prefix + 2 length + 75 message_string
        let mut index = 0;

        // Add the prefix: "\x19Ethereum Signed Message:\n"
        message_bytes[index] = 0x19;
        index += 1; // \x19
        message_bytes[index] = 0x45;
        index += 1; // E
        message_bytes[index] = 0x74;
        index += 1; // t
        message_bytes[index] = 0x68;
        index += 1; // h
        message_bytes[index] = 0x65;
        index += 1; // e
        message_bytes[index] = 0x72;
        index += 1; // r
        message_bytes[index] = 0x65;
        index += 1; // e
        message_bytes[index] = 0x75;
        index += 1; // u
        message_bytes[index] = 0x6d;
        index += 1; // m
        message_bytes[index] = 0x20;
        index += 1; // space
        message_bytes[index] = 0x53;
        index += 1; // S
        message_bytes[index] = 0x69;
        index += 1; // i
        message_bytes[index] = 0x67;
        index += 1; // g
        message_bytes[index] = 0x6e;
        index += 1; // n
        message_bytes[index] = 0x65;
        index += 1; // e
        message_bytes[index] = 0x64;
        index += 1; // d
        message_bytes[index] = 0x20;
        index += 1; // space
        message_bytes[index] = 0x4d;
        index += 1; // M
        message_bytes[index] = 0x65;
        index += 1; // e
        message_bytes[index] = 0x73;
        index += 1; // s
        message_bytes[index] = 0x73;
        index += 1; // s
        message_bytes[index] = 0x61;
        index += 1; // a
        message_bytes[index] = 0x67;
        index += 1; // g
        message_bytes[index] = 0x65;
        index += 1; // e
        message_bytes[index] = 0x3a;
        index += 1; // :
        message_bytes[index] = 0x0a;
        index += 1; // \n

        // Add the length as ASCII string (75 = "75")
        message_bytes[index] = 0x37;
        index += 1; // "7"
        message_bytes[index] = 0x35;
        index += 1; // "5"

        // Add the message string (75 characters)
        for i in 0..75 {
            message_bytes[index] = message_string[i];
            index += 1;
        }

        // Create Bytes from the array
        let message = Bytes::from_slice(&env, &message_bytes[..index]);

        // Hash the complete message with Keccak-256 (same as Ethereum)
        let message_hash = env.crypto().keccak256(&message);

        // Recover the public key from the signature using the message hash
        let recovered_public_key =
            env.crypto()
                .secp256k1_recover(&message_hash, &signature_bytes, recovery_id);

        // Verify that the recovered public key matches the stored public key
        // Both are now uncompressed (65 bytes), so we can compare directly
        let recovered_array = recovered_public_key.to_array();
        let stored_array = stored_public_key.to_array();

        // Direct comparison of uncompressed public keys
        if recovered_array != stored_array {
            return Err(Error::Secp256k1VerifyFailed);
        }

        Self::extend_ttl(env);

        Ok(())
    }
}

mod test;
