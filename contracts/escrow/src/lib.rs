//! Depozito escrow contract.
//!
//! `types` is the data model, `storage` is the only code that touches
//! `env.storage()` directly — see storage.rs for the instance / persistent /
//! temporary split (CLAUDE.md rule 2) and why each type lives where it does.
//!
//! No business logic yet. The public entry points land next, in this
//! order — `create_lease`, `deposit`, `record_photo_hash`,
//! `settle_undisputed`, then the dispute cycle (`initiate_dispute`,
//! `submit_offer`, `submit_final_offer`, `arbitrator_decide`,
//! `official_ruling`).
#![no_std]

pub mod types;
mod storage;

use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {}
