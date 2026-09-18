/**
 * SEP-10: Stellar Web Authentication. Real challenge/response, not
 * simulated — the only thing that makes SEP-12/24/38's "authenticated
 * customer" concept meaningful is that the caller actually controls the
 * Stellar account it claims to.
 */
import { Router } from "express";
import { Keypair, WebAuth } from "@stellar/stellar-sdk";
import { config } from "../config.js";
import { issueToken } from "../jwt.js";
import { anchorAccount } from "../stellarPayments.js";

export const sep10Router = Router();
const serverKeypair = Keypair.fromSecret(config.signingSecret);

sep10Router.get("/auth", (req, res) => {
  const account = req.query.account;
  if (typeof account !== "string" || !account.startsWith("G")) {
    res.status(400).json({ error: "missing or invalid ?account= (expected a Stellar G... address)" });
    return;
  }

  const transaction = WebAuth.buildChallengeTx(
    serverKeypair,
    account,
    config.homeDomain,
    300,
    config.networkPassphrase,
    config.homeDomain,
  );

  res.json({ transaction, network_passphrase: config.networkPassphrase });
});

sep10Router.post("/auth", (req, res) => {
  const signedTransaction = req.body?.transaction;
  if (typeof signedTransaction !== "string") {
    res.status(400).json({ error: "missing 'transaction' (signed challenge XDR, base64) in request body" });
    return;
  }

  let clientAccountID: string;
  try {
    const read = WebAuth.readChallengeTx(
      signedTransaction,
      anchorAccount(),
      config.networkPassphrase,
      config.homeDomain,
      config.homeDomain,
    );
    // For a plain (non-multisig) client account, the only valid signer is
    // the account's own master key — exactly what we pass here.
    WebAuth.verifyChallengeTxSigners(
      signedTransaction,
      anchorAccount(),
      config.networkPassphrase,
      [read.clientAccountID],
      config.homeDomain,
      config.homeDomain,
    );
    clientAccountID = read.clientAccountID;
  } catch (err) {
    res.status(401).json({ error: `challenge verification failed: ${(err as Error).message}` });
    return;
  }

  res.json({ token: issueToken(clientAccountID) });
});
