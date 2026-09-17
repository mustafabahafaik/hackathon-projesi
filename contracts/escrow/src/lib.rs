//! Depozito escrow contract.
//!
//! `types` is the data model, `storage` is the only code that touches
//! `env.storage()` directly (instance / persistent / temporary split per
//! CLAUDE.md rule 2), `vault` stands in for the DeFindex integration until
//! Phase 2, `lease` holds the lease lifecycle (create/fund/settle), and
//! `photo` holds the evidence attestations. This `impl` block itself stays
//! a thin wrapper per function so everything else can live in, and be
//! tested from, its own file.
//!
//! Implemented: `create_lease`, `deposit`, `record_photo_hash`,
//! `settle_undisputed`.
//! Still to come — the dispute cycle: `initiate_dispute`, `submit_offer`,
//! `submit_final_offer`, `arbitrator_decide`, `official_ruling`.
//!
//! No `initialize()` yet either — `deposit()` and `settle_undisputed()`
//! read `Config` but nothing public can set it. Needed before any of this
//! is deployable.
#![no_std]

pub mod types;
mod lease;
mod photo;
mod storage;
mod vault;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env};
use types::{Party, PhotoPhase};

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

    /// Either party attests to a photo set's Merkle root for one phase.
    /// Only callable as the role you actually are: `owner` as
    /// `Party::Landlord`, `tenant` as `Party::Tenant`. See `photo.rs`.
    pub fn record_photo_hash(
        env: Env,
        lease_id: u64,
        phase: PhotoPhase,
        party: Party,
        root_hash: BytesN<32>,
    ) {
        photo::record_photo_hash(&env, lease_id, phase, party, root_hash)
    }

    /// Ends an undisputed lease and pays the tenant principal + yield. Only
    /// callable by both `owner` and `tenant` together before the lease
    /// term ends; permissionless once it has. See `lease.rs`.
    pub fn settle_undisputed(env: Env, lease_id: u64) {
        lease::settle_undisputed(&env, lease_id)
    }
}
