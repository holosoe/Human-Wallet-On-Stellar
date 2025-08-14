#![cfg(test)]

use super::*;
use soroban_sdk::{
    symbol_short, vec, Address, BytesN, Env, Symbol, testutils::{Address as _, BytesN as _}, Val, TryFromVal
};

#[test]
fn test_init() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);

    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    client.init(&wasm_hash);

    let stored_hash = client.get_wasm_hash();
    assert_eq!(stored_hash, wasm_hash);

    let owner = client.get_owner();
    assert_eq!(owner, contract_id);

    let history = client.get_wasm_hash_history();
    let first = BytesN::<32>::try_from_val(&env, &history.get(0).unwrap()).unwrap();
    assert_eq!(first, wasm_hash);
}

#[test]
#[should_panic]
fn test_init_already_initialized() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);

    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    client.init(&wasm_hash);
    client.init(&wasm_hash);
}

#[test]
fn test_update_wasm_hash() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);

    let wasm_hash_v1 = BytesN::from_array(&env, &[1u8; 32]);
    let wasm_hash_v2 = BytesN::from_array(&env, &[2u8; 32]);
    client.init(&wasm_hash_v1);
    client.update_wasm_hash(&wasm_hash_v2);

    let current_hash = client.get_wasm_hash();
    assert_eq!(current_hash, wasm_hash_v2);

    let history = client.get_wasm_hash_history();
    let first = BytesN::<32>::try_from_val(&env, &history.get(0).unwrap()).unwrap();
    let second = BytesN::<32>::try_from_val(&env, &history.get(1).unwrap()).unwrap();
    assert_eq!(first, wasm_hash_v1);
    assert_eq!(second, wasm_hash_v2);
}

#[test]
fn test_update_wasm_hash_same_hash() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);

    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    client.init(&wasm_hash);
    client.update_wasm_hash(&wasm_hash);

    let history = client.get_wasm_hash_history();
    let first = BytesN::<32>::try_from_val(&env, &history.get(0).unwrap()).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(first, wasm_hash);
}

#[test]
#[should_panic]
fn test_update_wasm_hash_not_initialized_panics() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    client.update_wasm_hash(&wasm_hash);
}

#[test]
fn test_transfer_ownership() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    client.init(&wasm_hash);
    let initial_owner = client.get_owner();
    assert_eq!(initial_owner, contract_id);
    let new_owner = Address::generate(&env);
    client.transfer_ownership(&new_owner);
    let current_owner = client.get_owner();
    assert_eq!(current_owner, new_owner);
}

#[test]
#[should_panic]
fn test_get_wasm_hash_not_initialized_panics() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    client.get_wasm_hash();
}

#[test]
#[should_panic]
fn test_get_owner_not_initialized_panics() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    client.get_owner();
}

#[test]
#[should_panic]
fn test_get_deployment_count_not_initialized_panics() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    client.get_deployment_count();
}

#[test]
fn test_extend_ttl() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    client.extend_ttl();
}

#[test]
fn test_multiple_wasm_hash_updates() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    let wasm_hash_v1 = BytesN::from_array(&env, &[1u8; 32]);
    let wasm_hash_v2 = BytesN::from_array(&env, &[2u8; 32]);
    let wasm_hash_v3 = BytesN::from_array(&env, &[3u8; 32]);
    client.init(&wasm_hash_v1);
    client.update_wasm_hash(&wasm_hash_v2);
    client.update_wasm_hash(&wasm_hash_v3);
    let current_hash = client.get_wasm_hash();
    assert_eq!(current_hash, wasm_hash_v3);
    let history = client.get_wasm_hash_history();
    let first = BytesN::<32>::try_from_val(&env, &history.get(0).unwrap()).unwrap();
    let second = BytesN::<32>::try_from_val(&env, &history.get(1).unwrap()).unwrap();
    let third = BytesN::<32>::try_from_val(&env, &history.get(2).unwrap()).unwrap();
    assert_eq!(first, wasm_hash_v1);
    assert_eq!(second, wasm_hash_v2);
    assert_eq!(third, wasm_hash_v3);
}

#[test]
fn test_deployment_tracking() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    client.init(&wasm_hash);
    let count_before = client.get_deployment_count();
    assert_eq!(count_before, 0);
    let all_contracts = client.get_all_deployed_contracts();
    assert_eq!(all_contracts.len(), 0);
}

#[test]
#[should_panic]
fn test_get_deployed_contract_panics() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    client.init(&wasm_hash);
    let eth_address = BytesN::from_array(&env, &[1u8; 20]);
    client.get_deployed_contract(&eth_address);
} 