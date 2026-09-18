/**
 * The one part of this stub that is never simulated: moving real testnet
 * USDC. Deposit completion sends a genuine signed-and-submitted payment
 * from this anchor's own funded distribution account; withdraw completion
 * looks for a genuine incoming payment via Horizon before marking anything
 * done. CLAUDE.md's "Anchor Riski" asks for exactly this split — protocol
 * and settlement real, only the bank/TRY leg simulated.
 */
import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { config } from "./config.js";

const server = new Horizon.Server(config.horizonUrl);
const usdcAsset = new Asset(config.usdcAssetCode, config.usdcIssuer);
const signingKeypair = Keypair.fromSecret(config.signingSecret);

export function anchorAccount(): string {
  return signingKeypair.publicKey();
}

/** A fresh SEP-24-style `id`-type memo for a withdraw transaction, so this anchor (a single pooled account) can match an incoming payment to the transaction that's expecting it. */
export function newWithdrawMemoId(): string {
  // 15 decimal digits comfortably fits in u64 (max ~1.8e19) with room to
  // spare, and is astronomically unlikely to collide with another
  // in-flight withdraw's memo.
  return String(Math.floor(Math.random() * 1e15)).padStart(15, "0");
}

/** Deposit completion: pay the depositor real testnet USDC. */
export async function sendUsdcPayment(destination: string, amount: string): Promise<string> {
  const account = await server.loadAccount(signingKeypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(Operation.payment({ destination, asset: usdcAsset, amount }))
    .setTimeout(60)
    .build();
  tx.sign(signingKeypair);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

/**
 * Withdraw completion check: has `from` sent `memoId`-tagged USDC to this
 * anchor's account yet? Called from the withdraw interactive page's
 * "check" step — this stub doesn't run a background listener, the user
 * (or, in the live test, the test script) triggers the check after sending
 * the payment. A production anchor would instead stream Horizon/RPC
 * payment events and react automatically; polling-on-demand is the
 * simplification here, not the payment verification itself.
 */
export async function findIncomingUsdcPayment(params: {
  from: string;
  memoId: string;
}): Promise<{ amount: string; txHash: string } | null> {
  const page = await server
    .payments()
    .forAccount(signingKeypair.publicKey())
    .join("transactions")
    .order("desc")
    .limit(50)
    .call();

  for (const record of page.records) {
    if (record.type !== "payment") continue;
    const payment = record as Horizon.ServerApi.PaymentOperationRecord;
    if (payment.to !== signingKeypair.publicKey()) continue;
    if (payment.from !== params.from) continue;
    if (payment.asset_type === "native") continue;
    if (payment.asset_code !== config.usdcAssetCode || payment.asset_issuer !== config.usdcIssuer) continue;

    const tx = await payment.transaction();
    if (tx.memo !== params.memoId) continue;

    return { amount: payment.amount, txHash: payment.transaction_hash };
  }
  return null;
}
