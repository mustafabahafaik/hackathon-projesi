//! Data model. See `storage.rs` for where each type lives and why.

use soroban_sdk::{contracttype, Address, BytesN};

/// Where a lease sits in the escrow's state machine — mirrors the state
/// diagram in the architecture doc and `@depozito/sdk`'s `LeaseStatus`
/// (`packages/sdk/src/index.ts`) exactly, so the front end, the API and the
/// contract all agree on one vocabulary.
///
/// Transitions (business logic is a later phase — this is the target shape):
///   Created     -> Funded       `deposit()`
///   Funded      -> Active       `record_photo_hash(MoveIn)` from both parties
///   Active      -> Settling     lease term ends
///   Settling    -> Resolved     `settle_undisputed()`, nothing disputed
///   Settling    -> Disputed     `initiate_dispute()`
///   Disputed    -> PartialPaid  `pay_undisputed()`
///   PartialPaid -> Negotiating  `submit_offer()`
///   Negotiating -> Arbitrating  `escalate_arbitration()`
///   Arbitrating -> Resolved     `arbitrator_decide()`
///   Arbitrating -> Frozen       `decision_rejected()`
///   Frozen      -> Resolved     `official_ruling()`
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LeaseStatus {
    Created = 0,
    Funded = 1,
    Active = 2,
    Settling = 3,
    Disputed = 4,
    PartialPaid = 5,
    Negotiating = 6,
    Arbitrating = 7,
    Frozen = 8,
    Resolved = 9,
}

/// Move-in vs move-out — which photo set a `PhotoRecord` attests to.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PhotoPhase {
    MoveIn = 0,
    MoveOut = 1,
}

/// Which side of the lease acted. Stored instead of a raw `Address`: both
/// parties' addresses already live on the `Lease` record, so the role is
/// all a photo attestation or an offer needs to key by.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Party {
    Landlord = 0,
    Tenant = 1,
}

/// A rental-deposit lease. Lives in persistent storage under
/// `DataKey::Lease(lease_id)` — see `storage.rs`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Lease {
    pub owner: Address,
    pub tenant: Address,
    pub arbitrator: Address,
    /// Escrowed amount, in the vault asset's smallest unit — i128 is
    /// Soroban's native token-amount width.
    pub amount: i128,
    /// Lease end, ledger timestamp (unix seconds). Compared against
    /// `env.ledger().timestamp()` for the Active -> Settling transition.
    pub term: u64,
    pub status: LeaseStatus,
    /// DeFindex vault shares held against this lease's deposit. Tracked
    /// separately from `amount`: shares accrue value as the vault earns
    /// yield, so principal and the claim on it stop being the same number
    /// after a single ledger tick.
    pub vault_shares: i128,
}

/// One party's attestation of a photo set's Merkle root, for one phase of
/// one lease.
///
/// `lease_id` is not a field here — it's the outer key component
/// (`DataKey::Photo(lease_id, phase, party)`). `phase` and `party` ARE
/// repeated here even though they're also part of that key, so a record
/// pulled out of storage (e.g. for the evidence package) is self-describing
/// without the caller reconstructing the key it was found under.
///
/// Both parties attest independently for the same phase — this is a
/// deliberate integrity check, not a duplicate write: if the landlord's and
/// the tenant's root hashes for the same phase don't match, that mismatch
/// itself is signal (evidence tampering or disagreement) worth surfacing
/// before the lease ever reaches a dispute.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PhotoRecord {
    pub phase: PhotoPhase,
    pub party: Party,
    /// SHA-256 root of the uploaded photo set's Merkle tree.
    pub root_hash: BytesN<32>,
    /// Ledger timestamp (unix seconds) this was written.
    pub timestamp: u64,
}

/// Global contract configuration — one record, instance storage.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub defindex_vault: Address,
    pub soroswap_router: Address,
}

/// Every storage key the contract uses, in one place so the split across
/// instance/persistent/temporary storage (CLAUDE.md rule 2) stays visible
/// at a glance. See `storage.rs` for which `env.storage().*()` handle each
/// variant is read and written through.
#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Config,
    Lease(u64),
    Photo(u64, PhotoPhase, Party),
}
