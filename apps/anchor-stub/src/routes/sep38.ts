/**
 * SEP-38: Anchor RFQ (quotes). The only genuinely simulated number in this
 * whole stub (`config.fxRateTryPerUsdc`, see config.ts's own comment) feeds
 * through here — everything this module returns is a real computation on
 * that rate, not a hardcoded response.
 */
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../jwt.js";
import { config } from "../config.js";
import { store } from "../store.js";

export const sep38Router = Router();

const TRY_ASSET = "iso4217:TRY";
const usdcAssetId = () => `stellar:${config.usdcAssetCode}:${config.usdcIssuer}`;

/** buy_asset units per 1 sell_asset unit. */
function price(sellAsset: string, buyAsset: string): number {
  if (sellAsset === TRY_ASSET && buyAsset === usdcAssetId()) return 1 / config.fxRateTryPerUsdc;
  if (sellAsset === usdcAssetId() && buyAsset === TRY_ASSET) return config.fxRateTryPerUsdc;
  throw new Error(`unsupported pair: ${sellAsset} -> ${buyAsset}`);
}

sep38Router.get("/sep38/info", (_req, res) => {
  res.json({
    assets: [
      { asset: TRY_ASSET },
      { asset: usdcAssetId(), country_codes: ["TUR"] },
    ],
  });
});

/** Indicative prices for one sell_asset, across every buy_asset this anchor supports. */
sep38Router.get("/sep38/prices", (req, res) => {
  const sellAsset = String(req.query.sell_asset ?? "");
  const sellAmount = String(req.query.sell_amount ?? "");
  if (!sellAsset || !sellAmount) {
    res.status(400).json({ error: "sell_asset and sell_amount are required" });
    return;
  }
  const buyAsset = sellAsset === TRY_ASSET ? usdcAssetId() : TRY_ASSET;
  try {
    const p = price(sellAsset, buyAsset);
    res.json({ buy_assets: [{ asset: buyAsset, price: p.toFixed(7), decimals: 7 }] });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** Indicative price for one specific pair — same math as /prices, single-pair shape. */
sep38Router.get("/sep38/price", (req, res) => {
  const sellAsset = String(req.query.sell_asset ?? "");
  const buyAsset = String(req.query.buy_asset ?? "");
  const sellAmount = req.query.sell_amount !== undefined ? String(req.query.sell_amount) : undefined;
  const buyAmount = req.query.buy_amount !== undefined ? String(req.query.buy_amount) : undefined;
  if (!sellAsset || !buyAsset || (!sellAmount && !buyAmount)) {
    res.status(400).json({ error: "sell_asset, buy_asset, and one of sell_amount/buy_amount are required" });
    return;
  }
  try {
    const p = price(sellAsset, buyAsset);
    const resolvedSellAmount = sellAmount ?? (Number(buyAmount) / p).toFixed(7);
    const resolvedBuyAmount = buyAmount ?? (Number(sellAmount) * p).toFixed(7);
    res.json({ price: p.toFixed(7), sell_amount: resolvedSellAmount, buy_amount: resolvedBuyAmount });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** Firm, executable quote — expires in 5 minutes, same rate the interactive flow will honor. */
sep38Router.post("/sep38/quote", requireAuth, (req: AuthedRequest, res) => {
  const { sell_asset: sellAsset, buy_asset: buyAsset, sell_amount: sellAmount, buy_amount: buyAmount } = req.body ?? {};
  if (!sellAsset || !buyAsset || (!sellAmount && !buyAmount)) {
    res.status(400).json({ error: "sell_asset, buy_asset, and one of sell_amount/buy_amount are required" });
    return;
  }
  try {
    const p = price(sellAsset, buyAsset);
    const resolvedSellAmount = sellAmount ?? (Number(buyAmount) / p).toFixed(7);
    const resolvedBuyAmount = buyAmount ?? (Number(sellAmount) * p).toFixed(7);
    const quote = store.quotes.create({
      sellAsset,
      buyAsset,
      sellAmount: String(resolvedSellAmount),
      buyAmount: String(resolvedBuyAmount),
      price: p.toFixed(7),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    res.json({
      id: quote.id,
      expires_at: quote.expiresAt,
      price: quote.price,
      sell_asset: quote.sellAsset,
      sell_amount: quote.sellAmount,
      buy_asset: quote.buyAsset,
      buy_amount: quote.buyAmount,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

sep38Router.get("/sep38/quote/:id", requireAuth, (req, res) => {
  const quote = store.quotes.get(req.params.id);
  if (!quote) {
    res.status(404).json({ error: "quote not found" });
    return;
  }
  res.json({
    id: quote.id,
    expires_at: quote.expiresAt,
    price: quote.price,
    sell_asset: quote.sellAsset,
    sell_amount: quote.sellAmount,
    buy_asset: quote.buyAsset,
    buy_amount: quote.buyAmount,
  });
});
