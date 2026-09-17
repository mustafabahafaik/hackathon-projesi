//! Storage helpers — the only code that touches `env.storage()` directly,
//! so every read/write path for a given key lives in one place. No business
//! logic here (no auth checks, no state-transition rules): that's the next
//! phase, built on top of these.
//!
//! Storage type per CLAUDE.md rule 2:
//!
//! - **instance** — `Config` (admin, DeFindex vault, Soroswap router
//!   addresses). One small record, needed on essentially every call, alive
//!   for as long as the contract itself is. Instance storage loads with the
//!   contract on every invocation regardless of what the call touches, so
//!   there's no per-call cost to bundling three addresses into one record
//!   instead of three separate keys — and one `get`/`set` pair is simpler
//!   than three.
//! - **persistent** — `Lease` and `PhotoRecord`. A lease runs for months
//!   and its photo evidence has to outlive it and stay provably unaltered;
//!   persistent is the only tier Soroban won't silently archive without an
//!   explicit (rent-paying) TTL extension, which is what "the proof still
//!   exists when a court asks for it six months later" actually requires.
//! - **temporary** — not used yet. The active offer round's session data
//!   (Phase 2's dispute cycle) belongs here: once a round closes, nobody
//!   needs that data again and there's no reason to keep paying rent on it.

use crate::types::{Config, DataKey, Lease, Party, PhotoPhase, PhotoRecord};
use soroban_sdk::Env;

/// Ledger close time is ~5s, so ~17,280 ledgers/day. These bump numbers are
/// a first-pass estimate, not a verified network parameter — this
/// environment has no Rust toolchain to build and deploy against testnet,
/// so sanity-check them against the network's current `max_entry_ttl`
/// before `deposit()` / `settle_undisputed()` ship.
const LEDGERS_PER_DAY: u32 = 17_280;
/// Re-extend once an entry has under 30 days of TTL left.
const BUMP_THRESHOLD: u32 = LEDGERS_PER_DAY * 30;
/// ...out to 90 days from the ledger that triggers the bump.
const BUMP_EXTEND_TO: u32 = LEDGERS_PER_DAY * 90;

// ---------------------------------------------------------------- config --

pub fn get_config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .expect("config not set — call initialize() first")
}

pub fn has_config(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Config)
}

pub fn set_config(env: &Env, config: &Config) {
    env.storage().instance().set(&DataKey::Config, config);
    env.storage()
        .instance()
        .extend_ttl(BUMP_THRESHOLD, BUMP_EXTEND_TO);
}

/// Hands out the next lease id and advances the counter. Instance storage,
/// same reasoning as `Config`: one small always-needed value, not a
/// per-lease record — see the module doc.
pub fn next_lease_id(env: &Env) -> u64 {
    let current: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextLeaseId)
        .unwrap_or(1);
    env.storage()
        .instance()
        .set(&DataKey::NextLeaseId, &(current + 1));
    env.storage()
        .instance()
        .extend_ttl(BUMP_THRESHOLD, BUMP_EXTEND_TO);
    current
}

// ------------------------------------------------- lease records (persistent) --

pub fn has_lease(env: &Env, lease_id: u64) -> bool {
    env.storage().persistent().has(&DataKey::Lease(lease_id))
}

pub fn get_lease(env: &Env, lease_id: u64) -> Lease {
    env.storage()
        .persistent()
        .get(&DataKey::Lease(lease_id))
        .expect("lease not found")
}

/// No `delete_lease`: once written, a lease record is never removed — only
/// its `status` moves forward. Deleting would undercut the product's own
/// claim of an immutable record.
pub fn set_lease(env: &Env, lease_id: u64, lease: &Lease) {
    let key = DataKey::Lease(lease_id);
    env.storage().persistent().set(&key, lease);
    env.storage()
        .persistent()
        .extend_ttl(&key, BUMP_THRESHOLD, BUMP_EXTEND_TO);
}

// ------------------------------------------------ photo records (persistent) --

pub fn has_photo_record(env: &Env, lease_id: u64, phase: PhotoPhase, party: Party) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Photo(lease_id, phase, party))
}

pub fn get_photo_record(env: &Env, lease_id: u64, phase: PhotoPhase, party: Party) -> PhotoRecord {
    env.storage()
        .persistent()
        .get(&DataKey::Photo(lease_id, phase, party))
        .expect("photo record not found")
}

/// Same no-delete rule as leases: a photo attestation, once on chain, stays
/// on chain. `record.phase`/`record.party` — not separate parameters — pick
/// the key, so a caller can never write a record under a key that
/// disagrees with its own contents.
pub fn set_photo_record(env: &Env, lease_id: u64, record: &PhotoRecord) {
    let key = DataKey::Photo(lease_id, record.phase, record.party);
    env.storage().persistent().set(&key, record);
    env.storage()
        .persistent()
        .extend_ttl(&key, BUMP_THRESHOLD, BUMP_EXTEND_TO);
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::types::LeaseStatus;
    use crate::EscrowContract;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, BytesN, Env};

    fn setup(env: &Env) -> Address {
        env.register(EscrowContract, ())
    }

    #[test]
    fn config_round_trips_through_instance_storage() {
        let env = Env::default();
        let contract_id = setup(&env);
        let admin = Address::generate(&env);
        let defindex_vault = Address::generate(&env);
        let soroswap_router = Address::generate(&env);

        env.as_contract(&contract_id, || {
            let usdc_token = Address::generate(&env);
            let config = Config {
                admin: admin.clone(),
                defindex_vault: defindex_vault.clone(),
                soroswap_router: soroswap_router.clone(),
                usdc_token: usdc_token.clone(),
            };
            set_config(&env, &config);

            let loaded = get_config(&env);
            assert_eq!(loaded, config);
        });
    }

    #[test]
    #[should_panic(expected = "config not set")]
    fn get_config_panics_before_it_is_set() {
        let env = Env::default();
        let contract_id = setup(&env);
        env.as_contract(&contract_id, || {
            get_config(&env);
        });
    }

    #[test]
    fn has_config_reflects_whether_it_was_set() {
        let env = Env::default();
        let contract_id = setup(&env);
        env.as_contract(&contract_id, || {
            assert!(!has_config(&env));
            set_config(
                &env,
                &Config {
                    admin: Address::generate(&env),
                    defindex_vault: Address::generate(&env),
                    soroswap_router: Address::generate(&env),
                    usdc_token: Address::generate(&env),
                },
            );
            assert!(has_config(&env));
        });
    }

    #[test]
    fn next_lease_id_starts_at_one_and_advances() {
        let env = Env::default();
        let contract_id = setup(&env);
        env.as_contract(&contract_id, || {
            assert_eq!(next_lease_id(&env), 1);
            assert_eq!(next_lease_id(&env), 2);
            assert_eq!(next_lease_id(&env), 3);
        });
    }

    #[test]
    fn lease_round_trips_through_persistent_storage() {
        let env = Env::default();
        let contract_id = setup(&env);
        let owner = Address::generate(&env);
        let tenant = Address::generate(&env);
        let arbitrator = Address::generate(&env);

        env.as_contract(&contract_id, || {
            let lease_id = 4127u64;
            assert!(!has_lease(&env, lease_id));

            let lease = Lease {
                owner: owner.clone(),
                tenant: tenant.clone(),
                arbitrator: arbitrator.clone(),
                amount: 24_000_0000000i128,
                term: 1_800_000_000u64,
                status: LeaseStatus::Created,
                vault_shares: 0,
            };
            set_lease(&env, lease_id, &lease);

            assert!(has_lease(&env, lease_id));
            let loaded = get_lease(&env, lease_id);
            assert_eq!(loaded, lease);
        });
    }

    #[test]
    #[should_panic(expected = "lease not found")]
    fn get_lease_panics_when_missing() {
        let env = Env::default();
        let contract_id = setup(&env);
        env.as_contract(&contract_id, || {
            get_lease(&env, 999u64);
        });
    }

    #[test]
    fn photo_record_round_trips_and_is_keyed_per_party() {
        let env = Env::default();
        let contract_id = setup(&env);

        env.as_contract(&contract_id, || {
            let lease_id = 4127u64;
            assert!(!has_photo_record(&env, lease_id, PhotoPhase::MoveIn, Party::Tenant));

            let record = PhotoRecord {
                phase: PhotoPhase::MoveIn,
                party: Party::Tenant,
                root_hash: BytesN::from_array(&env, &[7u8; 32]),
                timestamp: 1_700_000_000u64,
            };
            set_photo_record(&env, lease_id, &record);

            assert!(has_photo_record(&env, lease_id, PhotoPhase::MoveIn, Party::Tenant));
            // The landlord's attestation for the same phase is a distinct
            // key — each side records independently.
            assert!(!has_photo_record(&env, lease_id, PhotoPhase::MoveIn, Party::Landlord));

            let loaded = get_photo_record(&env, lease_id, PhotoPhase::MoveIn, Party::Tenant);
            assert_eq!(loaded, record);
        });
    }

    #[test]
    #[should_panic(expected = "photo record not found")]
    fn get_photo_record_panics_when_missing() {
        let env = Env::default();
        let contract_id = setup(&env);
        env.as_contract(&contract_id, || {
            get_photo_record(&env, 1u64, PhotoPhase::MoveOut, Party::Landlord);
        });
    }
}
