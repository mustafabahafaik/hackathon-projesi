//! Stand-in for the DeFindex vault integration.
//!
//! `deposit()` (see `lease.rs`) calls `Vault::deposit` after pulling USDC
//! into the contract. `MockVault` is the only implementation for now —
//! Phase 2 replaces it with a real client for the deployed DeFindex vault
//! contract; the trait exists so that swap-in is a one-line change at the
//! call site in `lease.rs`, not a rewrite of `deposit()` itself.

use soroban_sdk::{Address, Env};

pub trait Vault {
    /// Deposits `amount` of the escrow's held asset into `vault_address`
    /// and returns the vault shares minted.
    fn deposit(env: &Env, vault_address: &Address, amount: i128) -> i128;
}

pub struct MockVault;

impl Vault for MockVault {
    fn deposit(_env: &Env, _vault_address: &Address, amount: i128) -> i128 {
        // TODO(Phase 2): call the real DeFindex vault contract instead of
        // returning a placeholder — transfer `amount` from this contract
        // into `vault_address` and return the shares it actually mints
        // (exact client shape depends on DeFindex's Soroban SDK). Until
        // then, assume a 1:1 share:asset ratio so `Lease.vault_shares`
        // holds a sane placeholder rather than a fabricated yield number.
        amount
    }
}
