#![cfg(test)]
extern crate std;

use k256::ecdsa::{SigningKey, VerifyingKey, signature::Signer};
use k256::elliptic_curve::rand_core::OsRng;
use soroban_sdk::{testutils::BytesN as _, BytesN, Env, vec, Error, Bytes};
use crate::EcdsaAccount;
use crate::EcdsaAccountClient;

#[test]
fn test_eth_compat_signature() {
    let env = Env::default();
    let account_contract = EcdsaAccountClient::new(&env, &env.register(EcdsaAccount, ()));

    // Generate secp256k1 keypair (same as Ethereum)
    let signing_key = SigningKey::random(&mut OsRng);
    let verifying_key = VerifyingKey::from(&signing_key);
    
    // Get the uncompressed public key (65 bytes) - same format as Ethereum
    let public_key_bytes: [u8; 65] = verifying_key.to_encoded_point(false).as_bytes().try_into().unwrap();
    let public_key = BytesN::from_array(&env, &public_key_bytes);
    account_contract.init(&public_key);

    // Create a random 32-byte payload (like an Ethereum message hash)
    let payload = BytesN::<32>::random(&env);
    let payload_bytes = payload.to_array();

    // Convert the 32-byte payload to a hex string (66 characters including 0x prefix)
    let mut hex_string = [0u8; 66];
    hex_string[0] = 0x30; // '0'
    hex_string[1] = 0x78; // 'x'
    for i in 0..32 {
        let byte = payload_bytes[i];
        let high_nibble = (byte >> 4) & 0x0F;
        let low_nibble = byte & 0x0F;
        
        // Convert to ASCII hex characters
        hex_string[i * 2 + 2] = if high_nibble < 10 { high_nibble + 0x30 } else { high_nibble - 10 + 0x61 };
        hex_string[i * 2 + 3] = if low_nibble < 10 { low_nibble + 0x30 } else { low_nibble - 10 + 0x61 };
    }

    // Construct the Ethereum personal_sign message: "\x19Ethereum Signed Message:\n66" + hex_string
    let mut message_bytes = [0u8; 26 + 2 + 66];
    let mut idx = 0;
    let prefix = b"\x19Ethereum Signed Message:\n66";
    for b in prefix.iter() { message_bytes[idx] = *b; idx += 1; }
    // Add the hex string
    for b in hex_string.iter() { message_bytes[idx] = *b; idx += 1; }

    // Hash the message with Keccak-256 (same as Ethereum personal_sign)
    let message = Bytes::from_slice(&env, &message_bytes);
    let message_hash = env.crypto().keccak256(&message);
    let message_hash_bytes = message_hash.to_array();

    // Sign the hash using Ethereum-style recoverable signature
    let (signature, recovery_id) = signing_key.sign_prehash_recoverable(&message_hash_bytes).unwrap();
    let signature_bytes = signature.to_bytes();
    
    // Format as Ethereum signature: r (32 bytes) + s (32 bytes) + v (1 byte)
    let mut eth_signature = [0u8; 65];
    eth_signature[..32].copy_from_slice(&signature_bytes[..32]); // r
    eth_signature[32..64].copy_from_slice(&signature_bytes[32..64]); // s
    eth_signature[64] = recovery_id.to_byte(); // v (recovery_id)
    
    let signature = BytesN::from_array(&env, &eth_signature);

    // Should verify
    env.try_invoke_contract_check_auth::<Error>(
        &account_contract.address,
        &payload,
        signature.into(),
        &vec![&env],
    )
    .unwrap();
} 