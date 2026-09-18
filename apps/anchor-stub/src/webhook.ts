/**
 * SEP-24 status-change callback delivery. Per spec, a wallet can pass
 * `callback_url` when starting an interactive flow; the anchor POSTs the
 * updated transaction there whenever its status changes. This is the
 * "webhook" side of `apps/api`'s anchor-integration listener.
 */
/**
 * `apiShapedTransaction` must be the same SEP-24 spec shape `GET
 * /transaction` returns (snake_case `amount_in`/`amount_out`/
 * `stellar_transaction_id`, ...) — callers pass their route's own
 * `toApiShape(tx)`, not the internal `Sep24Transaction` record, so a
 * webhook listener can parse this payload with the same code it'd use for
 * a polled status read.
 */
export async function dispatchWebhook(callbackUrl: string | undefined, apiShapedTransaction: Record<string, unknown>): Promise<void> {
  if (!callbackUrl) return;
  try {
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: apiShapedTransaction }),
    });
    if (!res.ok) {
      console.error(`[anchor-stub] webhook to ${callbackUrl} returned ${res.status}`);
    }
  } catch (err) {
    // A wallet's callback endpoint being down is its problem, not a reason
    // to fail the anchor's own state transition — same reasoning a real
    // anchor's webhook dispatcher would use (transaction status is the
    // source of truth; the callback is a courtesy notification).
    console.error(`[anchor-stub] webhook to ${callbackUrl} failed:`, err);
  }
}
