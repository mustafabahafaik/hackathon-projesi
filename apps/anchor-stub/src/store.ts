/**
 * In-memory stores for SEP-12 customers, SEP-38 quotes, and SEP-24
 * transactions. A real anchor persists these; a hackathon stub doesn't
 * need to survive a restart — this is a deliberate simplification, not an
 * accidental one, and everything it stores is testnet-only, throwaway
 * state (no PII this stub collects is real).
 */
import { randomUUID } from "node:crypto";

export type Sep24Kind = "deposit" | "withdraw";
export type Sep24Status =
  | "incomplete"
  | "pending_user_transfer_start"
  | "pending_anchor"
  | "completed"
  | "error";

export interface Sep24Transaction {
  id: string;
  kind: Sep24Kind;
  status: Sep24Status;
  account: string;
  assetCode: string;
  /** TRY entered by the user in the interactive page (deposit) or expected on withdraw. */
  amountTry?: number;
  /** USDC amount actually moved on Stellar, once known. */
  amountUsdc?: number;
  /** Set once this stub has sent (deposit) or received (withdraw) the real testnet payment. */
  stellarTransactionId?: string;
  /** Withdraw only: the memo the user must attach when sending USDC to this anchor. */
  withdrawMemoId?: string;
  callbackUrl?: string;
  startedAt: string;
  completedAt?: string;
}

export interface Sep12Customer {
  id: string;
  account: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  status: "ACCEPTED" | "NEEDS_INFO";
}

export interface Sep38Quote {
  id: string;
  sellAsset: string;
  buyAsset: string;
  sellAmount: string;
  buyAmount: string;
  price: string;
  expiresAt: string;
}

const transactions = new Map<string, Sep24Transaction>();
const customers = new Map<string, Sep12Customer>(); // keyed by Stellar account
const quotes = new Map<string, Sep38Quote>();

export const store = {
  transactions: {
    create(tx: Omit<Sep24Transaction, "id" | "startedAt" | "status">): Sep24Transaction {
      const full: Sep24Transaction = {
        ...tx,
        id: randomUUID(),
        status: "incomplete",
        startedAt: new Date().toISOString(),
      };
      transactions.set(full.id, full);
      return full;
    },
    get(id: string): Sep24Transaction | undefined {
      return transactions.get(id);
    },
    update(id: string, patch: Partial<Sep24Transaction>): Sep24Transaction {
      const existing = transactions.get(id);
      if (!existing) throw new Error(`transaction ${id} not found`);
      const updated = { ...existing, ...patch };
      transactions.set(id, updated);
      return updated;
    },
    listByAccount(account: string): Sep24Transaction[] {
      return [...transactions.values()].filter((t) => t.account === account);
    },
  },
  customers: {
    upsert(account: string, fields: Omit<Sep12Customer, "id" | "account" | "status">): Sep12Customer {
      const existing = customers.get(account);
      const customer: Sep12Customer = {
        id: existing?.id ?? randomUUID(),
        account,
        status: "ACCEPTED", // no real KYC checks in a stub — accept anything submitted
        ...fields,
      };
      customers.set(account, customer);
      return customer;
    },
    get(account: string): Sep12Customer | undefined {
      return customers.get(account);
    },
  },
  quotes: {
    create(quote: Omit<Sep38Quote, "id">): Sep38Quote {
      const full = { ...quote, id: randomUUID() };
      quotes.set(full.id, full);
      return full;
    },
    get(id: string): Sep38Quote | undefined {
      return quotes.get(id);
    },
  },
};
