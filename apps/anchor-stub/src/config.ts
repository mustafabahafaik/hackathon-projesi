/**
 * Env config for the anchor stub. Loaded once at import time so a missing
 * variable fails loudly on startup.
 *
 * This stub exists per CLAUDE.md's "Anchor Riski": no real testnet TRY
 * anchor was usable at build time (see docs/architecture.md for the
 * one-line note this section's own rule requires), so this implements
 * SEP-1/6/10/12/24/38 itself — protocol-complete, with only the bank
 * transfer leg simulated (`FX_RATE_TRY_PER_USDC` below stands in for a real
 * quote feed; everything Stellar-side is genuine, signed, submitted
 * testnet transactions).
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Networks } from "@stellar/stellar-sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env") });
loadEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — see .env.example`);
  }
  return value;
}

export const config = {
  port: Number(process.env.ANCHOR_PORT ?? 4001),
  // The domain SEP-10 challenges are issued for. In production this would
  // be the anchor's real public hostname; for local dev/testing it's just
  // where this server happens to listen.
  homeDomain: process.env.ANCHOR_HOME_DOMAIN || `localhost:${process.env.ANCHOR_PORT ?? 4001}`,
  baseUrl: process.env.ANCHOR_BASE_URL || `http://localhost:${process.env.ANCHOR_PORT ?? 4001}`,
  networkPassphrase: Networks.TESTNET,
  horizonUrl: process.env.HORIZON_URL || "https://horizon-testnet.stellar.org",
  signingSecret: required("ANCHOR_SIGNING_SECRET"),
  // Symmetric HS256 secret for SEP-10 session JWTs — fine for a stub; a
  // real anchor would rotate this and keep it in a secrets manager, not
  // committed even as an example default outside this repo's own testnet
  // sandbox use.
  jwtSecret: process.env.ANCHOR_JWT_SECRET || "depozito-anchor-stub-dev-secret",
  usdcAssetCode: "USDC",
  usdcIssuer: required("USDC_ISSUER"),
  // Simulated FX rate — the one deliberately fake number in this whole
  // service, standing in for a real bank/market quote feed. Everything
  // downstream of it (the actual USDC amount sent, the Stellar tx) is real.
  fxRateTryPerUsdc: Number(process.env.ANCHOR_FX_RATE_TRY_PER_USDC ?? 34.5),
};
