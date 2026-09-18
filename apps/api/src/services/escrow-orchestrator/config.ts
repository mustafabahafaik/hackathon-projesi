/**
 * Env config for the escrow-orchestrator. Read once, at import time, so a
 * missing variable fails loudly on startup rather than mid-swap.
 *
 * Testnet only (CLAUDE.md rule 4) — `networkPassphrase` is hardcoded to
 * `Networks.TESTNET` rather than derived from `STELLAR_NETWORK`, so a typo'd
 * env var can't accidentally point this at mainnet.
 *
 * Loads the repo-root `.env` (this project's single `.env.example` lives
 * there, not per-package) as well as `apps/api/.env` for a local override —
 * `dotenv` never overwrites a variable that's already set, so whichever
 * loads first wins, and neither throws if its file is simply missing.
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Networks } from "@stellar/stellar-sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../../../.env") });
loadEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — see .env.example`);
  }
  return value;
}

export const config = {
  sorobanRpcUrl: required("SOROBAN_RPC_URL"),
  networkPassphrase: Networks.TESTNET,
  soroswapRouterAddress: required("SOROSWAP_ROUTER_ADDRESS"),
  usdcTokenAddress: required("USDC_TOKEN_ADDRESS"),
};
