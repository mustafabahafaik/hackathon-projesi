//! `record_photo_hash` — the logic behind `lib.rs`'s thin wrapper of the
//! same name.

use crate::storage;
use crate::types::{Lease, LeaseStatus, Party, PhotoPhase, PhotoRecord};
use soroban_sdk::{Address, BytesN, Env};

/// Either party attests to a photo set's Merkle root for one phase of their
/// lease. The caller doesn't name an address — they name a role (`party`),
/// and the contract resolves it against the stored lease and requires
/// *that* address's auth: only `owner` can record as `Party::Landlord`,
/// only `tenant` as `Party::Tenant`.
///
/// Once both parties have recorded a move-in hash, the lease moves
/// `Funded -> Active` (see `LeaseStatus`'s own doc comment in `types.rs` —
/// this is the transition it names). Nothing here marks `Active ->
/// Settling`: that transition is time-derived (`lease.term` passing), not
/// an on-chain write, so `settle_undisputed` checks the clock directly
/// instead of waiting on a status flag nothing would ever set.
///
/// A hash, once recorded for a given (lease, phase, party), cannot be
/// overwritten — the whole point of writing it on chain is that it can't
/// quietly change after the fact.
pub fn record_photo_hash(
    env: &Env,
    lease_id: u64,
    phase: PhotoPhase,
    party: Party,
    root_hash: BytesN<32>,
) {
    let lease: Lease = storage::get_lease(env, lease_id);
    let caller: Address = match party {
        Party::Landlord => lease.owner.clone(),
        Party::Tenant => lease.tenant.clone(),
    };
    caller.require_auth();

    if storage::has_photo_record(env, lease_id, phase, party) {
        panic!("photo hash already recorded for this phase and party");
    }

    storage::set_photo_record(
        env,
        lease_id,
        &PhotoRecord {
            phase,
            party,
            root_hash,
            timestamp: env.ledger().timestamp(),
        },
    );

    if phase == PhotoPhase::MoveIn && lease.status == LeaseStatus::Funded {
        let both_in = storage::has_photo_record(env, lease_id, PhotoPhase::MoveIn, Party::Landlord)
            && storage::has_photo_record(env, lease_id, PhotoPhase::MoveIn, Party::Tenant);
        if both_in {
            let mut lease = lease;
            lease.status = LeaseStatus::Active;
            storage::set_lease(env, lease_id, &lease);
        }
    }
}

#[cfg(test)]
mod test {
    use crate::storage;
    use crate::types::{Lease, LeaseStatus, Party, PhotoPhase};
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, BytesN, Env};

    fn setup(env: &Env) -> Address {
        env.register(EscrowContract, ())
    }

    fn seed_lease(
        env: &Env,
        contract_id: &Address,
        owner: Address,
        tenant: Address,
        arbitrator: Address,
        status: LeaseStatus,
    ) -> u64 {
        let lease_id = 1u64;
        env.as_contract(contract_id, || {
            storage::set_lease(
                env,
                lease_id,
                &Lease {
                    owner,
                    tenant,
                    arbitrator,
                    amount: 1_000_0000000i128,
                    term: env.ledger().timestamp() + 1,
                    status,
                    vault_shares: 0,
                },
            );
        });
        lease_id
    }

    #[test]
    fn both_move_in_records_flip_the_lease_to_active() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let tenant = Address::generate(&env);
        let arbitrator = Address::generate(&env);
        let lease_id = seed_lease(
            &env,
            &contract_id,
            owner.clone(),
            tenant.clone(),
            arbitrator,
            LeaseStatus::Funded,
        );

        let hash_a = BytesN::from_array(&env, &[1u8; 32]);
        let hash_b = BytesN::from_array(&env, &[2u8; 32]);

        client.record_photo_hash(&lease_id, &PhotoPhase::MoveIn, &Party::Landlord, &hash_a);
        env.as_contract(&contract_id, || {
            // Only one side has recorded so far — still Funded.
            assert_eq!(storage::get_lease(&env, lease_id).status, LeaseStatus::Funded);
        });

        client.record_photo_hash(&lease_id, &PhotoPhase::MoveIn, &Party::Tenant, &hash_b);
        env.as_contract(&contract_id, || {
            let lease = storage::get_lease(&env, lease_id);
            assert_eq!(lease.status, LeaseStatus::Active);

            let record = storage::get_photo_record(&env, lease_id, PhotoPhase::MoveIn, Party::Tenant);
            assert_eq!(record.root_hash, hash_b);
            assert_eq!(record.party, Party::Tenant);
        });
    }

    #[test]
    #[should_panic]
    fn recording_as_landlord_without_owner_auth_is_rejected() {
        let env = Env::default();
        // No mock_all_auths(): nobody has authorized anything, so
        // resolving `party` to `lease.owner` and requiring its auth panics.
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let tenant = Address::generate(&env);
        let arbitrator = Address::generate(&env);
        let lease_id = seed_lease(&env, &contract_id, owner, tenant, arbitrator, LeaseStatus::Funded);

        let hash = BytesN::from_array(&env, &[9u8; 32]);
        client.record_photo_hash(&lease_id, &PhotoPhase::MoveIn, &Party::Landlord, &hash);
    }

    #[test]
    #[should_panic(expected = "already recorded")]
    fn recording_the_same_phase_and_party_twice_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let tenant = Address::generate(&env);
        let arbitrator = Address::generate(&env);
        let lease_id = seed_lease(&env, &contract_id, owner, tenant, arbitrator, LeaseStatus::Funded);

        let hash = BytesN::from_array(&env, &[3u8; 32]);
        client.record_photo_hash(&lease_id, &PhotoPhase::MoveIn, &Party::Landlord, &hash);
        client.record_photo_hash(&lease_id, &PhotoPhase::MoveIn, &Party::Landlord, &hash);
    }
}
