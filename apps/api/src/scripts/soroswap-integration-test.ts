/**
 * Live Soroswap integration test — proves the escrow-orchestrator's swap
 * module against the REAL testnet Soroswap router, in both directions,
 * with real signed-and-submitted transactions. Nothing here is mocked:
 * every amount below is either read back from what the router itself
 * returned or from a real on-chain balance query (CLAUDE.md rule 1).
 *
 * Fully self-contained and re-runnable: generates a fresh throwaway
 * keypair, funds it with Friendbot, and cleans up nothing (testnet, no
 * need) — no dependency on any identity from a prior session.
 *
 * Stands in for the anchor asset with native XLM's Stellar Asset Contract,
 * since this repo has no real anchor integration yet (a later phase per
 * CLAUDE.md) and a real, liquid XLM/USDC pool already exists on testnet
 * Soroswap (confirmed live: ~1528 XLM / ~8714 USDC in reserves at the time
 * this script was written) — the same "use a real asset that already has
 * what the flow needs" approach `scripts/defindex-integration-test.sh`
 * takes with its own faucet-funded USDC.
 *
 * Usage (from apps/api): npm run test:soroswap-live
 * Needs SOROBAN_RPC_URL / SOROSWAP_ROUTER_ADDRESS / USDC_TOKEN_ADDRESS set
 * (repo-root .env, or apps/api/.env, or the shell environment) — see
 * .env.example.
 */
import { Asset, BASE_FEE, Keypair, Operation, TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import { config } from "../services/escrow-orchestrator/config.js";
import { quoteExactIn, swapAnchorAssetToUsdc, swapUsdcToAnchorAsset } from "../services/escrow-orchestrator/soroswap.js";

// The issuer behind USDC_TOKEN_ADDRESS — Blend Capital's testnet faucet
// account (see contracts/escrow's docs/submission.md, Faz 2.1, which
// independently confirmed this same USDC token). A classic-asset trustline
// is required before this fresh account can receive it, same as any
// Stellar account.
const USDC_ISSUER = "GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56";
const NATIVE_XLM = Asset.native().contractId(config.networkPassphrase);

// 50 XLM (7 decimals) — comfortably inside the pool's reserves without
// moving the price enough to make a second swap's slippage bound bite.
const SWAP_AMOUNT_XLM = 50_0000000n;

function log(message: string): void {
  console.log(`[soroswap-live-test] ${message}`);
}

async function establishUsdcTrustline(server: rpc.Server, signer: Keypair): Promise<void> {
  const account = await server.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset("USDC", USDC_ISSUER) }))
    .setTimeout(30)
    .build();
  tx.sign(signer);

  const sent = await server.sendTransaction(tx);
  const result = await server.pollTransaction(sent.hash);
  if (result.status !== "SUCCESS") {
    throw new Error(`changeTrust(USDC) did not succeed: ${JSON.stringify(result)}`);
  }
  log(`USDC trustline established — tx ${sent.hash}`);
}

async function balanceOf(server: rpc.Server, tokenAddress: string, holder: string): Promise<bigint> {
  const { result } = await server.queryContract<bigint>(tokenAddress, "balance", { id: holder });
  return result;
}

async function main(): Promise<void> {
  const server = new rpc.Server(config.sorobanRpcUrl);
  const signer = Keypair.random();
  log(`test account: ${signer.publicKey()}`);

  log("funding via Friendbot (real testnet faucet)");
  await server.fundAddress(signer.publicKey());
  await establishUsdcTrustline(server, signer);

  const xlmBefore = await balanceOf(server, NATIVE_XLM, signer.publicKey());
  const usdcBefore = await balanceOf(server, config.usdcTokenAddress, signer.publicKey());
  log(`starting balances — XLM: ${xlmBefore}, USDC: ${usdcBefore}`);

  // ---- direction 1: anchor-asset stand-in (XLM) -> USDC ----
  const quote1 = await quoteExactIn({
    assetIn: NATIVE_XLM,
    assetOut: config.usdcTokenAddress,
    amountIn: SWAP_AMOUNT_XLM,
    to: signer.publicKey(),
  });
  log(`quote XLM->USDC: ${SWAP_AMOUNT_XLM} -> ${quote1.amountOut} (path: ${quote1.path.join(" -> ")})`);

  const swap1 = await swapAnchorAssetToUsdc({
    anchorAsset: NATIVE_XLM,
    amountIn: SWAP_AMOUNT_XLM,
    to: signer.publicKey(),
    signer,
  });
  log(`swap XLM->USDC sent — tx ${swap1.txHash}, router-reported amountOut=${swap1.amountOut}`);

  const usdcAfterSwap1 = await balanceOf(server, config.usdcTokenAddress, signer.publicKey());
  const usdcGained = usdcAfterSwap1 - usdcBefore;
  log(`USDC balance actually moved by ${usdcGained}`);
  if (usdcGained !== swap1.amountOut) {
    throw new Error(
      `FAIL: on-chain USDC balance delta (${usdcGained}) does not match the router's own reported amountOut (${swap1.amountOut})`,
    );
  }

  // ---- direction 2: USDC -> anchor-asset stand-in (XLM), reverse ----
  const swapBackAmount = usdcGained; // swap every bit we just received back
  const quote2 = await quoteExactIn({
    assetIn: config.usdcTokenAddress,
    assetOut: NATIVE_XLM,
    amountIn: swapBackAmount,
    to: signer.publicKey(),
  });
  log(`quote USDC->XLM: ${swapBackAmount} -> ${quote2.amountOut} (path: ${quote2.path.join(" -> ")})`);

  const swap2 = await swapUsdcToAnchorAsset({
    anchorAsset: NATIVE_XLM,
    amountIn: swapBackAmount,
    to: signer.publicKey(),
    signer,
  });
  log(`swap USDC->XLM sent — tx ${swap2.txHash}, router-reported amountOut=${swap2.amountOut}`);

  const usdcAfterSwap2 = await balanceOf(server, config.usdcTokenAddress, signer.publicKey());
  if (usdcAfterSwap2 !== 0n) {
    throw new Error(`FAIL: expected 0 USDC left after swapping it all back, got ${usdcAfterSwap2}`);
  }

  const roundTripCost = SWAP_AMOUNT_XLM - swap2.amountOut;
  log(
    `PASS: both directions swapped on testnet via the real Soroswap router (${config.soroswapRouterAddress}). ` +
      `${SWAP_AMOUNT_XLM} XLM -> ${swap1.amountOut} USDC -> ${swap2.amountOut} XLM ` +
      `(round-trip cost, AMM fees + price movement: ${roundTripCost} stroops).`,
  );
}

main().catch((err) => {
  console.error("[soroswap-live-test] FAIL:", err);
  process.exitCode = 1;
});
