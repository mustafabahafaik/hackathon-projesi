/** Values derived from a lease. Kept out of the components so the tabs stay declarative. */

import { LeaseStatus } from "@depozito/sdk";
import { ROOMS } from "./demo-data";
import type { Lease } from "./types";

/**
 * Maps this prototype's local lease shape onto the canonical `LeaseStatus`
 * from `@depozito/sdk` — the status enum the API and the contract will
 * eventually agree on. Two notes on where the mapping is lossy:
 *
 * - `depStep` 1-3 (KYC done, bank transfer done, swap done, but the vault
 *   deposit hasn't landed) all read as `Created` — the enum has no separate
 *   "funding in progress" step, only "not funded" and "funded".
 * - This prototype never distinguishes the instant `initiate_dispute` runs
 *   (`Disputed`) from actively trading offers (`Negotiating`) — both are
 *   the same `dispute.round <= 3` window here, so it maps to `Negotiating`.
 *   `Disputed` and `Frozen` are reachable once a real reject-the-ruling flow
 *   exists; the current store has no action that produces them.
 */
export function leaseStatus(lease: Lease): LeaseStatus {
  if (lease.dispute) {
    if (lease.dispute.ruling) return LeaseStatus.Resolved;
    return lease.dispute.round > 3 ? LeaseStatus.Arbitrating : LeaseStatus.Negotiating;
  }
  if (lease.settled) {
    return lease.items.some((i) => i.status === "itiraz")
      ? LeaseStatus.PartialPaid
      : LeaseStatus.Resolved;
  }
  if (lease.depStep < 4) return LeaseStatus.Created;
  if (lease.outLocked) return LeaseStatus.Settling;
  return lease.photosIn.every((p) => p.hash) ? LeaseStatus.Active : LeaseStatus.Funded;
}

export interface DepositStepRow {
  title: string;
  sub: string;
  /** ✓ done · ● running · ○ waiting */
  mark: string;
  state: string;
}

/** The anchor → swap → vault path, marked against how far the lease has walked it. */
export function depositSteps(lease: Lease): DepositStepRow[] {
  const defs: [string, string][] = [
    ["KYC formu · SEP-12", "Anchor'ın kendi formu"],
    ["Banka havalesi", "IBAN ve açıklama kodu anchor'dan"],
    ["Soroswap çevrimi", "TRYX → USDC · slippage %0,5"],
    ["Emanet + DeFindex kasası", "escrow.deposit() → vault.deposit()"],
  ];
  return defs.map(([title, sub], i) => ({
    title,
    sub,
    mark: i < lease.depStep ? "✓" : i === lease.depStep ? "●" : "○",
    state: i < lease.depStep ? "Tamam" : i === lease.depStep ? "Sürüyor" : "Bekliyor",
  }));
}

export const DEPOSIT_CTA = [
  "KYC formunu doldur",
  "Havale bilgilerini gör",
  "Çevrimi başlat",
  "Kasaya yatır",
  "Depozito emanette",
];

const STATUS_LABEL: Record<LeaseStatus, string> = {
  [LeaseStatus.Created]: "Depozito bekliyor",
  [LeaseStatus.Funded]: "Emanette",
  [LeaseStatus.Active]: "Emanette",
  [LeaseStatus.Settling]: "Emanette",
  [LeaseStatus.Disputed]: "Anlaşmazlık",
  [LeaseStatus.PartialPaid]: "Kapandı",
  [LeaseStatus.Negotiating]: "Anlaşmazlık",
  [LeaseStatus.Arbitrating]: "Anlaşmazlık",
  [LeaseStatus.Frozen]: "Anlaşmazlık",
  [LeaseStatus.Resolved]: "Kapandı",
};

const STATUS_LABEL_LONG: Partial<Record<LeaseStatus, string>> = {
  [LeaseStatus.Disputed]: "Anlaşmazlık sürüyor",
  [LeaseStatus.Negotiating]: "Anlaşmazlık sürüyor",
  [LeaseStatus.Arbitrating]: "Anlaşmazlık sürüyor",
  [LeaseStatus.Frozen]: "Anlaşmazlık sürüyor",
};

/** Short lifecycle label, used on the sidebar cards and the lease header. */
export function statusText(lease: Lease, long = false): string {
  const status = leaseStatus(lease);
  if (long) return STATUS_LABEL_LONG[status] ?? STATUS_LABEL[status];
  return STATUS_LABEL[status];
}

export interface ExitTotals {
  /** Accepted deductions — paid out immediately. */
  undisputed: number;
  /** Objected deductions — frozen until the dispute resolves. */
  disputed: number;
  /** What returns to the tenant once every item has a verdict. */
  tenantBack: number;
  flexUndisputed: number;
  flexDisputed: number;
  flexTenant: number;
}

export function exitTotals(lease: Lease): ExitTotals {
  const sum = (status: string) =>
    lease.items.filter((i) => i.status === status).reduce((a, b) => a + b.amount, 0);
  const undisputed = sum("kabul");
  const disputed = sum("itiraz");
  const decided = lease.items
    .filter((i) => i.status !== "bekliyor")
    .reduce((a, b) => a + b.amount, 0);
  const tenantBack = Math.max(0, lease.amount - decided);
  // The bar's segments are zero-basis flex ratios: the labels live in the
  // legend below, so no label width can distort the proportion.
  return {
    undisputed,
    disputed,
    tenantBack,
    flexUndisputed: Math.max(1, undisputed / 1000),
    flexDisputed: Math.max(1, disputed / 1000),
    flexTenant: Math.max(1, tenantBack / 1000),
  };
}

/** Yield accrued in the vault. Reads the DeFindex position in production. */
export function accruedYield(lease: Lease, rate: number): number {
  return lease.depStep === 4 ? (lease.amount / rate) * 0.0075 : 0;
}

export function proofText(lease: Lease): string {
  return (
    lease.photosIn.filter((p) => p.hash).length + " / " + lease.photosOut.filter((p) => p.hash).length
  );
}

export function inCountText(lease: Lease): string {
  return lease.photosIn.filter((p) => p.hash).length + " / " + ROOMS.length + " kilitli";
}

export function outCountText(lease: Lease): string {
  return lease.outLocked
    ? "Kilitli · zincirde"
    : lease.photosOut.filter((p) => p.hash).length + " / " + ROOMS.length + " yüklendi";
}

export function nextStep(lease: Lease): { step: string; who: string } {
  if (lease.settled) return { step: "Kayıt kapandı", who: "—" };
  if (lease.dispute) {
    return {
      step: lease.dispute.ruling ? "Karar uygulanacak" : "Teklif turu sürüyor",
      who: "Her iki taraf",
    };
  }
  if (lease.depStep < 4) return { step: "Depozito yatırma", who: "Kiracı" };
  if (lease.outLocked) return { step: "Çıkış hesabı onayı", who: "Kiracı kalemlere karar verir" };
  return { step: "Çıkış fotoğrafları", who: "Her iki taraf yükler" };
}

export function roundText(lease: Lease): string {
  if (!lease.dispute) return "Süreç başlamadı";
  if (lease.dispute.ruling) return "Karar verildi";
  return "Tur " + Math.min(3, lease.dispute.round) + "/3";
}

export function disputePhaseNote(lease: Lease): string {
  if (!lease.dispute) return "Çıkış hesabında bir kaleme itiraz edip süreci başlatın.";
  if (lease.dispute.ruling) return "Karar zincire yazıldı.";
  return "Süre: 48 saat · yanıt gelmezse tur düşer.";
}

export const itemStatusText: Record<string, string> = {
  kabul: "Kabul",
  itiraz: "İtiraz",
  bekliyor: "Karar bekliyor",
};
