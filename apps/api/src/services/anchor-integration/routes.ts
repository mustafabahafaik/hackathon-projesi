/**
 * HTTP surface for anchor-integration — what `apps/web` calls, decoupled
 * from the anchor's own raw SEP endpoints (`client.ts` talks to those).
 *
 * Flow: the frontend signs the SEP-10 challenge with the tenant's Privy
 * embedded wallet (this backend never holds that private key), then drives
 * `/anchor/sep10/challenge` -> `/anchor/sep10/token` -> `/anchor/deposit`
 * (or `/anchor/withdraw`) -> opens the returned `url` in a webview. The
 * anchor later calls back into `/anchor/callback` (registered as that
 * request's `callback_url`) as the transaction's status changes; that's
 * this service's listening half.
 */
import { Router } from "express";
import { config } from "./config.js";
import {
  getAnchorTransaction,
  getSep10Challenge,
  startInteractiveDeposit,
  startInteractiveWithdraw,
  submitSep10Challenge,
} from "./client.js";
import { anchorStore } from "./store.js";

export const anchorRouter = Router();

anchorRouter.post("/anchor/sep10/challenge", async (req, res) => {
  const account = req.body?.account;
  if (typeof account !== "string") {
    res.status(400).json({ error: "account (Stellar G... address) is required" });
    return;
  }
  try {
    res.json(await getSep10Challenge(account));
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

anchorRouter.post("/anchor/sep10/token", async (req, res) => {
  const transaction = req.body?.transaction;
  if (typeof transaction !== "string") {
    res.status(400).json({ error: "transaction (client-signed challenge XDR) is required" });
    return;
  }
  try {
    res.json({ token: await submitSep10Challenge(transaction) });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

async function startFlow(
  kind: "deposit" | "withdraw",
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  const { leaseId, account, token } = req.body ?? {};
  if (typeof leaseId !== "string" || typeof account !== "string" || typeof token !== "string") {
    res.status(400).json({ error: "leaseId, account, and token (SEP-10 session token) are required" });
    return;
  }
  try {
    const start = kind === "deposit" ? startInteractiveDeposit : startInteractiveWithdraw;
    const flow = await start({ token, assetCode: config.usdcAssetCode, callbackUrl: `${config.baseUrl}/anchor/callback` });
    anchorStore.track({ id: flow.id, leaseId, kind, account, status: "incomplete" });
    res.json(flow);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}

anchorRouter.post("/anchor/deposit", (req, res) => startFlow("deposit", req, res));
anchorRouter.post("/anchor/withdraw", (req, res) => startFlow("withdraw", req, res));

anchorRouter.get("/anchor/leases/:leaseId/transactions", (req, res) => {
  res.json({ transactions: anchorStore.listByLease(req.params.leaseId) });
});

/** Live status refresh, bypassing the local cache — for when the frontend still holds the SEP-10 token and wants a source-of-truth read instead of waiting on the next webhook. */
anchorRouter.get("/anchor/transactions/:id", async (req, res) => {
  const token = req.query.token;
  if (typeof token !== "string") {
    res.status(400).json({ error: "?token= (SEP-10 session token) is required" });
    return;
  }
  try {
    res.json(await getAnchorTransaction({ token, id: req.params.id }));
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/**
 * SEP-24 webhook: the anchor POSTs `{ transaction }` here whenever a
 * tracked transaction's status changes. Once a deposit lands as
 * `completed`, this is the trigger point for the next MVP step
 * (escrow-orchestrator's Soroswap -> DeFindex -> `deposit()` chain) — not
 * wired yet; that chaining is a separate piece of work from "listen for
 * the callback," which is what this endpoint does.
 */
anchorRouter.post("/anchor/callback", (req, res) => {
  const incoming = req.body?.transaction;
  if (!incoming?.id) {
    res.status(400).json({ error: "missing transaction.id in callback body" });
    return;
  }
  const updated = anchorStore.applyCallback(incoming.id, {
    status: incoming.status,
    amountTry: incoming.amount_in,
    amountUsdc: incoming.amount_out,
    stellarTransactionId: incoming.stellar_transaction_id,
  });
  if (!updated) {
    console.warn(`[anchor-integration] callback for untracked transaction ${incoming.id}`);
    res.status(202).json({ ok: true, tracked: false });
    return;
  }
  console.log(`[anchor-integration] lease ${updated.leaseId} transaction ${updated.id} -> ${updated.status}`);
  res.json({ ok: true, tracked: true });
});
