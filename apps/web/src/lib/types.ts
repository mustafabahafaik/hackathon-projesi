/**
 * Domain model for the escrow front-end.
 *
 * The shapes below mirror what the Soroban escrow contract and the API will
 * return, so swapping the local prototype store (src/lib/store.tsx) for real
 * contract reads does not ripple through the components.
 *
 * Contract storage mapping (CLAUDE.md rule 2 — repeated here so the front-end
 * and the Rust source stay in step):
 *   instance    -> admin, arbiter, DeFindex vault, Soroswap router addresses
 *   persistent  -> Lease, photo hashes, offer history, settlement, ruling
 *   temporary   -> invite token, the active offer round's session data
 */

/** Which side of the lease the signed-in user is looking at. */
export type Role = "tenant" | "landlord";

/** The tenant's verdict on a single deduction claim. */
export type ItemStatus = "kabul" | "itiraz" | "bekliyor";

/** Lease detail tabs. */
export type Tab = "ozet" | "depozito" | "foto" | "cikis" | "itiraz" | "delil";

/** Where the lease sits in its lifecycle. */
export type LeasePhase = "deposit" | "active" | "exit";

/**
 * How far the deposit has walked the anchor -> swap -> vault path.
 * 0 KYC (SEP-12) · 1 bank transfer (SEP-24) · 2 Soroswap · 3 escrow + vault · 4 done.
 */
export type DepositStep = 0 | 1 | 2 | 3 | 4;

/** One room's photograph. Only `hash` ever reaches the chain; the file stays in object storage. */
export interface Photo {
  room: string;
  /** SHA-256 digest of the uploaded file, or null while the slot is empty. */
  hash: string | null;
}

/** A deduction the landlord claims against the deposit at move-out. */
export interface DeductionItem {
  label: string;
  amount: number;
  evidence: string;
  status: ItemStatus;
}

/** One offer in the dispute's offer / counter-offer ladder. */
export interface Offer {
  party: Role;
  amount: number;
  reason: string;
  round: number;
}

/** How a dispute ended: the parties agreed, or the arbiter picked one side's final number. */
export interface Ruling {
  by: Role | "anlasma";
  amount: number;
}

export interface Dispute {
  round: number;
  offers: Offer[];
  ruling: Ruling | null;
}

/** A chain write, as it is shown in the ledger table and the evidence package. */
export interface ChainEvent {
  time: string;
  title: string;
  detail: string;
  tx: string;
}

export interface Lease {
  id: string;
  address: string;
  landlord: string;
  tenant: string;
  /** Deposit in TRY — the currency the tenant actually pays in. */
  amount: number;
  term: string;
  depStep: DepositStep;
  phase: LeasePhase;
  photosIn: Photo[];
  photosOut: Photo[];
  /** Once the move-out set is locked its merkle root is on chain and the set is immutable. */
  outLocked: boolean;
  items: DeductionItem[];
  settled: boolean;
  dispute: Dispute | null;
  events: ChainEvent[];
}

export interface Session {
  email: string;
  role: Role;
}
