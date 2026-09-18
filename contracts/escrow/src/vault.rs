//! The DeFindex vault integration — `deposit()` and `settle_undisputed()`/
//! `initiate_dispute()` (`lease.rs` / `dispute.rs`) call this after moving
//! USDC in or before moving it back out.
//!
//! Phase 1.2 shipped a `MockVault` that never actually moved a token
//! anywhere or called another contract — see git history for that version.
//! This is the real integration: `DefindexVault::deposit`/`withdraw` make a
//! genuine cross-contract call to whatever contract `Config::defindex_vault`
//! names, using DeFindex's own vault interface. That interface was
//! confirmed against the actual deployed testnet vault with `stellar
//! contract info interface --id CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN
//! --network testnet` (DeFindex's Paltalabs USDC vault — see
//! `docs/submission.md` for the full command output and the source
//! (`paltalabs/defindex` on GitHub) that confirmed how it moves funds), not
//! just DeFindex's docs — CLAUDE.md rule 1 forbids taking an integration's
//! shape on faith.
//!
//! DeFindex's `deposit`/`withdraw` work in `Vec<i128>` (one entry per asset
//! the vault holds) because a vault can hold more than one underlying
//! asset; this escrow only ever deals with one (USDC), so every call here
//! wraps/unwraps a single-element vector.

use soroban_sdk::auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation};
use soroban_sdk::{contractclient, Address, Env, IntoVal, Symbol, Val, Vec};

/// The slice of DeFindex's real vault interface this contract needs.
///
/// Declaring `deposit`/`withdraw` without their on-chain
/// `Result<_, ContractError>` wrapper is deliberate, not an approximation:
/// a cross-contract call to a function that returns `Result<T, E>` where
/// `E: contracterror` delivers `T`'s encoding directly to the caller on
/// success and traps the whole call on `Err` — so declaring a plain `T`
/// return type here gets that same "unwrap on success, panic through on
/// error" behavior without this crate needing to depend on DeFindex's own
/// crate just for its `ContractError`/`AssetInvestmentAllocation` types
/// (`soroban_sdk::token::TokenInterface`'s own client does the same thing,
/// for the same reason — see its doc comment).
///
/// The `Val` in `deposit`'s third slot is DeFindex's per-strategy
/// investment breakdown, which this contract has no use for. `Val` decodes
/// any Soroban value without needing to know its concrete shape, so it's
/// the honest "this contract deliberately doesn't interpret that part of
/// the response" type here — not a shortcut around a shape we do care
/// about, the way it would be for the `Vec<i128>` amounts or the `i128`
/// shares count next to it.
// The trait itself is never implemented in this crate — it only exists for
// `#[contractclient]` to generate `DefindexVaultClient` from — so rustc's
// dead-code lint doesn't see it as "used" even though the client it
// produces is load-bearing.
#[allow(dead_code)]
#[contractclient(name = "DefindexVaultClient")]
pub trait DefindexVaultInterface {
    fn deposit(
        env: Env,
        amounts_desired: Vec<i128>,
        amounts_min: Vec<i128>,
        from: Address,
        invest: bool,
    ) -> (Vec<i128>, i128, Val);

    fn withdraw(env: Env, withdraw_shares: i128, min_amounts_out: Vec<i128>, from: Address) -> Vec<i128>;
}

pub trait Vault {
    /// Deposits `amount` of `asset` (the escrow's held token) into
    /// `vault_address` and returns the vault shares minted. Takes `asset`
    /// explicitly — unlike `withdraw` below — because building the deposit
    /// call requires it; see `DefindexVault::deposit`'s own doc comment for
    /// why.
    fn deposit(env: &Env, vault_address: &Address, asset: &Address, amount: i128) -> i128;

    /// Redeems `shares` from `vault_address` and returns the asset amount
    /// received (principal plus any accrued yield).
    fn withdraw(env: &Env, vault_address: &Address, shares: i128) -> i128;
}

pub struct DefindexVault;

impl Vault for DefindexVault {
    /// `invest: true` — DeFindex should route the deposit into its
    /// underlying strategy immediately rather than leave it idle; nothing
    /// about the product's "depozito ne ev sahibinde ne kiracıda durur,
    /// getiri üretir" claim (CLAUDE.md) holds if the funds just sit
    /// uninvested in the vault.
    ///
    /// `amounts_min == amounts_desired`: this vault holds exactly one asset
    /// (USDC, confirmed via `get_assets()` against the live testnet vault —
    /// see the module doc) and this deposit never swaps, so there's no
    /// legitimate slippage to tolerate — requiring the full amount go in is
    /// the honest "reject the unexpected" choice, not an arbitrary
    /// placeholder.
    ///
    /// The `authorize_as_current_contract` call below is not optional
    /// ceremony — without it this panics with an Auth error on both a real
    /// testnet call and in a local test. DeFindex's own `deposit()` checks
    /// `from.require_auth()` directly (one hop: escrow calls vault, vault
    /// checks escrow's auth — Soroban auto-authorizes that, since a
    /// contract's own direct calls are always considered authorized), but
    /// it then internally calls `asset_client.transfer(&from, ...)` on the
    /// USDC token *from inside the vault* — a second hop (escrow -> vault
    /// -> token) that Soroban does **not** auto-authorize, because the
    /// vault (not escrow) is that call's direct caller even though `from`
    /// still names escrow. Escrow has to pre-declare that specific
    /// downstream call as something it authorizes the vault to make on its
    /// behalf. `withdraw` doesn't need this: the vault's matching transfer
    /// there moves funds *from the vault's own address*, which the vault
    /// self-authorizes as its own direct call.
    fn deposit(env: &Env, vault_address: &Address, asset: &Address, amount: i128) -> i128 {
        let from = env.current_contract_address();

        env.authorize_as_current_contract(Vec::from_array(
            env,
            [InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: asset.clone(),
                    fn_name: Symbol::new(env, "transfer"),
                    args: Vec::from_array(
                        env,
                        [from.into_val(env), vault_address.into_val(env), amount.into_val(env)],
                    ),
                },
                sub_invocations: Vec::new(env),
            })],
        ));

        let client = DefindexVaultClient::new(env, vault_address);
        let amounts = Vec::from_array(env, [amount]);
        let (_amounts_deposited, shares_minted, _strategy_allocation) =
            client.deposit(&amounts, &amounts, &from, &true);
        shares_minted
    }

    /// `min_amounts_out` of `0`: same single-asset reasoning as `deposit`'s
    /// `amounts_min`, in the other direction — there's no swap to protect
    /// against, and the caller (`settle_undisputed`/`initiate_dispute`)
    /// commits to paying out whatever the vault actually returns, not a
    /// number decided in advance.
    fn withdraw(env: &Env, vault_address: &Address, shares: i128) -> i128 {
        let client = DefindexVaultClient::new(env, vault_address);
        let min_amounts_out = Vec::from_array(env, [0i128]);
        let amounts = client.withdraw(&shares, &min_amounts_out, &env.current_contract_address());
        amounts
            .get(0)
            .expect("defindex vault returned no amounts for a single-asset withdraw")
    }
}

/// A stand-in DeFindex vault, used ONLY by this crate's own unit tests
/// (`#[cfg(test)]`) so `DefindexVault::deposit`/`withdraw`'s cross-contract
/// call has a real contract to call locally, without reaching testnet.
///
/// It implements the exact slice of DeFindex's real interface
/// (`DefindexVaultInterface` above) that this crate calls — same function
/// names, same argument and return shapes, and it genuinely moves the
/// underlying token (mirroring the real vault's `asset_client.transfer`
/// calls) rather than just faking a number — so what's under test is the
/// real `DefindexVaultClient` call path, not a bypass of it.
///
/// This is NOT the proof that this contract talks to the *genuine*
/// DeFindex vault, though — a local test double can't be, by definition.
/// `scripts/defindex-integration-test.sh` is what actually proves that,
/// against the real testnet vault (CLAUDE.md rule 1).
///
/// Mints/burns shares 1:1 with the deposited/withdrawn amount — the same
/// placeholder ratio the old `MockVault` used — since this double exists to
/// exercise the *call*, not to model DeFindex's real share-pricing math.
#[cfg(test)]
pub mod test_double {
    use soroban_sdk::{contract, contracttype, contractimpl, token, Address, Env, IntoVal, Val, Vec};

    /// Instance storage: which SEP-41 token this test double moves. Not
    /// part of DeFindex's real `deposit`/`withdraw` signatures (the real
    /// vault already knows its own asset internally — see `get_assets()`
    /// in the module doc), so it's set once via `init` instead of taking it
    /// as a call parameter, keeping `deposit`/`withdraw`'s signatures an
    /// exact match for `DefindexVaultInterface`.
    #[contracttype]
    enum DataKey {
        Asset,
    }

    #[contract]
    pub struct TestDefindexVault;

    #[contractimpl]
    impl TestDefindexVault {
        pub fn init(env: Env, asset: Address) {
            env.storage().instance().set(&DataKey::Asset, &asset);
        }

        pub fn deposit(
            env: Env,
            amounts_desired: Vec<i128>,
            amounts_min: Vec<i128>,
            from: Address,
            _invest: bool,
        ) -> (Vec<i128>, i128, Val) {
            from.require_auth();
            let amount = amounts_desired.get(0).expect("single-asset test vault");
            assert!(amount >= amounts_min.get(0).expect("single-asset test vault"));

            let asset: Address = env.storage().instance().get(&DataKey::Asset).expect("test double not init'd");
            token::Client::new(&env, &asset).transfer(&from, &env.current_contract_address(), &amount);

            (amounts_desired, amount, ().into_val(&env))
        }

        pub fn withdraw(
            env: Env,
            withdraw_shares: i128,
            min_amounts_out: Vec<i128>,
            from: Address,
        ) -> Vec<i128> {
            from.require_auth();
            assert!(withdraw_shares >= min_amounts_out.get(0).expect("single-asset test vault"));

            let asset: Address = env.storage().instance().get(&DataKey::Asset).expect("test double not init'd");
            token::Client::new(&env, &asset).transfer(&env.current_contract_address(), &from, &withdraw_shares);

            Vec::from_array(&env, [withdraw_shares])
        }
    }
}
