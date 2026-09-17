//! Depozito escrow contract — scaffold.
//!
//! Empty on purpose: this is the repo-structure step from CLAUDE.md's MVP
//! order. The real entry points land next, in this order —
//! `create_lease`, `deposit`, `record_photo_hash`, `settle_undisputed`,
//! then the dispute cycle (`initiate_dispute`, `submit_offer`,
//! `submit_final_offer`, `arbitrator_decide`, `official_ruling`).
//!
//! Storage type is chosen per CLAUDE.md rule 2 and must stay commented at
//! the point of use once real state lands:
//!   instance   -> admin, arbiter, DeFindex vault, Soroswap router addresses
//!   persistent -> lease record, photo hashes, offer history, settlement, ruling
//!   temporary  -> invite token, the active offer round's session data
#![no_std]

use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {}
