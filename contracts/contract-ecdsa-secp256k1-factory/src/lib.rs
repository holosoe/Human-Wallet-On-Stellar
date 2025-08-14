#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, symbol_short, vec, Address, Bytes, BytesN, Env, Symbol, Map,
};

#[contract]
pub struct Contract;

#[contracterror]
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum Error {
    NotInited = 1,
    AlreadyInited = 2,
    InvalidWasmHash = 3,
    Unauthorized = 4,
}

const STORAGE_KEY_WASM_HASH: Symbol = symbol_short!("hash");
const STORAGE_KEY_WASM_HASH_HISTORY: Symbol = symbol_short!("hashes");
const STORAGE_KEY_OWNER: Symbol = symbol_short!("owner");
const STORAGE_KEY_DEPLOYED_CONTRACTS: Symbol = symbol_short!("deployed");

#[contractimpl]
impl Contract {
    fn check_owner(env: &Env) -> Result<(), Error> {
        let owner = env
            .storage()
            .instance()
            .get::<Symbol, Address>(&STORAGE_KEY_OWNER)
            .ok_or(Error::NotInited)?;
        
        if env.current_contract_address() != owner {
            return Err(Error::Unauthorized);
        }
        
        Ok(())
    }

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
    
    pub fn init(env: Env, wasm_hash: BytesN<32>) -> Result<(), Error> {
        if env.storage().instance().has(&STORAGE_KEY_WASM_HASH) {
            return Err(Error::AlreadyInited);
        }

        // Set the owner to the contract deployer
        env.storage()
            .instance()
            .set(&STORAGE_KEY_OWNER, &env.current_contract_address());

        // Initialize with the first WASM hash
        env.storage()
            .instance()
            .set(&STORAGE_KEY_WASM_HASH, &wasm_hash);

        // Initialize history with the first entry
        let mut history = vec![&env];
        history.push_back(wasm_hash.to_val());
        env.storage()
            .instance()
            .set(&STORAGE_KEY_WASM_HASH_HISTORY, &history);

        // Initialize deployment tracking with empty map
        let deployed_contracts: Map<BytesN<20>, Address> = Map::new(&env);
        env.storage()
            .instance()
            .set(&STORAGE_KEY_DEPLOYED_CONTRACTS, &deployed_contracts);

        Self::extend_ttl(env);

        Ok(())
    }

    pub fn update_wasm_hash(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        // Check if contract is initialized
        if !env.storage().instance().has(&STORAGE_KEY_WASM_HASH) {
            return Err(Error::NotInited);
        }

        // Check authorization - only owner can update
        Self::check_owner(&env)?;

        // Get current WASM hash
        let current_hash = env
            .storage()
            .instance()
            .get::<Symbol, BytesN<32>>(&STORAGE_KEY_WASM_HASH)
            .ok_or(Error::NotInited)?;

        // Don't update if it's the same hash
        if current_hash == new_wasm_hash {
            return Ok(());
        }

        // Update current WASM hash
        env.storage()
            .instance()
            .set(&STORAGE_KEY_WASM_HASH, &new_wasm_hash);

        // Add to history
        let mut history = env
            .storage()
            .instance()
            .get::<Symbol, soroban_sdk::Vec<soroban_sdk::Val>>(&STORAGE_KEY_WASM_HASH_HISTORY)
            .unwrap_or_else(|| vec![&env]);

        history.push_back(new_wasm_hash.to_val());
        env.storage()
            .instance()
            .set(&STORAGE_KEY_WASM_HASH_HISTORY, &history);

        Self::extend_ttl(env);

        Ok(())
    }

    pub fn get_wasm_hash(env: Env) -> Result<BytesN<32>, Error> {
        env.storage()
            .instance()
            .get::<Symbol, BytesN<32>>(&STORAGE_KEY_WASM_HASH)
            .ok_or(Error::NotInited)
    }

    pub fn get_wasm_hash_history(env: Env) -> Result<soroban_sdk::Vec<soroban_sdk::Val>, Error> {
        env.storage()
            .instance()
            .get::<Symbol, soroban_sdk::Vec<soroban_sdk::Val>>(&STORAGE_KEY_WASM_HASH_HISTORY)
            .ok_or(Error::NotInited)
    }

    pub fn get_owner(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get::<Symbol, Address>(&STORAGE_KEY_OWNER)
            .ok_or(Error::NotInited)
    }

    pub fn transfer_ownership(env: Env, new_owner: Address) -> Result<(), Error> {
        // Check authorization - only current owner can transfer
        Self::check_owner(&env)?;

        // Update owner
        env.storage()
            .instance()
            .set(&STORAGE_KEY_OWNER, &new_owner);

        Self::extend_ttl(env);

        Ok(())
    }

    pub fn get_deployed_contract(env: Env, eth_address: BytesN<20>) -> Result<Address, Error> {
        let deployed_contracts = env
            .storage()
            .instance()
            .get::<Symbol, Map<BytesN<20>, Address>>(&STORAGE_KEY_DEPLOYED_CONTRACTS)
            .ok_or(Error::NotInited)?;

        deployed_contracts
            .get(eth_address)
            .ok_or(Error::InvalidWasmHash) // Reusing error for "not found"
    }

    pub fn get_all_deployed_contracts(env: Env) -> Result<Map<BytesN<20>, Address>, Error> {
        env.storage()
            .instance()
            .get::<Symbol, Map<BytesN<20>, Address>>(&STORAGE_KEY_DEPLOYED_CONTRACTS)
            .ok_or(Error::NotInited)
    }

    pub fn get_deployment_count(env: Env) -> Result<u32, Error> {
        let deployed_contracts = env
            .storage()
            .instance()
            .get::<Symbol, Map<BytesN<20>, Address>>(&STORAGE_KEY_DEPLOYED_CONTRACTS)
            .ok_or(Error::NotInited)?;

        Ok(deployed_contracts.len())
    }
    
    pub fn deploy(env: Env, salt: BytesN<32>, pk: BytesN<65>) -> Result<Address, Error> {
        // Check authorization - only owner can deploy
        Self::check_owner(&env)?;

        let wasm_hash = env
            .storage()
            .instance()
            .get::<Symbol, BytesN<32>>(&STORAGE_KEY_WASM_HASH)
            .ok_or(Error::NotInited)?;

        let address = env.deployer().with_current_contract(salt).deploy(wasm_hash);
        let () = env.invoke_contract(&address, &symbol_short!("init"), vec![&env, pk.to_val()]);

        // Derive Ethereum address from public key (standard 20-byte address)
        // Remove the 0x04 prefix (first byte) to get the 64-byte public key
        let mut pubkey_array = [0u8; 64];
        for i in 0..64 {
            pubkey_array[i] = pk.get((i + 1).try_into().unwrap()).unwrap().try_into().unwrap();
        }
        
        // Convert to Bytes for hashing
        let pubkey_bytes = Bytes::from_array(&pk.env(), &pubkey_array);
        
        // Hash with Keccak-256
        let hash = pk.env().crypto().keccak256(&pubkey_bytes);
        
        // Take the last 20 bytes for Ethereum address
        let mut eth_address_array = [0u8; 20];
        for i in 0..20 {
            eth_address_array[i] = hash.to_array()[i + 12];
        }
        let eth_address = BytesN::from_array(&pk.env(), &eth_address_array);

        // Track the deployed contract
        let mut deployed_contracts = env
            .storage()
            .instance()
            .get::<Symbol, Map<BytesN<20>, Address>>(&STORAGE_KEY_DEPLOYED_CONTRACTS)
            .unwrap_or_else(|| Map::new(&env));

        deployed_contracts.set(eth_address, address.clone());
        env.storage()
            .instance()
            .set(&STORAGE_KEY_DEPLOYED_CONTRACTS, &deployed_contracts);

        Self::extend_ttl(env);

        Ok(address)
    }
}

#[cfg(test)]
mod test;

#[cfg(test)]
use soroban_sdk::testutils::{Address as _, BytesN as _};