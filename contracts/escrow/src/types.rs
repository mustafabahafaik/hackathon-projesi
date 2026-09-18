//! Data model. See `storage.rs` for where each type lives and why.

use soroban_sdk::{contracttype, Address, BytesN};

/// Where a lease sits in the escrow's state machine — mirrors the state
/// diagram in the architecture doc and `@depozito/sdk`'s `LeaseStatus`
/// (`packages/sdk/src/index.ts`) exactly, so the front end, the API and the
/// contract all agree on one vocabulary.
///
/// Transitions:
///   Created     -> Funded       `deposit()`
///   Funded      -> Active       `record_photo_hash(MoveIn)` from both parties
///   Active      -> Settling     lease term ends (time-derived — never
///                                itself written; see `settle_undisputed`'s
///                                doc comment in `lease.rs`)
///   Settling    -> Resolved     `settle_undisputed()`, nothing disputed
///   Settling    -> PartialPaid  `initiate_dispute()` — folds in the
///                                architecture doc's separate
///                                `pay_undisputed()` step; see `dispute.rs`'s
///                                module doc for why (CLAUDE.md rule 10)
///   PartialPaid -> Negotiating  `submit_offer()`
///   Negotiating -> Arbitrating  `submit_final_offer()`, once both parties'
///                                sealed numbers are in — folds in the
///                                architecture doc's separate
///                                `escalate_arbitration()` step (same
///                                deviation as above)
///   Arbitrating -> Resolved     `arbitrator_decide()`, called before the
///                                arbitration deadline
///   Arbitrating -> Frozen       `arbitrator_decide()`, called after the
///                                arbitration deadline with no decision made
///   Frozen      -> Resolved     `official_ruling()`
///
/// `Disputed` is kept as a named state — matching the architecture doc and
/// `@depozito/sdk` — but per the deviation above it is never itself the
/// durable value of `status` on chain; see `dispute.rs`.
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

/// A lease's dispute case file — created by `initiate_dispute` and updated
/// through the rest of the dispute cycle (`dispute.rs`). Lives in
/// persistent storage under `DataKey::Dispute(lease_id)`: CLAUDE.md rule 2
/// puts the offer history here because it has to survive as evidence for as
/// long as the lease record itself does, not just for the few days a single
/// round is open — the currently-open round's own countdown is the only
/// piece of dispute state that belongs in temporary storage instead (see
/// `DataKey::DisputeDeadline`).
///
/// The four offer fields share one convention: the amount of
/// `disputed_amount` that side proposes should go to the *landlord* — so a
/// party asking for no deduction at all proposes `0`, not their own payout.
/// This keeps `arbitrator_decide`'s job trivial: picking a `chosen_party`
/// just means "use that party's number as the landlord's share, the rest
/// goes to the tenant" — see `dispute.rs::payout_dispute`.
///
/// `-1` marks "nothing submitted for this slot yet" in those four fields —
/// `0` is a legitimate offer (no deduction), so it can't double as the
/// sentinel.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Dispute {
    pub disputed_amount: i128,
    pub initiator: Party,
    /// Completed negotiation rounds. Reaching `dispute::MAX_OFFER_ROUNDS`
    /// switches `submit_offer`/`submit_final_offer` from "still
    /// negotiating" to "final-offer phase" — this counter is the only place
    /// that distinction is recorded.
    pub round: u32,
    pub landlord_offer: i128,
    pub tenant_offer: i128,
    pub landlord_final_offer: i128,
    pub tenant_final_offer: i128,
    /// The arbitrator's binding pick, once made: `-1` = none yet, `0` =
    /// `Party::Landlord`, `1` = `Party::Tenant` (`Party`'s own discriminant
    /// values). Not `Option<Party>` — `contracttype` can't derive an XDR
    /// conversion for `Option<Party>` (`Option` of a plain fieldless enum
    /// isn't one of the shapes it maps to `ScVal`), so this reuses the same
    /// `-1`-sentinel convention as the four offer fields above instead.
    pub arbitrator_decision: i32,
}

/// Global contract configuration — one record, instance storage.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub defindex_vault: Address,
    pub soroswap_router: Address,
    /// SEP-41 token contract `deposit()` pulls from the tenant. Added in
    /// Phase 1.2 — not part of CLAUDE.md's original config list (admin,
    /// DeFindex vault, Soroswap router addresses), but `deposit()` cannot
    /// collect an asset without knowing which contract it is. Flagged here
    /// per CLAUDE.md rule 10; worth folding into CLAUDE.md's own env-var
    /// list (`USDC_TOKEN_ADDRESS`) alongside the others.
    pub usdc_token: Address,
}

/// Every storage key the contract uses, in one place so the split across
/// instance/persistent/temporary storage (CLAUDE.md rule 2) stays visible
/// at a glance. See `storage.rs` for which `env.storage().*()` handle each
/// variant is read and written through.
#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Config,
    /// Instance storage, alongside `Config`: a single counter is exactly
    /// the same "small, always-needed, contract-lifetime" shape as the
    /// config addresses, not a per-lease record.
    NextLeaseId,
    Lease(u64),
    Photo(u64, PhotoPhase, Party),
    /// Persistent — the dispute case file. See `Dispute`'s own doc comment.
    Dispute(u64),
    /// Temporary — whichever deadline the dispute is currently waiting on
    /// (offer round / final-offer window / arbitration window). Only
    /// meaningful while that phase is open; overwritten, not appended to,
    /// every time the dispute moves to its next phase.
    DisputeDeadline(u64),
}
