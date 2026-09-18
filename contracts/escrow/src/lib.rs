//! Depozito escrow contract.
//!
//! `types` is the data model, `storage` is the only code that touches
//! `env.storage()` directly (instance / persistent / temporary split per
//! CLAUDE.md rule 2), `vault` is the real DeFindex vault integration
//! (cross-contract calls — see its own doc comment for how that's verified
//! against the live testnet vault), `config` holds one-time setup, `lease`
//! holds the lease lifecycle (create/fund/settle), `photo` holds the
//! evidence attestations, and `dispute` holds the dispute resolution cycle.
//! This `impl` block itself stays a thin wrapper per function so everything
//! else can live in, and be tested from, its own file.
//!
//! Implemented: `initialize`, `create_lease`, `deposit`,
//! `record_photo_hash`, `settle_undisputed`, `initiate_dispute`,
//! `submit_offer`, `submit_final_offer`, `arbitrator_decide`,
//! `official_ruling`. `dispute.rs`'s module doc explains a couple of
//! deliberate deviations from the architecture doc's state diagram
//! (CLAUDE.md rule 10).
#![no_std]

pub mod types;
mod config;
mod dispute;
mod lease;
mod photo;
mod storage;
mod vault;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env};
use types::{Dispute, Lease, Party, PhotoPhase};

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// One-time setup: admin, DeFindex vault, Soroswap router, USDC token
    /// addresses. Only callable by `admin`, and only once. See `config.rs`.
    pub fn initialize(
        env: Env,
        admin: Address,
        defindex_vault: Address,
        soroswap_router: Address,
        usdc_token: Address,
    ) {
        config::initialize(&env, admin, defindex_vault, soroswap_router, usdc_token)
    }

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

    /// Read-only: returns a lease record as-is. No auth — a lease's own
    /// existence and state aren't secret, and the frontend/indexer need a
    /// way to read them without maintaining a private off-chain copy.
    pub fn get_lease(env: Env, lease_id: u64) -> Lease {
        storage::get_lease(&env, lease_id)
    }

    /// Either party names the disputed amount once the lease term has
    /// ended; pays the undisputed remainder to the tenant immediately and
    /// freezes the rest. Only callable as the role you actually are, same
    /// pattern as `record_photo_hash`. See `dispute.rs`.
    pub fn initiate_dispute(env: Env, lease_id: u64, party: Party, disputed_amount: i128) {
        dispute::initiate_dispute(&env, lease_id, party, disputed_amount)
    }

    /// One party's offer or counter-offer in the current negotiation round.
    /// Only callable as the role you actually are. See `dispute.rs`.
    pub fn submit_offer(env: Env, lease_id: u64, party: Party, amount: i128) {
        dispute::submit_offer(&env, lease_id, party, amount)
    }

    /// One party's sealed final-offer number for last-offer arbitration.
    /// Only callable as the role you actually are. See `dispute.rs`.
    pub fn submit_final_offer(env: Env, lease_id: u64, party: Party, amount: i128) {
        dispute::submit_final_offer(&env, lease_id, party, amount)
    }

    /// The lease's pre-selected arbitrator picks whose final offer wins —
    /// binding. Only callable by `lease.arbitrator`. See `dispute.rs`.
    pub fn arbitrator_decide(env: Env, lease_id: u64, chosen_party: Party) {
        dispute::arbitrator_decide(&env, lease_id, chosen_party)
    }

    /// Admin writes a final split once a lease is frozen awaiting a ruling.
    /// Only callable by `config.admin`. See `dispute.rs`.
    pub fn official_ruling(env: Env, lease_id: u64, split: i128) {
        dispute::official_ruling(&env, lease_id, split)
    }

    /// Read-only: returns a lease's dispute case file as-is. No auth, same
    /// reasoning as `get_lease`.
    pub fn get_dispute(env: Env, lease_id: u64) -> Dispute {
        storage::get_dispute(&env, lease_id)
    }
}
