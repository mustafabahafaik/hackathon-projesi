//! The dispute resolution cycle — `initiate_dispute`, `submit_offer`,
//! `submit_final_offer`, `arbitrator_decide`, `official_ruling` — behind
//! their thin wrappers in `lib.rs`. Same file-per-concern layout as
//! `lease.rs`/`photo.rs`.
//!
//! ## Deviations from the architecture doc (CLAUDE.md rule 10)
//!
//! The architecture doc's state diagram names seven dispute transitions:
//! `initiate_dispute`, `pay_undisputed`, `submit_offer`,
//! `escalate_arbitration`, `submit_final_offer`, `arbitrator_decide`,
//! `decision_rejected`, `official_ruling`. This module implements the five
//! Prompt 1.5 actually asks for, folding the other two in rather than
//! adding them as separate entry points — one fewer signed transaction for
//! the user in both cases, and neither has any judgment call of its own to
//! make:
//!
//! - **`pay_undisputed` folds into `initiate_dispute`.** The moment the
//!   disputed amount is named, the undisputed remainder's destination
//!   (100% to the tenant, same as `settle_undisputed`) is already fully
//!   determined — there's no separate decision `pay_undisputed` would be
//!   making that justifies its own call. One consequence: `LeaseStatus::
//!   Disputed` is never itself a durable on-chain value — `initiate_dispute`
//!   moves a lease straight from `Active` to `PartialPaid` in one
//!   transaction. See `types.rs`'s `LeaseStatus` doc comment.
//! - **`escalate_arbitration` folds into `submit_final_offer`.** Once both
//!   parties' sealed final offers are in, moving to `Arbitrating` is
//!   automatic and mechanical, not a separate party's call to make.
//! - **`decision_rejected` doesn't exist as a signed action.** On a public
//!   ledger there's no way to force a losing party to actually sign a
//!   "reject" transaction, so the architecture doc's accept/reject step is
//!   reinterpreted as a *timeout*: `arbitrator_decide`, called after the
//!   arbitration deadline with no decision on record, is what moves
//!   `Arbitrating -> Frozen` (permissionlessly — same pattern
//!   `settle_undisputed` already uses for its own deadline branch, see
//!   `lease.rs`). `official_ruling` then only runs once `Frozen`.
//!
//! ## Offer amount convention
//!
//! Every offer (`submit_offer`, `submit_final_offer`) and every ruling
//! (`arbitrator_decide`'s implicit pick, `official_ruling`'s `split`) is one
//! number: the share of `Dispute::disputed_amount` that goes to the
//! *landlord*. See `Dispute`'s own doc comment in `types.rs`.
//!
//! ## Deadlines and defaults
//!
//! Every phase (offer round, final-offer window, arbitration window) has a
//! deadline in `DataKey::DisputeDeadline` (temporary storage — see
//! `storage.rs`) and a default outcome if nobody acts in time, so no party
//! can stall the process by going silent — the architecture doc's own
//! requirement. The default is: whichever side *did* respond has their
//! number auto-accepted; if neither responded, the disputed amount is split
//! down the middle. Once a deadline has passed, the phase's own entry point
//! (`submit_offer`, `submit_final_offer`, `arbitrator_decide`) applies that
//! default permissionlessly instead of requiring a specific caller — again,
//! mirroring `settle_undisputed`'s existing pattern.
//!
//! `initiate_dispute` requires `lease.status == Active` and the lease term
//! to have already passed, exactly like `settle_undisputed` — not
//! `lease.status == Settling`, because (per `photo.rs`'s own note)
//! `Settling` is time-derived and never actually written to storage.

use crate::storage;
use crate::types::{Dispute, Lease, LeaseStatus, Party};
use crate::vault::{MockVault, Vault};
use soroban_sdk::{token, Address, Env};

/// Negotiation rounds (`submit_offer`) before the dispute moves to sealed
/// final offers — matches `@depozito/sdk`'s "3-round offer / counter-offer
/// window" (`packages/sdk/src/index.ts`).
const MAX_OFFER_ROUNDS: u32 = 3;
const OFFER_ROUND_SECONDS: u64 = 3 * 86_400;
const FINAL_OFFER_SECONDS: u64 = 2 * 86_400;
const ARBITRATION_SECONDS: u64 = 5 * 86_400;

/// "Nothing submitted for this slot yet" — see `Dispute`'s doc comment.
const UNSET: i128 = -1;
/// Same sentinel, for `Dispute::arbitrator_decision`'s `i32` — see its own
/// doc comment for why that field isn't `Option<Party>`.
const UNSET_DECISION: i32 = -1;

fn resolve_caller(lease: &Lease, party: Party) -> Address {
    match party {
        Party::Landlord => lease.owner.clone(),
        Party::Tenant => lease.tenant.clone(),
    }
}

fn validate_split_amount(amount: i128, disputed_amount: i128) {
    if amount < 0 || amount > disputed_amount {
        panic!("amount must be between 0 and the disputed amount");
    }
}

/// The deadline-passed default: whichever side responded stands, otherwise
/// split the disputed amount evenly. The `(true, true)` arm is unreachable
/// in practice — a round with both slots filled is paid out or advanced the
/// moment the second side submits, before its own deadline can be reached
/// with both slots still holding values — but it's given a safe fallback
/// (the average) rather than a panic, in case a future bug ever reaches it.
fn default_split(landlord_val: i128, tenant_val: i128, disputed_amount: i128) -> i128 {
    match (landlord_val != UNSET, tenant_val != UNSET) {
        (true, false) => landlord_val,
        (false, true) => tenant_val,
        (false, false) => disputed_amount / 2,
        (true, true) => (landlord_val + tenant_val) / 2,
    }
}

/// Pays `amount_to_landlord` of the dispute's frozen `disputed_amount` to
/// the landlord and the remainder to the tenant, and resolves the lease.
/// The frozen amount is sitting in the contract's own token balance —
/// `initiate_dispute` withdrew it from the vault and left it there
/// precisely so this transfer needs no vault call of its own.
fn payout_dispute(env: &Env, lease_id: u64, amount_to_landlord: i128) {
    let mut lease = storage::get_lease(env, lease_id);
    let dispute = storage::get_dispute(env, lease_id);
    if amount_to_landlord < 0 || amount_to_landlord > dispute.disputed_amount {
        panic!("resolved landlord amount out of range");
    }
    let amount_to_tenant = dispute.disputed_amount - amount_to_landlord;

    let config = storage::get_config(env);
    let usdc = token::Client::new(env, &config.usdc_token);
    if amount_to_landlord > 0 {
        usdc.transfer(&env.current_contract_address(), &lease.owner, &amount_to_landlord);
    }
    if amount_to_tenant > 0 {
        usdc.transfer(&env.current_contract_address(), &lease.tenant, &amount_to_tenant);
    }

    lease.status = LeaseStatus::Resolved;
    storage::set_lease(env, lease_id, &lease);
}

/// Either party names the disputed amount. Only callable once the lease
/// term has passed (see the module doc for why this checks `Active` + the
/// clock instead of a stored `Settling` status) and only from `Active` —
/// once, since it moves the lease straight to `PartialPaid`.
///
/// Withdraws everything from the vault, pays the tenant whatever isn't
/// disputed immediately (principal + yield, same as `settle_undisputed`),
/// and leaves `disputed_amount` sitting in the contract's own balance,
/// frozen until the rest of the cycle resolves it.
pub fn initiate_dispute(env: &Env, lease_id: u64, party: Party, disputed_amount: i128) {
    let mut lease = storage::get_lease(env, lease_id);
    resolve_caller(&lease, party).require_auth();

    if lease.status != LeaseStatus::Active {
        panic!("lease is not active");
    }
    if env.ledger().timestamp() < lease.term {
        panic!("lease term has not ended yet");
    }
    if disputed_amount <= 0 || disputed_amount > lease.amount {
        panic!("disputed amount must be positive and at most the deposit amount");
    }

    let config = storage::get_config(env);
    let payout = MockVault::withdraw(env, &config.defindex_vault, lease.vault_shares);
    let undisputed_payout = payout - disputed_amount;

    if undisputed_payout > 0 {
        let usdc = token::Client::new(env, &config.usdc_token);
        usdc.transfer(&env.current_contract_address(), &lease.tenant, &undisputed_payout);
    }

    lease.status = LeaseStatus::PartialPaid;
    lease.vault_shares = 0;
    storage::set_lease(env, lease_id, &lease);

    storage::set_dispute(
        env,
        lease_id,
        &Dispute {
            disputed_amount,
            initiator: party,
            round: 0,
            landlord_offer: UNSET,
            tenant_offer: UNSET,
            landlord_final_offer: UNSET,
            tenant_final_offer: UNSET,
            arbitrator_decision: UNSET_DECISION,
        },
    );
    storage::set_dispute_deadline(env, lease_id, env.ledger().timestamp() + OFFER_ROUND_SECONDS);
}

/// One party's offer or counter-offer for the current negotiation round.
/// Callable while `PartialPaid` (this is the call that moves the lease to
/// `Negotiating`) or `Negotiating`, as long as the round limit hasn't been
/// hit yet — past that, `submit_final_offer` is the only way forward.
///
/// If the round's deadline has already passed, applies the timeout default
/// and resolves the lease instead of recording a new offer — permissionless
/// in that case, like `settle_undisputed`'s deadline branch.
pub fn submit_offer(env: &Env, lease_id: u64, party: Party, amount: i128) {
    let mut lease = storage::get_lease(env, lease_id);
    if lease.status != LeaseStatus::PartialPaid && lease.status != LeaseStatus::Negotiating {
        panic!("lease is not in a negotiable dispute state");
    }

    let mut dispute = storage::get_dispute(env, lease_id);
    if dispute.round >= MAX_OFFER_ROUNDS {
        panic!("negotiation rounds exhausted — use submit_final_offer");
    }

    let now = env.ledger().timestamp();
    let deadline = storage::get_dispute_deadline(env, lease_id);
    if now >= deadline {
        let amount_to_landlord =
            default_split(dispute.landlord_offer, dispute.tenant_offer, dispute.disputed_amount);
        payout_dispute(env, lease_id, amount_to_landlord);
        return;
    }

    resolve_caller(&lease, party).require_auth();
    validate_split_amount(amount, dispute.disputed_amount);
    match party {
        Party::Landlord => dispute.landlord_offer = amount,
        Party::Tenant => dispute.tenant_offer = amount,
    }

    if lease.status == LeaseStatus::PartialPaid {
        lease.status = LeaseStatus::Negotiating;
        storage::set_lease(env, lease_id, &lease);
    }

    if dispute.landlord_offer != UNSET && dispute.tenant_offer != UNSET {
        if dispute.landlord_offer == dispute.tenant_offer {
            let agreed = dispute.landlord_offer;
            storage::set_dispute(env, lease_id, &dispute);
            payout_dispute(env, lease_id, agreed);
            return;
        }
        dispute.round += 1;
        dispute.landlord_offer = UNSET;
        dispute.tenant_offer = UNSET;
        let window = if dispute.round >= MAX_OFFER_ROUNDS {
            FINAL_OFFER_SECONDS
        } else {
            OFFER_ROUND_SECONDS
        };
        storage::set_dispute_deadline(env, lease_id, now + window);
    }

    storage::set_dispute(env, lease_id, &dispute);
}

/// One party's sealed final-offer number, for last-offer arbitration.
/// Callable only once the negotiation rounds are exhausted
/// (`dispute.round >= MAX_OFFER_ROUNDS`); once both parties' final offers
/// are in, moves the lease to `Arbitrating` (folding in the architecture
/// doc's `escalate_arbitration` — see the module doc).
///
/// True sealed-bid privacy isn't achievable in a public ledger's storage
/// without a commit-reveal scheme — out of scope for this pass; both final
/// offers are plain values, visible to anyone reading chain state the
/// moment they're submitted. Flagged per CLAUDE.md rule 10.
///
/// If the final-offer window's deadline has already passed, applies the
/// timeout default and resolves the lease, same as `submit_offer`.
pub fn submit_final_offer(env: &Env, lease_id: u64, party: Party, amount: i128) {
    let lease = storage::get_lease(env, lease_id);
    if lease.status != LeaseStatus::Negotiating {
        panic!("lease is not awaiting final offers");
    }

    let mut dispute = storage::get_dispute(env, lease_id);
    if dispute.round < MAX_OFFER_ROUNDS {
        panic!("negotiation rounds not exhausted yet — use submit_offer");
    }

    let now = env.ledger().timestamp();
    let deadline = storage::get_dispute_deadline(env, lease_id);
    if now >= deadline {
        let amount_to_landlord = default_split(
            dispute.landlord_final_offer,
            dispute.tenant_final_offer,
            dispute.disputed_amount,
        );
        payout_dispute(env, lease_id, amount_to_landlord);
        return;
    }

    resolve_caller(&lease, party).require_auth();
    validate_split_amount(amount, dispute.disputed_amount);
    match party {
        Party::Landlord => dispute.landlord_final_offer = amount,
        Party::Tenant => dispute.tenant_final_offer = amount,
    }

    if dispute.landlord_final_offer != UNSET && dispute.tenant_final_offer != UNSET {
        if dispute.landlord_final_offer == dispute.tenant_final_offer {
            let agreed = dispute.landlord_final_offer;
            storage::set_dispute(env, lease_id, &dispute);
            payout_dispute(env, lease_id, agreed);
            return;
        }
        let mut lease = lease;
        lease.status = LeaseStatus::Arbitrating;
        storage::set_lease(env, lease_id, &lease);
        storage::set_dispute_deadline(env, lease_id, now + ARBITRATION_SECONDS);
    }

    storage::set_dispute(env, lease_id, &dispute);
}

/// The pre-selected arbitrator picks whose final offer wins — binding,
/// baseball-arbitration style. Only callable by `lease.arbitrator`, and
/// only before the arbitration deadline; called after it (by anyone — the
/// arbitrator missed their window), it moves the lease to `Frozen` instead
/// of paying out. See the module doc's `decision_rejected` deviation note.
pub fn arbitrator_decide(env: &Env, lease_id: u64, chosen_party: Party) {
    let mut lease = storage::get_lease(env, lease_id);
    if lease.status != LeaseStatus::Arbitrating {
        panic!("lease is not awaiting arbitration");
    }

    let now = env.ledger().timestamp();
    let deadline = storage::get_dispute_deadline(env, lease_id);
    if now >= deadline {
        lease.status = LeaseStatus::Frozen;
        storage::set_lease(env, lease_id, &lease);
        return;
    }

    lease.arbitrator.require_auth();

    let mut dispute = storage::get_dispute(env, lease_id);
    let amount_to_landlord = match chosen_party {
        Party::Landlord => dispute.landlord_final_offer,
        Party::Tenant => dispute.tenant_final_offer,
    };
    dispute.arbitrator_decision = chosen_party as i32;
    storage::set_dispute(env, lease_id, &dispute);

    payout_dispute(env, lease_id, amount_to_landlord);
}

/// The admin writes a final, authoritative split once a lease is `Frozen`
/// (the arbitrator missed their deadline) — standing in for a court or
/// mediator's ruling, per the architecture doc. `split` follows the same
/// "amount to the landlord" convention as every other offer.
pub fn official_ruling(env: &Env, lease_id: u64, split: i128) {
    let lease = storage::get_lease(env, lease_id);
    if lease.status != LeaseStatus::Frozen {
        panic!("lease is not frozen awaiting an official ruling");
    }

    let config = storage::get_config(env);
    config.admin.require_auth();

    let dispute = storage::get_dispute(env, lease_id);
    validate_split_amount(split, dispute.disputed_amount);

    payout_dispute(env, lease_id, split);
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::types::{Config, Lease};
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{token, Env};

    fn setup(env: &Env) -> Address {
        env.register(EscrowContract, ())
    }

    /// Seeds a lease as if `deposit()` and both move-in photo hashes had
    /// already run: `Active`, fully funded, term already reached (so
    /// `initiate_dispute` is immediately callable — see the module doc's
    /// note on why this checks `Active` + the clock, not a stored
    /// `Settling`). Mints `amount` of a fresh SAC token directly to the
    /// contract's own balance, standing in for `deposit()`'s pull (same
    /// shortcut `lease.rs`'s `settle_undisputed` tests use).
    fn seed_active_lease(
        env: &Env,
        contract_id: &Address,
        amount: i128,
    ) -> (Address, Address, Address, Address, Address, u64) {
        let owner = Address::generate(env);
        let tenant = Address::generate(env);
        let arbitrator = Address::generate(env);
        let admin = Address::generate(env);
        let defindex_vault = Address::generate(env);
        let soroswap_router = Address::generate(env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc_token = sac.address();
        let usdc_admin = token::StellarAssetClient::new(env, &usdc_token);
        usdc_admin.mint(contract_id, &amount);

        let lease_id = 1u64;
        let term = env.ledger().timestamp();
        env.as_contract(contract_id, || {
            storage::set_config(
                env,
                &Config {
                    admin: admin.clone(),
                    defindex_vault,
                    soroswap_router,
                    usdc_token: usdc_token.clone(),
                },
            );
            storage::set_lease(
                env,
                lease_id,
                &Lease {
                    owner: owner.clone(),
                    tenant: tenant.clone(),
                    arbitrator: arbitrator.clone(),
                    amount,
                    term,
                    status: LeaseStatus::Active,
                    vault_shares: amount,
                },
            );
        });

        (owner, tenant, arbitrator, admin, usdc_token, lease_id)
    }

    /// Drives a fresh dispute straight to the final-offer phase: unequal
    /// offers for `MAX_OFFER_ROUNDS` rounds, ending with `dispute.round ==
    /// MAX_OFFER_ROUNDS` and the lease still `Negotiating`. Shared by every
    /// `submit_final_offer` test so they don't each re-derive round
    /// exhaustion by hand.
    fn exhaust_negotiation_rounds(client: &EscrowContractClient, lease_id: u64) {
        for round in 0..MAX_OFFER_ROUNDS {
            let landlord_amt = 300_0000000i128 - (round as i128) * 10_0000000i128;
            let tenant_amt = 100_0000000i128 + (round as i128) * 10_0000000i128;
            client.submit_offer(&lease_id, &Party::Landlord, &landlord_amt);
            client.submit_offer(&lease_id, &Party::Tenant, &tenant_amt);
        }
    }

    // ---- initiate_dispute -------------------------------------------

    #[test]
    fn initiate_dispute_freezes_disputed_amount_and_pays_undisputed_now() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, tenant, _arbitrator, _admin, usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        let usdc = token::Client::new(&env, &usdc_token);

        let disputed = 300_0000000i128;
        client.initiate_dispute(&lease_id, &Party::Tenant, &disputed);

        assert_eq!(usdc.balance(&tenant), amount - disputed);
        assert_eq!(usdc.balance(&contract_id), disputed);

        env.as_contract(&contract_id, || {
            let lease = storage::get_lease(&env, lease_id);
            assert_eq!(lease.status, LeaseStatus::PartialPaid);
            assert_eq!(lease.vault_shares, 0);

            let dispute = storage::get_dispute(&env, lease_id);
            assert_eq!(dispute.disputed_amount, disputed);
            assert_eq!(dispute.initiator, Party::Tenant);
            assert_eq!(dispute.round, 0);
            assert_eq!(dispute.landlord_offer, UNSET);

            let deadline = storage::get_dispute_deadline(&env, lease_id);
            assert_eq!(deadline, env.ledger().timestamp() + OFFER_ROUND_SECONDS);
        });
    }

    #[test]
    #[should_panic]
    fn initiate_dispute_without_caller_auth_is_rejected() {
        let env = Env::default();
        // No mock_all_auths(): the named party's own auth is missing.
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);

        client.initiate_dispute(&lease_id, &Party::Landlord, &300_0000000i128);
    }

    #[test]
    #[should_panic(expected = "lease term has not ended yet")]
    fn initiate_dispute_before_term_ends_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        env.as_contract(&contract_id, || {
            let mut lease = storage::get_lease(&env, lease_id);
            lease.term = env.ledger().timestamp() + 1_000_000;
            storage::set_lease(&env, lease_id, &lease);
        });

        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);
    }

    // ---- submit_offer ------------------------------------------------

    #[test]
    fn submit_offer_matching_amounts_resolve_immediately() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (owner, tenant, _arbitrator, _admin, usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        let usdc = token::Client::new(&env, &usdc_token);

        let disputed = 300_0000000i128;
        client.initiate_dispute(&lease_id, &Party::Tenant, &disputed);

        let agreed = 120_0000000i128;
        client.submit_offer(&lease_id, &Party::Landlord, &agreed);
        client.submit_offer(&lease_id, &Party::Tenant, &agreed);

        assert_eq!(usdc.balance(&owner), agreed);
        assert_eq!(usdc.balance(&tenant), (amount - disputed) + (disputed - agreed));
        assert_eq!(usdc.balance(&contract_id), 0);

        env.as_contract(&contract_id, || {
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Resolved);
        });
    }

    #[test]
    fn submit_offer_first_call_moves_lease_to_negotiating_and_unequal_offers_advance_the_round() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);

        client.submit_offer(&lease_id, &Party::Landlord, &200_0000000i128);
        env.as_contract(&contract_id, || {
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Negotiating);
            let dispute = storage::get_dispute(&env, lease_id);
            assert_eq!(dispute.landlord_offer, 200_0000000i128);
            assert_eq!(dispute.tenant_offer, UNSET);
            assert_eq!(dispute.round, 0);
        });

        client.submit_offer(&lease_id, &Party::Tenant, &100_0000000i128);
        env.as_contract(&contract_id, || {
            let dispute = storage::get_dispute(&env, lease_id);
            // Unequal — round advances, both offers reset for the next round.
            assert_eq!(dispute.round, 1);
            assert_eq!(dispute.landlord_offer, UNSET);
            assert_eq!(dispute.tenant_offer, UNSET);
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Negotiating);
        });
    }

    #[test]
    fn submit_offer_exhausting_all_rounds_reaches_the_final_offer_window() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);

        exhaust_negotiation_rounds(&client, lease_id);

        env.as_contract(&contract_id, || {
            let dispute = storage::get_dispute(&env, lease_id);
            assert_eq!(dispute.round, MAX_OFFER_ROUNDS);
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Negotiating);
            let deadline = storage::get_dispute_deadline(&env, lease_id);
            assert_eq!(deadline, env.ledger().timestamp() + FINAL_OFFER_SECONDS);
        });
    }

    #[test]
    #[should_panic(expected = "negotiation rounds exhausted")]
    fn submit_offer_after_rounds_exhausted_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);
        exhaust_negotiation_rounds(&client, lease_id);

        client.submit_offer(&lease_id, &Party::Landlord, &150_0000000i128);
    }

    #[test]
    #[should_panic]
    fn submit_offer_without_caller_auth_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);

        env.set_auths(&[]); // drop the blanket auth mock for the next call
        client.submit_offer(&lease_id, &Party::Landlord, &150_0000000i128);
    }

    #[test]
    fn submit_offer_after_deadline_applies_the_default_split_permissionlessly() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (owner, tenant, _arbitrator, _admin, usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        let usdc = token::Client::new(&env, &usdc_token);
        let disputed = 300_0000000i128;
        client.initiate_dispute(&lease_id, &Party::Tenant, &disputed);

        // Only the landlord responds this round.
        client.submit_offer(&lease_id, &Party::Landlord, &200_0000000i128);

        env.ledger().set_timestamp(env.ledger().timestamp() + OFFER_ROUND_SECONDS + 1);
        env.set_auths(&[]); // the timed-out default path needs no auth at all

        client.submit_offer(&lease_id, &Party::Tenant, &0i128);

        // Tenant missed the deadline — the landlord's last offer stands.
        assert_eq!(usdc.balance(&owner), 200_0000000i128);
        assert_eq!(usdc.balance(&tenant), (amount - disputed) + (disputed - 200_0000000i128));
        env.as_contract(&contract_id, || {
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Resolved);
        });
    }

    // ---- submit_final_offer -------------------------------------------

    #[test]
    fn submit_final_offer_unequal_moves_the_lease_to_arbitrating() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);
        exhaust_negotiation_rounds(&client, lease_id);

        client.submit_final_offer(&lease_id, &Party::Landlord, &220_0000000i128);
        env.as_contract(&contract_id, || {
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Negotiating);
        });

        client.submit_final_offer(&lease_id, &Party::Tenant, &80_0000000i128);
        env.as_contract(&contract_id, || {
            let lease = storage::get_lease(&env, lease_id);
            assert_eq!(lease.status, LeaseStatus::Arbitrating);
            let dispute = storage::get_dispute(&env, lease_id);
            assert_eq!(dispute.landlord_final_offer, 220_0000000i128);
            assert_eq!(dispute.tenant_final_offer, 80_0000000i128);
            let deadline = storage::get_dispute_deadline(&env, lease_id);
            assert_eq!(deadline, env.ledger().timestamp() + ARBITRATION_SECONDS);
        });
    }

    #[test]
    fn submit_final_offer_matching_amounts_resolve_immediately() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (owner, tenant, _arbitrator, _admin, usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        let usdc = token::Client::new(&env, &usdc_token);
        let disputed = 300_0000000i128;
        client.initiate_dispute(&lease_id, &Party::Tenant, &disputed);
        exhaust_negotiation_rounds(&client, lease_id);

        let agreed = 150_0000000i128;
        client.submit_final_offer(&lease_id, &Party::Landlord, &agreed);
        client.submit_final_offer(&lease_id, &Party::Tenant, &agreed);

        assert_eq!(usdc.balance(&owner), agreed);
        assert_eq!(usdc.balance(&tenant), (amount - disputed) + (disputed - agreed));
        env.as_contract(&contract_id, || {
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Resolved);
        });
    }

    #[test]
    #[should_panic(expected = "negotiation rounds not exhausted")]
    fn submit_final_offer_before_rounds_exhausted_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);
        // One round in — lease is `Negotiating`, but round 0 hasn't hit
        // MAX_OFFER_ROUNDS yet, so this is genuinely the "not exhausted"
        // case rather than "no negotiation has happened at all".
        client.submit_offer(&lease_id, &Party::Landlord, &200_0000000i128);

        client.submit_final_offer(&lease_id, &Party::Landlord, &200_0000000i128);
    }

    #[test]
    #[should_panic]
    fn submit_final_offer_without_caller_auth_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);
        exhaust_negotiation_rounds(&client, lease_id);

        env.set_auths(&[]);
        client.submit_final_offer(&lease_id, &Party::Landlord, &200_0000000i128);
    }

    #[test]
    fn submit_final_offer_after_deadline_applies_the_default_split_permissionlessly() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (owner, tenant, _arbitrator, _admin, usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        let usdc = token::Client::new(&env, &usdc_token);
        let disputed = 300_0000000i128;
        client.initiate_dispute(&lease_id, &Party::Tenant, &disputed);
        exhaust_negotiation_rounds(&client, lease_id);

        client.submit_final_offer(&lease_id, &Party::Landlord, &220_0000000i128);

        env.ledger().set_timestamp(env.ledger().timestamp() + FINAL_OFFER_SECONDS + 1);
        env.set_auths(&[]);
        client.submit_final_offer(&lease_id, &Party::Tenant, &0i128);

        assert_eq!(usdc.balance(&owner), 220_0000000i128);
        assert_eq!(usdc.balance(&tenant), (amount - disputed) + (disputed - 220_0000000i128));
        env.as_contract(&contract_id, || {
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Resolved);
        });
    }

    // ---- arbitrator_decide ---------------------------------------------

    #[test]
    fn arbitrator_decide_before_deadline_pays_out_the_chosen_partys_number() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (owner, tenant, _arbitrator, _admin, usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        let usdc = token::Client::new(&env, &usdc_token);
        let disputed = 300_0000000i128;
        client.initiate_dispute(&lease_id, &Party::Tenant, &disputed);
        exhaust_negotiation_rounds(&client, lease_id);
        client.submit_final_offer(&lease_id, &Party::Landlord, &220_0000000i128);
        client.submit_final_offer(&lease_id, &Party::Tenant, &80_0000000i128);

        client.arbitrator_decide(&lease_id, &Party::Tenant);

        assert_eq!(usdc.balance(&owner), 80_0000000i128);
        assert_eq!(usdc.balance(&tenant), (amount - disputed) + (disputed - 80_0000000i128));
        env.as_contract(&contract_id, || {
            let lease = storage::get_lease(&env, lease_id);
            assert_eq!(lease.status, LeaseStatus::Resolved);
            let dispute = storage::get_dispute(&env, lease_id);
            assert_eq!(dispute.arbitrator_decision, Party::Tenant as i32);
        });
    }

    #[test]
    #[should_panic]
    fn arbitrator_decide_by_a_non_arbitrator_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);
        exhaust_negotiation_rounds(&client, lease_id);
        client.submit_final_offer(&lease_id, &Party::Landlord, &220_0000000i128);
        client.submit_final_offer(&lease_id, &Party::Tenant, &80_0000000i128);

        env.set_auths(&[]); // arbitrator.require_auth() now has nothing to authorize against
        client.arbitrator_decide(&lease_id, &Party::Landlord);
    }

    #[test]
    fn arbitrator_decide_after_deadline_freezes_the_lease_without_paying_out() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        let usdc = token::Client::new(&env, &usdc_token);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);
        exhaust_negotiation_rounds(&client, lease_id);
        client.submit_final_offer(&lease_id, &Party::Landlord, &220_0000000i128);
        client.submit_final_offer(&lease_id, &Party::Tenant, &80_0000000i128);

        env.ledger().set_timestamp(env.ledger().timestamp() + ARBITRATION_SECONDS + 1);
        env.set_auths(&[]);
        client.arbitrator_decide(&lease_id, &Party::Landlord);

        env.as_contract(&contract_id, || {
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Frozen);
        });
        // Still frozen inside the contract — nobody got paid yet.
        assert_eq!(usdc.balance(&contract_id), 300_0000000i128);
    }

    // ---- official_ruling -----------------------------------------------

    #[test]
    fn official_ruling_by_admin_pays_out_the_split() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (owner, tenant, _arbitrator, _admin, usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        let usdc = token::Client::new(&env, &usdc_token);
        let disputed = 300_0000000i128;
        client.initiate_dispute(&lease_id, &Party::Tenant, &disputed);
        exhaust_negotiation_rounds(&client, lease_id);
        client.submit_final_offer(&lease_id, &Party::Landlord, &220_0000000i128);
        client.submit_final_offer(&lease_id, &Party::Tenant, &80_0000000i128);
        env.ledger().set_timestamp(env.ledger().timestamp() + ARBITRATION_SECONDS + 1);
        client.arbitrator_decide(&lease_id, &Party::Landlord); // times out -> Frozen

        let split = 100_0000000i128;
        client.official_ruling(&lease_id, &split);

        assert_eq!(usdc.balance(&owner), split);
        assert_eq!(usdc.balance(&tenant), (amount - disputed) + (disputed - split));
        env.as_contract(&contract_id, || {
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Resolved);
        });
    }

    #[test]
    #[should_panic]
    fn official_ruling_by_a_non_admin_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);
        exhaust_negotiation_rounds(&client, lease_id);
        client.submit_final_offer(&lease_id, &Party::Landlord, &220_0000000i128);
        client.submit_final_offer(&lease_id, &Party::Tenant, &80_0000000i128);
        env.ledger().set_timestamp(env.ledger().timestamp() + ARBITRATION_SECONDS + 1);
        client.arbitrator_decide(&lease_id, &Party::Landlord); // -> Frozen

        env.set_auths(&[]); // admin.require_auth() now has nothing to authorize against
        client.official_ruling(&lease_id, &100_0000000i128);
    }

    #[test]
    #[should_panic(expected = "lease is not frozen")]
    fn official_ruling_before_frozen_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let amount = 1_000_0000000i128;
        let (_owner, _tenant, _arbitrator, _admin, _usdc_token, lease_id) =
            seed_active_lease(&env, &contract_id, amount);
        client.initiate_dispute(&lease_id, &Party::Tenant, &300_0000000i128);

        client.official_ruling(&lease_id, &100_0000000i128);
    }
}
