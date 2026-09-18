/**
 * In-memory lease <-> anchor-transaction mapping. No DB layer exists yet
 * (see apps/api/src/index.ts's own note) — this mirrors that maturity
 * level rather than getting ahead of it. Whoever wires Prisma/Postgres in
 * later replaces this with a real table; the shape below is what that
 * table needs.
 */
import type { AnchorTransactionStatus } from "./client.js";

export interface TrackedTransaction {
  id: string;
  leaseId: string;
  kind: "deposit" | "withdraw";
  account: string;
  status: AnchorTransactionStatus;
  amountTry?: string;
  amountUsdc?: string;
  stellarTransactionId?: string;
  updatedAt: string;
}

const byTransactionId = new Map<string, TrackedTransaction>();

export const anchorStore = {
  track(tx: Omit<TrackedTransaction, "updatedAt">): TrackedTransaction {
    const full: TrackedTransaction = { ...tx, updatedAt: new Date().toISOString() };
    byTransactionId.set(full.id, full);
    return full;
  },
  get(id: string): TrackedTransaction | undefined {
    return byTransactionId.get(id);
  },
  applyCallback(id: string, patch: Partial<TrackedTransaction>): TrackedTransaction | undefined {
    const existing = byTransactionId.get(id);
    if (!existing) return undefined;
    const updated: TrackedTransaction = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    byTransactionId.set(id, updated);
    return updated;
  },
  listByLease(leaseId: string): TrackedTransaction[] {
    return [...byTransactionId.values()].filter((t) => t.leaseId === leaseId);
  },
};
