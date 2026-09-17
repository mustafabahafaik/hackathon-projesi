//! `create_lease` and `deposit` — the logic behind the two thin wrapper
//! methods `lib.rs`'s `#[contractimpl]` block exposes. Kept as plain
//! functions here (not written directly inside the `impl EscrowContract`
//! block) so each phase's business logic and its tests can live in their
//! own file, and `lib.rs` only ever grows by one wrapper line per function.

use crate::storage;
use crate::types::{Config, Lease, LeaseStatus};
use crate::vault::{MockVault, Vault};
use soroban_sdk::{token, Address, Env};

/// Landlord opens a lease record. Only `owner` can call this — the
/// transaction is rejected before any state is touched if it isn't
/// authorized by `owner`.
pub fn create_lease(
    env: &Env,
    owner: Address,
    tenant: Address,
    arbitrator: Address,
    amount: i128,
    term: u64,
) -> u64 {
    owner.require_auth();

    if amount <= 0 {
        panic!("deposit amount must be positive");
    }
    if term <= env.ledger().timestamp() {
        panic!("lease term must end in the future");
    }

    let lease_id = storage::next_lease_id(env);
    let lease = Lease {
        owner,
        tenant,
        arbitrator,
        amount,
        term,
        status: LeaseStatus::Created,
        vault_shares: 0,
    };
    storage::set_lease(env, lease_id, &lease);
    lease_id
}

/// Tenant funds the lease: pulls `lease.amount` of the configured USDC
/// token into the contract, hands it to the vault (mocked — see
/// `vault.rs`), and moves the lease from `Created` to `Funded`. Only
/// `lease.tenant` can call this; the tenant's address comes from the lease
/// record itself, not a caller-supplied parameter, so there's nothing for a
/// caller to lie about.
///
/// This assumes `storage::set_config` has already been called — there is no
/// public `initialize()` yet (out of scope for this phase). That is a real
/// gap: as it stands, nothing can set config on a live deployment. Add
/// `initialize()` before this contract goes anywhere near testnet.
pub fn deposit(env: &Env, lease_id: u64) {
    let mut lease = storage::get_lease(env, lease_id);
    lease.tenant.require_auth();

    if lease.status != LeaseStatus::Created {
        panic!("lease is not awaiting deposit");
    }

    let config: Config = storage::get_config(env);

    // Real transfer — only the DeFindex leg below is mocked.
    let usdc = token::Client::new(env, &config.usdc_token);
    usdc.transfer(&lease.tenant, &env.current_contract_address(), &lease.amount);

    let shares = MockVault::deposit(env, &config.defindex_vault, lease.amount);

    lease.status = LeaseStatus::Funded;
    lease.vault_shares = shares;
    storage::set_lease(env, lease_id, &lease);
}

#[cfg(test)]
mod test {
    use crate::storage;
    use crate::types::{Config, Lease, LeaseStatus};
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{token, Address, Env};

    fn setup(env: &Env) -> Address {
        env.register(EscrowContract, ())
    }

    #[test]
    fn create_lease_by_owner_stores_a_created_lease() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let tenant = Address::generate(&env);
        let arbitrator = Address::generate(&env);
        let amount = 1_000_0000000i128;
        let term = env.ledger().timestamp() + 1;

        let lease_id = client.create_lease(&owner, &tenant, &arbitrator, &amount, &term);

        env.as_contract(&contract_id, || {
            let lease = storage::get_lease(&env, lease_id);
            assert_eq!(lease.owner, owner);
            assert_eq!(lease.tenant, tenant);
            assert_eq!(lease.arbitrator, arbitrator);
            assert_eq!(lease.amount, amount);
            assert_eq!(lease.term, term);
            assert_eq!(lease.status, LeaseStatus::Created);
            assert_eq!(lease.vault_shares, 0);
        });
    }

    #[test]
    #[should_panic]
    fn create_lease_without_owner_auth_is_rejected() {
        let env = Env::default();
        // No mock_all_auths() — owner.require_auth() has nothing to
        // authorize against and must panic.
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let tenant = Address::generate(&env);
        let arbitrator = Address::generate(&env);
        let term = env.ledger().timestamp() + 1;

        client.create_lease(&owner, &tenant, &arbitrator, &1_000_0000000i128, &term);
    }

    #[test]
    fn deposit_by_tenant_pulls_usdc_and_funds_the_lease() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let tenant = Address::generate(&env);
        let arbitrator = Address::generate(&env);
        let admin = Address::generate(&env);
        let defindex_vault = Address::generate(&env);
        let soroswap_router = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc_token = sac.address();
        let usdc_admin = token::StellarAssetClient::new(&env, &usdc_token);
        let usdc = token::Client::new(&env, &usdc_token);

        let amount = 1_000_0000000i128;
        usdc_admin.mint(&tenant, &amount);

        env.as_contract(&contract_id, || {
            storage::set_config(
                &env,
                &Config {
                    admin: admin.clone(),
                    defindex_vault: defindex_vault.clone(),
                    soroswap_router: soroswap_router.clone(),
                    usdc_token: usdc_token.clone(),
                },
            );
        });

        let term = env.ledger().timestamp() + 1;
        let lease_id = client.create_lease(&owner, &tenant, &arbitrator, &amount, &term);

        client.deposit(&lease_id);

        assert_eq!(usdc.balance(&tenant), 0);
        assert_eq!(usdc.balance(&contract_id), amount);

        env.as_contract(&contract_id, || {
            let lease = storage::get_lease(&env, lease_id);
            assert_eq!(lease.status, LeaseStatus::Funded);
            // MockVault: 1:1 share:asset placeholder (see vault.rs).
            assert_eq!(lease.vault_shares, amount);
        });
    }

    #[test]
    #[should_panic]
    fn deposit_without_tenant_auth_is_rejected() {
        let env = Env::default();
        // No mock_all_auths(): seed the lease and config directly through
        // storage rather than via create_lease, so this test exercises
        // exactly one thing — deposit()'s own auth check — without also
        // depending on create_lease succeeding.
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let tenant = Address::generate(&env);
        let arbitrator = Address::generate(&env);
        let admin = Address::generate(&env);
        let defindex_vault = Address::generate(&env);
        let soroswap_router = Address::generate(&env);
        let usdc_token = Address::generate(&env); // never reached — auth fails first

        let lease_id = 1u64;
        env.as_contract(&contract_id, || {
            storage::set_config(
                &env,
                &Config {
                    admin,
                    defindex_vault,
                    soroswap_router,
                    usdc_token,
                },
            );
            storage::set_lease(
                &env,
                lease_id,
                &Lease {
                    owner,
                    tenant,
                    arbitrator,
                    amount: 1_000_0000000i128,
                    term: env.ledger().timestamp() + 1,
                    status: LeaseStatus::Created,
                    vault_shares: 0,
                },
            );
        });

        client.deposit(&lease_id);
    }

    #[test]
    #[should_panic(expected = "lease is not awaiting deposit")]
    fn deposit_twice_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let tenant = Address::generate(&env);
        let arbitrator = Address::generate(&env);
        let admin = Address::generate(&env);
        let defindex_vault = Address::generate(&env);
        let soroswap_router = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc_token = sac.address();
        let usdc_admin = token::StellarAssetClient::new(&env, &usdc_token);

        let amount = 1_000_0000000i128;
        usdc_admin.mint(&tenant, &(amount * 2));

        env.as_contract(&contract_id, || {
            storage::set_config(
                &env,
                &Config {
                    admin,
                    defindex_vault,
                    soroswap_router,
                    usdc_token,
                },
            );
        });

        let term = env.ledger().timestamp() + 1;
        let lease_id = client.create_lease(&owner, &tenant, &arbitrator, &amount, &term);

        client.deposit(&lease_id);
        client.deposit(&lease_id);
    }
}
