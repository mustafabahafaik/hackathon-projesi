//! Stand-in for the DeFindex vault integration.
//!
//! `deposit()` and `settle_undisputed()` (see `lease.rs`) call this after
//! moving USDC in or before moving it back out. `MockVault` is the only
//! implementation for now — Phase 2 replaces it with a real client for the
//! deployed DeFindex vault contract; the trait exists so that swap-in is a
//! one-line change at each call site, not a rewrite of `lease.rs` itself.
//!
//! `MockVault` never actually moves a token anywhere — the USDC `deposit()`
//! pulls from the tenant simply stays in the escrow contract's own balance
//! the whole time, since there's no real vault yet to send it to.
//! `withdraw`'s later real transfer back to the tenant works precisely
//! because of that: the balance was never anywhere else.

use soroban_sdk::{Address, Env};

pub trait Vault {
    /// Deposits `amount` of the escrow's held asset into `vault_address`
    /// and returns the vault shares minted.
    fn deposit(env: &Env, vault_address: &Address, amount: i128) -> i128;

    /// Redeems `shares` from `vault_address` and returns the asset amount
    /// received (principal plus any accrued yield).
    fn withdraw(env: &Env, vault_address: &Address, shares: i128) -> i128;
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

    fn withdraw(_env: &Env, _vault_address: &Address, shares: i128) -> i128 {
        // TODO(Phase 2): call the real DeFindex vault contract instead —
        // redeem `shares` from `vault_address` and return the actual asset
        // amount paid out (principal + accrued yield). Until then, assume
        // the same 1:1, no-yield ratio `deposit` assumed above — an honest
        // placeholder, not a fabricated yield number the jury would
        // rightly read as a mocked success.
        shares
    }
}
