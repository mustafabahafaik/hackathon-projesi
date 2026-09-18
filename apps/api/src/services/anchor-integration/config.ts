/**
 * Env config for anchor-integration. Same load pattern as
 * escrow-orchestrator/config.ts — repo-root `.env` first, then any local
 * `apps/api/.env` override; `dotenv` never clobbers an already-set var.
 *
 * `anchorHomeDomain` decides which anchor this service talks to: point it
 * at the anchor-stub's own base URL (default, `http://localhost:4001`) if
 * no real testnet TRY anchor is available, or swap it for a real anchor's
 * domain once Workshop #3 confirms one (CLAUDE.md "Anchor Riski") — no
 * code change needed either way, since every endpoint here is discovered
 * from that domain's `/.well-known/stellar.toml` (SEP-1), not hardcoded.
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
  port: Number(process.env.API_PORT ?? 4000),
  // Where this API itself is reachable from the anchor — used to build the
  // `callback_url` passed into SEP-24's deposit/withdraw interactive calls,
  // so the anchor's webhook lands on /anchor/callback below.
  baseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.API_PORT ?? 4000}`,
  anchorHomeDomain: process.env.ANCHOR_HOME_DOMAIN || "http://localhost:4001",
  usdcAssetCode: "USDC",
  usdcIssuer: required("USDC_ISSUER"),
};
