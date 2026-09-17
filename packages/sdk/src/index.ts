/**
 * Shared domain types for Depozito — the client-facing DTOs `apps/web` and
 * `apps/api` both talk about. The API assembles these from a mix of on-chain
 * reads (Soroban contract state) and off-chain metadata (Postgres); they are
 * not assumed to be a literal mirror of the contract's own storage layout —
 * see CLAUDE.md rule 2 for how the contract itself splits state across
 * instance / persistent / temporary storage.
 *
 * `PhotoHashRecord` and `Offer` are modeled as their own top-level records
 * rather than arrays nested inside `Lease`, matching how they land in
 * persistent storage on chain: each is its own keyed entry
 * (`(leaseId, side, room)` for a photo hash, `(leaseId, round, party)` for an
 * offer), not one growing struct that has to be re-serialized on every
 * upload or counter-offer.
 *
 * Monetary amounts that move through the contract (`Lease.depositAmount`,
 * `Offer.amount`) are `bigint`, in the vault asset's smallest unit (USDC has
 * 7 decimals on Stellar) — Soroban represents these as i128, and a JS
 * `number` cannot hold that range without losing precision. `bigint` does
 * not survive `JSON.stringify` on its own; callers serializing these across
 * HTTP need to convert explicitly (e.g. to a decimal string).
 */

/**
 * Where a lease sits in the escrow's state machine.
 *
 * Created      -> `create_lease` has run; tenant has not funded yet.
 * Funded       -> `deposit` has completed; USDC sits in the DeFindex vault.
 * Active       -> Funded, mid-term; both move-in photo sets are on chain.
 * Settling     -> Move-out photos locked; landlord has raised deduction claims.
 * PartialPaid  -> `settle_undisputed` has paid the undisputed portion out.
 * Disputed     -> `initiate_dispute` has run; the disputed portion is frozen.
 * Negotiating  -> Inside the 3-round offer / counter-offer window.
 * Arbitrating  -> Round limit hit; both final offers are locked in.
 * Frozen       -> A ruling was made and rejected; awaiting the evidence
 *                 package going to court / a mediator.
 * Resolved     -> `official_ruling` (or a negotiated agreement) has paid
 *                 out the disputed portion; the lease is closed.
 */
export enum LeaseStatus {
  Created = "Created",
  Funded = "Funded",
  Active = "Active",
  Settling = "Settling",
  Disputed = "Disputed",
  PartialPaid = "PartialPaid",
  Negotiating = "Negotiating",
  Arbitrating = "Arbitrating",
  Frozen = "Frozen",
  Resolved = "Resolved",
}

/** A rental-deposit lease record. */
export interface Lease {
  /** Display/reference id, e.g. "LSE-4127". */
  id: string;
  /** Physical address of the rented unit — off-chain metadata. */
  address: string;
  /** Landlord's Stellar account address (G...). */
  landlord: string;
  /** Tenant's Stellar account address (G...). */
  tenant: string;
  /** Pre-selected baseball-arbitration arbiter's Stellar account address. */
  arbiter: string;
  /** Escrowed amount, in the vault asset's smallest unit. */
  depositAmount: bigint;
  /** Lease term start, unix seconds. */
  termStart: number;
  /** Lease term end, unix seconds. */
  termEnd: number;
  status: LeaseStatus;
  /** unix seconds. */
  createdAt: number;
}

/**
 * One room's move-in or move-out photograph, as it lands on chain: the file
 * itself stays in object storage, only the digest is written here.
 */
export interface PhotoHashRecord {
  leaseId: string;
  side: "in" | "out";
  room: string;
  /** Hex-encoded SHA-256 digest of the uploaded file. */
  hash: string;
  /** Stellar account address of whoever uploaded it. */
  uploadedBy: string;
  /** unix seconds. */
  uploadedAt: number;
}

/** One offer in a dispute's offer / counter-offer ladder, or a final offer going into arbitration. */
export interface Offer {
  leaseId: string;
  /** 1-3 during negotiation; a round > 3 marks a final, locked offer. */
  round: number;
  party: "landlord" | "tenant";
  /** Proposed settlement amount, in the vault asset's smallest unit. */
  amount: bigint;
  reason: string;
  /** unix seconds. */
  submittedAt: number;
}
