//! `initialize` — sets `Config` once. Without this, `deposit()` and
//! `settle_undisputed()` could never read a `Config` on a live deployment;
//! `lease.rs` flagged this gap in Phase 1.2 and 1.3, and it became a hard
//! blocker the moment a real testnet deploy needed a working smoke test.

use crate::storage;
use crate::types::Config;
use soroban_sdk::{Address, Env};

/// One-time setup, callable by whoever names themselves `admin` — they must
/// authorize this exact call, so nobody else can install themselves as
/// admin. Callable exactly once: a second call, from anyone including the
/// original admin, is rejected outright rather than silently overwriting
/// the addresses everything else depends on.
pub fn initialize(
    env: &Env,
    admin: Address,
    defindex_vault: Address,
    soroswap_router: Address,
    usdc_token: Address,
) {
    admin.require_auth();

    if storage::has_config(env) {
        panic!("already initialized");
    }

    storage::set_config(
        env,
        &Config {
            admin,
            defindex_vault,
            soroswap_router,
            usdc_token,
        },
    );
}

#[cfg(test)]
mod test {
    use crate::storage;
    use crate::types::Config;
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env};

    fn setup(env: &Env) -> Address {
        env.register(EscrowContract, ())
    }

    #[test]
    fn initialize_by_admin_stores_config() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let defindex_vault = Address::generate(&env);
        let soroswap_router = Address::generate(&env);
        let usdc_token = Address::generate(&env);

        client.initialize(&admin, &defindex_vault, &soroswap_router, &usdc_token);

        env.as_contract(&contract_id, || {
            let config = storage::get_config(&env);
            assert_eq!(
                config,
                Config {
                    admin,
                    defindex_vault,
                    soroswap_router,
                    usdc_token,
                }
            );
        });
    }

    #[test]
    #[should_panic]
    fn initialize_without_admin_auth_is_rejected() {
        let env = Env::default();
        // No mock_all_auths(): admin.require_auth() has nothing to
        // authorize against and must panic.
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let defindex_vault = Address::generate(&env);
        let soroswap_router = Address::generate(&env);
        let usdc_token = Address::generate(&env);

        client.initialize(&admin, &defindex_vault, &soroswap_router, &usdc_token);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn initialize_twice_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = setup(&env);
        let client = EscrowContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let defindex_vault = Address::generate(&env);
        let soroswap_router = Address::generate(&env);
        let usdc_token = Address::generate(&env);

        client.initialize(&admin, &defindex_vault, &soroswap_router, &usdc_token);
        client.initialize(&admin, &defindex_vault, &soroswap_router, &usdc_token);
    }
}
