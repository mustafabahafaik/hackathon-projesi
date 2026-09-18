/**
 * Soroswap swap orchestration — the escrow-orchestrator's currency leg.
 * Converts whatever asset the anchor hands back after a TRY deposit into
 * USDC, before `deposit()` is called on the escrow contract, and does the
 * reverse on withdrawal (USDC -> anchor asset, before handing it to the
 * anchor for a TRY payout).
 *
 * ## Deviation from the architecture doc (CLAUDE.md rule 10)
 *
 * This calls the real testnet Soroswap Router **contract**
 * (`SOROSWAP_ROUTER_ADDRESS`, see `.env.example`) directly, via
 * `@stellar/stellar-sdk`'s `contract.Client` — not the hosted Soroswap API
 * (`api.soroswap.finance`) the architecture doc names.
 *
 * Reason: the hosted API requires a `sk_...` key, issued by `POST /register`
 * + `POST /login` + `POST /api-keys/generate`. `/register`'s own response
 * says the account "will be disabled until it is activated by an
 * administrator" — confirmed empirically, not assumed: every swap endpoint
 * (`/quote`, `/quote/build`, `/send`) returns `403 Forbidden` without a key,
 * and getting one needs a human at Soroswap to act, on a timeline this
 * session has no visibility into or control over. The router contract
 * itself needs no such key — it's the same contract the hosted API calls
 * into once it has a route, so calling it directly is still calling the
 * real Soroswap protocol on testnet, not a mock.
 *
 * Consequence: no automatic multi-hop route finding — that's the hosted
 * Aggregator's job (searching many pools/AMMs for the best path). Every
 * function here takes an explicit `path`, defaulting to the direct two-hop
 * `[assetIn, assetOut]`. That's sufficient where a direct pool exists (this
 * module's own live test found and used a real one — see
 * `apps/api/src/scripts/soroswap-integration-test.ts`), but a thin
 * anchor-asset market without a direct USDC pool would need an explicit
 * multi-hop `path` threaded through pools that do have liquidity.
 *
 * Also found the hard way, against real testnet: `swap_exact_tokens_for_
 * tokens` has no side-effect-free "just compute the number" variant — even
 * a pure simulation runs its real internal `transfer` to `to`, trustline
 * check included. So `quoteExactIn` needs a genuinely valid `to` (one that
 * can hold `assetOut`), not a throwaway probe address — see its own doc
 * comment.
 */
import { Keypair, contract } from "@stellar/stellar-sdk";
import { config } from "./config.js";

const DEFAULT_SLIPPAGE_BPS = 50n; // 0.5% — matches the hosted Soroswap API's own documented example default
const DEFAULT_DEADLINE_SECONDS = 300; // 5 minutes

/**
 * The one router method this module calls, typed for `contract.Client`.
 * Returns `contract.Result<bigint[]>`, not a plain `bigint[]`: the Rust
 * function's own signature is `Result<Vec<i128>, CombinedRouterError>`, and
 * unlike a `#[contracterror]`-only failure (which traps the whole call),
 * this `Result` comes back as real data on the wire — an `Ok`/`Err` value
 * the SDK decodes rather than something it unwraps for you. Found by
 * actually inspecting a live response (`.result` was `Ok { value: [...] }`,
 * not an array) rather than assumed from the Rust signature.
 */
interface RouterContract {
  swap_exact_tokens_for_tokens: (args: {
    amount_in: bigint;
    amount_out_min: bigint;
    path: string[];
    to: string;
    deadline: bigint;
  }) => Promise<contract.AssembledTransaction<contract.Result<bigint[]>>>;
}

function deadline(seconds = DEFAULT_DEADLINE_SECONDS): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + seconds);
}

/**
 * `signer` omitted -> a client good for simulation only (quotes): Soroban
 * RPC simulation runs in "recording auth" mode regardless of whether the
 * source account is real, the same reason `stellar contract invoke
 * --send=no` never needs a signature either. `contract.NULL_ACCOUNT` (used
 * automatically by the SDK when no `publicKey` is given) stands in as the
 * tx source.
 */
function routerClient(signer?: Keypair): Promise<contract.Client & RouterContract> {
  return contract.Client.from<RouterContract>({
    contractId: config.soroswapRouterAddress,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.sorobanRpcUrl,
    publicKey: signer?.publicKey(),
    signTransaction: signer,
  });
}

export interface SwapQuote {
  path: string[];
  /** Amount at each hop of `path`, router-native units — `amounts[0]` is `amountIn`. */
  amounts: bigint[];
  amountOut: bigint;
}

/**
 * Previews a swap without signing or submitting anything: simulates
 * `swap_exact_tokens_for_tokens` against current chain state — the exact
 * same simulation a real call would run — and reads back the amounts it
 * would produce. This is the "quote" step: a genuine chain-state read
 * (real reserves, real constant-product math), not a formula this module
 * computes itself.
 *
 * `to` is required, and has to be an account that can actually receive
 * `assetOut` (a classic asset like this USDC needs an established
 * trustline) — confirmed the hard way against real testnet, not assumed:
 * `swap_exact_tokens_for_tokens` has no side-effect-free variant, so even a
 * pure simulation runs its real internal `transfer` to `to`, trustline
 * check included, and traps with `Error(Contract, #13)` ("trustline entry
 * is missing") if that account can't hold the asset. Passing the eventual
 * real recipient (what `swapExactIn` does, quoting before it signs) is both
 * correct and necessary, not just convenient.
 */
export async function quoteExactIn(params: {
  assetIn: string;
  assetOut: string;
  amountIn: bigint;
  to: string;
  path?: string[];
}): Promise<SwapQuote> {
  const path = params.path ?? [params.assetIn, params.assetOut];
  const client = await routerClient();
  const tx = await client.swap_exact_tokens_for_tokens({
    amount_in: params.amountIn,
    amount_out_min: 0n,
    path,
    to: params.to,
    deadline: deadline(),
  });
  const amounts = tx.result.unwrap();
  return { path, amounts, amountOut: amounts[amounts.length - 1] };
}

export interface SwapResult {
  txHash: string;
  path: string[];
  amounts: bigint[];
  amountOut: bigint;
}

/**
 * Quotes, then signs and submits a real `swap_exact_tokens_for_tokens` call
 * — the "imzalayıp gönderme" (sign + send) half of the integration.
 * `signer` both authorizes the swap (its `assetIn` balance is what moves)
 * and pays the fee; `to` receives `assetOut` and doesn't need to be the
 * same account — typically the escrow contract itself.
 *
 * `amount_out_min` is derived from the quote and `slippageBps`, not left at
 * `0`: the whole point of a slippage bound is to make the *signed*
 * transaction reject a worse price than quoted, so an unrelated swap
 * landing in the same ledger can't silently move funds through this pool
 * at a bad rate before ours executes.
 */
export async function swapExactIn(params: {
  assetIn: string;
  assetOut: string;
  amountIn: bigint;
  to: string;
  signer: Keypair;
  path?: string[];
  slippageBps?: bigint;
  deadlineSeconds?: number;
}): Promise<SwapResult> {
  const path = params.path ?? [params.assetIn, params.assetOut];
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;

  const quote = await quoteExactIn({
    assetIn: params.assetIn,
    assetOut: params.assetOut,
    amountIn: params.amountIn,
    to: params.to,
    path,
  });
  const amountOutMin = (quote.amountOut * (10_000n - slippageBps)) / 10_000n;

  const client = await routerClient(params.signer);
  const tx = await client.swap_exact_tokens_for_tokens({
    amount_in: params.amountIn,
    amount_out_min: amountOutMin,
    path,
    to: params.to,
    deadline: deadline(params.deadlineSeconds),
  });
  const sent = await tx.signAndSend();
  const amounts = sent.result.unwrap();
  const txHash = sent.sendTransactionResponse?.hash;
  if (!txHash) {
    throw new Error("swap submitted but no transaction hash came back — check sendTransactionResponse");
  }

  return { txHash, path, amounts, amountOut: amounts[amounts.length - 1] };
}

/** Anchor asset -> USDC — the leg `deposit()`'s orchestration needs before calling the escrow contract. */
export function swapAnchorAssetToUsdc(params: {
  anchorAsset: string;
  amountIn: bigint;
  to: string;
  signer: Keypair;
  path?: string[];
  slippageBps?: bigint;
}): Promise<SwapResult> {
  return swapExactIn({
    assetIn: params.anchorAsset,
    assetOut: config.usdcTokenAddress,
    amountIn: params.amountIn,
    to: params.to,
    signer: params.signer,
    path: params.path,
    slippageBps: params.slippageBps,
  });
}

/** USDC -> anchor asset — the reverse leg on withdrawal, before handing the asset to the anchor for a TRY payout. */
export function swapUsdcToAnchorAsset(params: {
  anchorAsset: string;
  amountIn: bigint;
  to: string;
  signer: Keypair;
  path?: string[];
  slippageBps?: bigint;
}): Promise<SwapResult> {
  return swapExactIn({
    assetIn: config.usdcTokenAddress,
    assetOut: params.anchorAsset,
    amountIn: params.amountIn,
    to: params.to,
    signer: params.signer,
    path: params.path,
    slippageBps: params.slippageBps,
  });
}
