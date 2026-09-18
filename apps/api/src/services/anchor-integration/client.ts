/**
 * Thin client for whichever anchor `config.anchorHomeDomain` points at —
 * discovered via its SEP-1 `stellar.toml`, not hardcoded, so this same
 * code works against the anchor-stub today and a real testnet TRY anchor
 * later (CLAUDE.md "Anchor Riski") with only an env var changing.
 *
 * Only the handful of `stellar.toml` keys SEP-24 needs are parsed here
 * (flat `KEY="value"` lines) — good enough for both the stub's own toml
 * and any spec-compliant anchor's top-level fields; nested tables like
 * `[[CURRENCIES]]` aren't needed by this client and aren't parsed.
 */
import { config } from "./config.js";

interface AnchorToml {
  webAuthEndpoint: string;
  transferServerSep24: string;
  signingKey: string;
}

let cachedToml: AnchorToml | undefined;

function parseToml(text: string): AnchorToml {
  const field = (key: string): string => {
    const match = text.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
    if (!match) throw new Error(`stellar.toml missing ${key}`);
    return match[1];
  };
  return {
    webAuthEndpoint: field("WEB_AUTH_ENDPOINT"),
    transferServerSep24: field("TRANSFER_SERVER_SEP0024"),
    signingKey: field("SIGNING_KEY"),
  };
}

async function anchorToml(): Promise<AnchorToml> {
  if (cachedToml) return cachedToml;
  const res = await fetch(`${config.anchorHomeDomain}/.well-known/stellar.toml`);
  if (!res.ok) throw new Error(`failed to fetch anchor stellar.toml: ${res.status}`);
  cachedToml = parseToml(await res.text());
  return cachedToml;
}

/** Step 1 of SEP-10: get the challenge transaction for `account` to sign with its own key (client-side, e.g. the tenant's Privy embedded wallet). */
export async function getSep10Challenge(account: string): Promise<{ transaction: string; network_passphrase: string }> {
  const toml = await anchorToml();
  const res = await fetch(`${toml.webAuthEndpoint}?account=${encodeURIComponent(account)}`);
  if (!res.ok) throw new Error(`SEP-10 challenge request failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ transaction: string; network_passphrase: string }>;
}

/** Step 2 of SEP-10: exchange the client-signed challenge for a session token. */
export async function submitSep10Challenge(signedTransactionXdr: string): Promise<string> {
  const toml = await anchorToml();
  const res = await fetch(toml.webAuthEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transaction: signedTransactionXdr }),
  });
  if (!res.ok) throw new Error(`SEP-10 token exchange failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

export interface InteractiveFlowResult {
  id: string;
  url: string;
}

async function startInteractive(kind: "deposit" | "withdraw", params: {
  token: string;
  assetCode: string;
  callbackUrl: string;
}): Promise<InteractiveFlowResult> {
  const toml = await anchorToml();
  const res = await fetch(`${toml.transferServerSep24}/transactions/${kind}/interactive`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Bearer ${params.token}`,
    },
    body: new URLSearchParams({ asset_code: params.assetCode, callback_url: params.callbackUrl }),
  });
  if (!res.ok) throw new Error(`SEP-24 ${kind} interactive request failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<InteractiveFlowResult>;
}

export const startInteractiveDeposit = (params: { token: string; assetCode: string; callbackUrl: string }) =>
  startInteractive("deposit", params);

export const startInteractiveWithdraw = (params: { token: string; assetCode: string; callbackUrl: string }) =>
  startInteractive("withdraw", params);

export type AnchorTransactionStatus =
  | "incomplete"
  | "pending_user_transfer_start"
  | "pending_anchor"
  | "completed"
  | "error";

export interface AnchorTransaction {
  id: string;
  kind: "deposit" | "withdraw";
  status: AnchorTransactionStatus;
  amount_in?: string;
  amount_out?: string;
  stellar_transaction_id?: string;
}

export async function getAnchorTransaction(params: { token: string; id: string }): Promise<AnchorTransaction> {
  const toml = await anchorToml();
  const res = await fetch(`${toml.transferServerSep24}/transaction?id=${encodeURIComponent(params.id)}`, {
    headers: { authorization: `Bearer ${params.token}` },
  });
  if (!res.ok) throw new Error(`SEP-24 transaction lookup failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { transaction: AnchorTransaction };
  return body.transaction;
}
