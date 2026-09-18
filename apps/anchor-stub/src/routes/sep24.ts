/**
 * SEP-24: Hosted Deposit and Withdrawal. This is the flow apps/api's
 * anchor-integration service drives — the interactive page below is what a
 * wallet opens in a webview/iframe after starting a transaction here.
 *
 * The deposit page's "Yatır" submit really sends real testnet USDC
 * (`sendUsdcPayment`, signed by this stub's own funded account) to the
 * depositor. The withdraw page's "Kontrol et" really checks Horizon for a
 * real incoming USDC payment (`findIncomingUsdcPayment`) before completing.
 * Only the TRY leg on either side — the deposit's "bank transfer in", the
 * withdraw's "bank payout out" — is simulated (a console log stands in for
 * a bank rail), per CLAUDE.md's "Anchor Riski".
 *
 * The interactive URL's `id` is treated as its own bearer of authority (no
 * SEP-10 JWT required to load `/sep24/interactive/:id` or submit its form)
 * — the id is an unguessable UUID minted only after an authenticated
 * `POST .../interactive` call, which is the same trust model most real
 * SEP-24 anchors use for the browser-facing leg, since the page is opened
 * in a plain webview that can't attach an Authorization header to a GET.
 */
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../jwt.js";
import { config } from "../config.js";
import { store, type Sep24Transaction } from "../store.js";
import { dispatchWebhook } from "../webhook.js";
import { anchorAccount, findIncomingUsdcPayment, newWithdrawMemoId, sendUsdcPayment } from "../stellarPayments.js";

export const sep24Router = Router();

sep24Router.get("/sep24/info", (_req, res) => {
  res.json({
    deposit: { [config.usdcAssetCode]: { enabled: true, min_amount: 10, max_amount: 1_000_000 } },
    withdraw: { [config.usdcAssetCode]: { enabled: true, min_amount: 10, max_amount: 1_000_000 } },
    fee: { enabled: false },
  });
});

function interactiveUrl(id: string): string {
  return `${config.baseUrl}/sep24/interactive/${id}`;
}

function toApiShape(tx: Sep24Transaction) {
  return {
    id: tx.id,
    kind: tx.kind,
    status: tx.status,
    amount_in: tx.kind === "deposit" ? tx.amountTry?.toString() : tx.amountUsdc?.toString(),
    amount_out: tx.kind === "deposit" ? tx.amountUsdc?.toString() : tx.amountTry?.toString(),
    started_at: tx.startedAt,
    completed_at: tx.completedAt,
    stellar_transaction_id: tx.stellarTransactionId,
    withdraw_memo: tx.withdrawMemoId,
    withdraw_memo_type: tx.withdrawMemoId ? "id" : undefined,
    withdraw_anchor_account: tx.withdrawMemoId ? anchorAccount() : undefined,
  };
}

sep24Router.post("/sep24/transactions/deposit/interactive", requireAuth, (req: AuthedRequest, res) => {
  const assetCode = req.body?.asset_code ?? config.usdcAssetCode;
  if (assetCode !== config.usdcAssetCode) {
    res.status(400).json({ error: `unsupported asset_code (only ${config.usdcAssetCode})` });
    return;
  }
  const tx = store.transactions.create({
    kind: "deposit",
    account: req.account!,
    assetCode,
    callbackUrl: typeof req.body?.callback_url === "string" ? req.body.callback_url : undefined,
  });
  res.json({ type: "interactive_customer_info_needed", url: interactiveUrl(tx.id), id: tx.id });
});

sep24Router.post("/sep24/transactions/withdraw/interactive", requireAuth, (req: AuthedRequest, res) => {
  const assetCode = req.body?.asset_code ?? config.usdcAssetCode;
  if (assetCode !== config.usdcAssetCode) {
    res.status(400).json({ error: `unsupported asset_code (only ${config.usdcAssetCode})` });
    return;
  }
  const tx = store.transactions.create({
    kind: "withdraw",
    account: req.account!,
    assetCode,
    withdrawMemoId: newWithdrawMemoId(),
    callbackUrl: typeof req.body?.callback_url === "string" ? req.body.callback_url : undefined,
  });
  res.json({ type: "interactive_customer_info_needed", url: interactiveUrl(tx.id), id: tx.id });
});

sep24Router.get("/sep24/transaction", requireAuth, (req: AuthedRequest, res) => {
  const id = String(req.query.id ?? "");
  const tx = store.transactions.get(id);
  if (!tx || tx.account !== req.account) {
    res.status(404).json({ error: "transaction not found" });
    return;
  }
  res.json({ transaction: toApiShape(tx) });
});

sep24Router.get("/sep24/transactions", requireAuth, (req: AuthedRequest, res) => {
  res.json({ transactions: store.transactions.listByAccount(req.account!).map(toApiShape) });
});

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" />
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#1a1a1a}
input{font-size:16px;padding:8px;width:100%;box-sizing:border-box;margin:8px 0}
button{font-size:16px;padding:10px 20px;cursor:pointer}
.note{color:#666;font-size:13px}code{background:#f2f2f2;padding:2px 5px;border-radius:3px}</style>
</head><body><h2>${title}</h2>${body}
<p class="note">Depozito Anchor Stub — SEP-24 protokolü gerçek, banka transferi simüle edilmiştir.</p>
</body></html>`;
}

sep24Router.get("/sep24/interactive/:id", (req, res) => {
  const tx = store.transactions.get(req.params.id);
  if (!tx) {
    res.status(404).send(page("Bulunamadı", "<p>İşlem bulunamadı.</p>"));
    return;
  }

  if (tx.status === "completed") {
    res.send(page("Tamamlandı", `<p>İşlem tamamlandı. Stellar tx: <code>${tx.stellarTransactionId}</code></p>`));
    return;
  }

  if (tx.kind === "deposit") {
    res.send(
      page(
        "TRY Yatır",
        `<form method="post" action="/sep24/interactive/${tx.id}/submit">
          <label>Tutar (TRY)<input name="amount_try" type="number" min="10" step="0.01" required /></label>
          <p class="note">Kur: 1 ${config.usdcAssetCode} = ${config.fxRateTryPerUsdc} TRY (simüle). Onaylandığında gerçek testnet ${config.usdcAssetCode} hesabınıza gönderilir.</p>
          <button type="submit">Yatır</button>
        </form>`,
      ),
    );
    return;
  }

  res.send(
    page(
      "USDC Gönder",
      `<p>Bu adrese <code>${config.usdcAssetCode}</code> gönderin ve memo (id) olarak <code>${tx.withdrawMemoId}</code> kullanın:</p>
      <p><code id="addr">${anchorAccount()}</code></p>
      <form method="post" action="/sep24/interactive/${tx.id}/submit">
        <button type="submit">Gönderdim, kontrol et</button>
      </form>
      <p class="note">Ödeme algılandığında TRY karşılığı (simüle) banka hesabınıza gönderilir.</p>`,
    ),
  );
});

sep24Router.post("/sep24/interactive/:id/submit", async (req, res) => {
  const tx = store.transactions.get(req.params.id);
  if (!tx) {
    res.status(404).send(page("Bulunamadı", "<p>İşlem bulunamadı.</p>"));
    return;
  }

  try {
    if (tx.kind === "deposit") {
      const amountTry = Number(req.body?.amount_try);
      if (!Number.isFinite(amountTry) || amountTry <= 0) {
        res.status(400).send(page("Hatalı tutar", "<p>Geçerli bir TRY tutarı girin.</p>"));
        return;
      }
      const amountUsdc = (amountTry / config.fxRateTryPerUsdc).toFixed(7);
      console.log(`[anchor-stub] SIMÜLE banka tahsilatı: ${amountTry} TRY, hesap ${tx.account}`);
      let updated = store.transactions.update(tx.id, { amountTry, status: "pending_anchor" });
      await dispatchWebhook(updated.callbackUrl, toApiShape(updated));

      const stellarTransactionId = await sendUsdcPayment(tx.account, amountUsdc);
      updated = store.transactions.update(tx.id, {
        amountUsdc: Number(amountUsdc),
        stellarTransactionId,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      await dispatchWebhook(updated.callbackUrl, toApiShape(updated));
      res.send(page("Tamamlandı", `<p>${amountTry} TRY karşılığı ${amountUsdc} ${config.usdcAssetCode} gönderildi. Tx: <code>${stellarTransactionId}</code></p>`));
      return;
    }

    // withdraw: look for the real incoming USDC payment before completing.
    const found = await findIncomingUsdcPayment({ from: tx.account, memoId: tx.withdrawMemoId! });
    if (!found) {
      res.send(
        page(
          "Henüz görülmedi",
          `<p>Bu hesaptan <code>${tx.withdrawMemoId}</code> memolu bir ${config.usdcAssetCode} ödemesi henüz görülmedi. Gönderip tekrar deneyin.</p>
          <form method="post" action="/sep24/interactive/${tx.id}/submit"><button type="submit">Tekrar kontrol et</button></form>`,
        ),
      );
      return;
    }

    const amountTry = Number(found.amount) * config.fxRateTryPerUsdc;
    console.log(`[anchor-stub] SIMÜLE banka ödemesi: ${amountTry.toFixed(2)} TRY, hesap ${tx.account}`);
    const updated = store.transactions.update(tx.id, {
      amountUsdc: Number(found.amount),
      amountTry,
      stellarTransactionId: found.txHash,
      status: "completed",
      completedAt: new Date().toISOString(),
    });
    await dispatchWebhook(updated.callbackUrl, toApiShape(updated));
    res.send(page("Tamamlandı", `<p>${found.amount} ${config.usdcAssetCode} alındı, ${amountTry.toFixed(2)} TRY karşılığı (simüle) banka hesabına gönderildi. Tx: <code>${found.txHash}</code></p>`));
  } catch (err) {
    store.transactions.update(tx.id, { status: "error" });
    console.error("[anchor-stub] interactive submit failed:", err);
    res.status(500).send(page("Hata", `<p>İşlem başarısız oldu: ${(err as Error).message}</p>`));
  }
});
