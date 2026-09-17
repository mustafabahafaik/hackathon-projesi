//! Depozito escrow contract.
//!
//! `types` is the data model, `storage` is the only code that touches
//! `env.storage()` directly (instance / persistent / temporary split per
//! CLAUDE.md rule 2), `vault` stands in for the DeFindex integration until
//! Phase 2, and `lease` holds the business logic behind each entry point
//! below. This `impl` block itself stays a thin wrapper per function so
//! everything else can live in, and be tested from, its own file.
//!
//! Implemented: `create_lease`, `deposit`.
//! Still to come, in this order: `record_photo_hash`, `settle_undisputed`,
//! then the dispute cycle (`initiate_dispute`, `submit_offer`,
//! `submit_final_offer`, `arbitrator_decide`, `official_ruling`).
//!
//! No `initialize()` yet either — `deposit()` reads `Config` but nothing
//! public can set it. Needed before any of this is deployable.
#![no_std]

pub mod types;
mod lease;
mod storage;
mod vault;

use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Landlord opens a lease record in `Created` status. Only callable by
    /// `owner`. See `lease.rs`.
    pub fn create_lease(
        env: Env,
        owner: Address,
        tenant: Address,
        arbitrator: Address,
        amount: i128,
        term: u64,
    ) -> u64 {
        lease::create_lease(&env, owner, tenant, arbitrator, amount, term)
    }

    /// Tenant funds the lease: pulls USDC into the contract, hands it to
    /// the (mocked) DeFindex vault, moves the lease to `Funded`. Only
    /// callable by the lease's own `tenant`. See `lease.rs`.
    pub fn deposit(env: Env, lease_id: u64) {
        lease::deposit(&env, lease_id)
    }
}
