/** Formatting helpers. Every user-facing string is Turkish; identifiers stay English. */

/** TRY/USDC quote. Comes from the anchor's SEP-38 quote endpoint in production. */
export const RATE = 41.18;

/** Vault APY shown on the summary card. Comes from the DeFindex vault in production. */
export const APY = 4.1;

/** "24.000 TL" */
export function fmtTry(n: number): string {
  return Number(n).toLocaleString("tr-TR") + " TL";
}

/** Converts a TRY amount at the current quote: "583,90 USDC" */
export function fmtUsdc(n: number, rate: number = RATE): string {
  return (
    (n / rate).toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " USDC"
  );
}

/** "41,18 TL" — the quote line on the deposit tab. */
export function fmtRate(rate: number = RATE): string {
  return rate.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) + " TL";
}

/** "%4,1" */
export function fmtApy(apy: number = APY): string {
  return "%" + apy.toLocaleString("tr-TR");
}

/** "17.09 14:32" — the timestamp format the ledger table uses. */
export function stamp(d: Date = new Date()): string {
  const p = (v: number) => String(v).padStart(2, "0");
  return (
    p(d.getDate()) + "." + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes())
  );
}

/**
 * Deterministic PRNG (mulberry32).
 *
 * The prototype's placeholder digests and transaction ids have to render
 * identically on the server and on the client, or React's hydration bails out.
 * A seeded generator gives that; nothing here is security-relevant — the real
 * hashes are SHA-256 digests computed over the uploaded file.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hex(rng: () => number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += "0123456789abcdef"[Math.floor(rng() * 16)];
  return s;
}

/** Short digest placeholder, "a3f91c…4b2e". */
export function shortHash(rng: () => number): string {
  return hex(rng, 6) + "…" + hex(rng, 4);
}

/** Truncated transaction id, "a3f9…4b2e". */
export function txId(rng: () => number): string {
  return hex(rng, 4) + "…" + hex(rng, 4);
}
