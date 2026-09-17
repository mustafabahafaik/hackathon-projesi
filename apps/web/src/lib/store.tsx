"use client";

/**
 * Prototype application store.
 *
 * Holds the session and the lease records the signed-in user can see, and
 * exposes one action per contract call the escrow makes. Today the reducer
 * mutates local state and appends a ledger entry; each action is the seam
 * where the real call goes — `apps/api` for the anchor (SEP-12/24/38) and
 * `packages/sdk` for `create_lease`, `deposit`, `record_photo_hash`,
 * `settle_undisputed`, `initiate_dispute`, `submit_offer`,
 * `arbitrator_decide`. See the README's "Entegrasyon sınırı" section.
 */

import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import { fmtTry, fmtUsdc, shortHash, stamp, txId } from "./format";
import { DEMO_EMAIL, ROOMS, getLeases, runtimeRng } from "./demo-data";
import type { ChainEvent, DeductionItem, ItemStatus, Lease, Role, Session, Tab } from "./types";

interface AppState {
  session: Session | null;
  leases: Lease[];
  activeId: string;
  tab: Tab;
  showNew: boolean;
}

type Action =
  | { type: "login"; email: string; role?: Role }
  | { type: "logout" }
  | { type: "setRole"; role: Role }
  | { type: "selectLease"; id: string }
  | { type: "setTab"; tab: Tab }
  | { type: "setShowNew"; open: boolean }
  | { type: "createLease"; lease: Lease }
  | { type: "patchLease"; patch: (l: Lease) => Partial<Lease>; event?: ChainEvent };

const initialLeases = getLeases();

const initialState: AppState = {
  session: null,
  leases: initialLeases,
  activeId: initialLeases[0].id,
  tab: "ozet",
  showNew: false,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "login":
      return { ...state, session: { email: action.email, role: action.role ?? "tenant" } };
    case "logout":
      return { ...state, session: null, tab: "ozet", showNew: false };
    case "setRole":
      return state.session ? { ...state, session: { ...state.session, role: action.role } } : state;
    case "selectLease":
      return { ...state, activeId: action.id, showNew: false, tab: "ozet" };
    case "setTab":
      return { ...state, tab: action.tab };
    case "setShowNew":
      return { ...state, showNew: action.open };
    case "createLease":
      return {
        ...state,
        leases: [action.lease, ...state.leases],
        activeId: action.lease.id,
        showNew: false,
        tab: "ozet",
      };
    case "patchLease":
      return {
        ...state,
        leases: state.leases.map((l) => {
          if (l.id !== state.activeId) return l;
          const next = { ...l, ...action.patch(l) };
          // The ledger is newest-first; every chain write lands here and in the
          // evidence package at the same time.
          if (action.event) next.events = [action.event, ...next.events];
          return next;
        }),
      };
    default:
      return state;
  }
}

/** Builds a ledger entry. Called from action creators so the reducer stays pure. */
function chainEvent(title: string, detail: string): ChainEvent {
  return { time: stamp(), title, detail, tx: txId(runtimeRng) };
}

export interface NewLeaseInput {
  address: string;
  tenant: string;
  amount: number;
  term: string;
}

interface Store {
  state: AppState;
  lease: Lease;
  role: Role;
  isTenant: boolean;
  isLandlord: boolean;
  actions: {
    login: (email: string, role?: Role) => void;
    loginAsDemo: () => void;
    logout: () => void;
    setRole: (role: Role) => void;
    selectLease: (id: string) => void;
    setTab: (tab: Tab) => void;
    openNewLease: () => void;
    cancelNewLease: () => void;
    /** contract: create_lease — persistent */
    createLease: (input: NewLeaseInput) => void;
    /** anchor + contract: SEP-12 → SEP-24 → Soroswap → escrow.deposit → vault.deposit */
    advanceDeposit: () => void;
    /** contract: record_photo_hash — persistent */
    uploadPhoto: (set: "in" | "out", index: number) => void;
    /** contract: record_photo_hash — writes the move-out merkle root */
    lockExitSet: () => void;
    decideItem: (index: number, status: ItemStatus) => void;
    addItem: (item: Omit<DeductionItem, "status">) => void;
    /** contract: settle_undisputed */
    settleUndisputed: () => void;
    /** contract: initiate_dispute — freezes the disputed portion */
    startDispute: () => void;
    /** contract: submit_offer — temporary (the round's session data) */
    submitOffer: (amount: number, reason: string) => void;
    acceptLastOffer: () => void;
    /** contract: submit_final_offer — locks both sides' numbers */
    goToArbitration: () => void;
    /** contract: arbitrator_decide — the arbiter picks a side, never a number */
    arbitratorDecide: (party: Role) => void;
    downloadEvidence: () => void;
  };
}

const StoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const lease = useMemo(
    () => state.leases.find((l) => l.id === state.activeId) ?? state.leases[0],
    [state.leases, state.activeId],
  );

  const role: Role = state.session?.role ?? "tenant";

  const patch = useCallback(
    (fn: (l: Lease) => Partial<Lease>, event?: ChainEvent) =>
      dispatch({ type: "patchLease", patch: fn, event }),
    [],
  );

  const actions = useMemo<Store["actions"]>(
    () => ({
      login: (email, r) => dispatch({ type: "login", email, role: r }),
      loginAsDemo: () => dispatch({ type: "login", email: DEMO_EMAIL, role: "tenant" }),
      logout: () => dispatch({ type: "logout" }),
      setRole: (r) => dispatch({ type: "setRole", role: r }),
      selectLease: (id) => dispatch({ type: "selectLease", id }),
      setTab: (tab) => dispatch({ type: "setTab", tab }),
      openNewLease: () => dispatch({ type: "setShowNew", open: true }),
      cancelNewLease: () => dispatch({ type: "setShowNew", open: false }),

      createLease: (input) => {
        const id = "LSE-" + Math.floor(1000 + runtimeRng() * 8999);
        dispatch({
          type: "createLease",
          lease: {
            id,
            address: input.address,
            landlord: "Siz",
            tenant: input.tenant,
            amount: input.amount,
            term: input.term,
            depStep: 0,
            phase: "deposit",
            photosIn: ROOMS.map((room) => ({ room, hash: null })),
            photosOut: ROOMS.map((room) => ({ room, hash: null })),
            outLocked: false,
            items: [],
            settled: false,
            dispute: null,
            events: [chainEvent("create_lease", "Kira kaydı açıldı · " + fmtTry(input.amount))],
          },
        });
      },

      advanceDeposit: () => {
        if (lease.depStep >= 4) return;
        const titles = [
          "SEP-12 customer kaydı",
          "SEP-24 interactive deposit",
          "Soroswap swap",
          "escrow.deposit → vault",
        ];
        const details = [
          "KYC formu tamamlandı",
          fmtTry(lease.amount) + " havale onaylandı",
          "TRYX → USDC · " + fmtUsdc(lease.amount),
          fmtUsdc(lease.amount) + " kasaya yatırıldı",
        ];
        patch(
          (l) => ({
            depStep: (l.depStep + 1) as Lease["depStep"],
            phase: l.depStep + 1 >= 4 ? "active" : "deposit",
          }),
          chainEvent(titles[lease.depStep], details[lease.depStep]),
        );
      },

      uploadPhoto: (set, index) => {
        if (set === "in") {
          if (lease.photosIn[index].hash) return;
          patch(
            (l) => ({
              photosIn: l.photosIn.map((p, i) =>
                i === index ? { ...p, hash: shortHash(runtimeRng) } : p,
              ),
            }),
            chainEvent(
              "record_photo_hash · giriş",
              lease.photosIn[index].room + " fotoğrafı hash'lendi",
            ),
          );
          return;
        }
        // The move-out set stays editable until it is locked on chain.
        if (lease.outLocked || lease.photosOut[index].hash) return;
        patch((l) => ({
          photosOut: l.photosOut.map((p, i) =>
            i === index ? { ...p, hash: shortHash(runtimeRng) } : p,
          ),
        }));
      },

      lockExitSet: () => {
        if (lease.outLocked) return;
        const count = lease.photosOut.filter((p) => p.hash).length;
        patch(
          () => ({ outLocked: true, phase: "exit" }),
          chainEvent("record_photo_hash · çıkış", count + " fotoğraf · merkle root"),
        );
      },

      decideItem: (index, status) => {
        patch((l) => ({
          items: l.items.map((it, i) => (i === index ? { ...it, status } : it)),
        }));
      },

      addItem: (item) => {
        patch(
          (l) => ({ items: [...l.items, { ...item, status: "bekliyor" as ItemStatus }] }),
          chainEvent("deduction_claim", item.label + " · " + fmtTry(item.amount)),
        );
      },

      settleUndisputed: () => {
        if (lease.settled) return;
        const sum = lease.items
          .filter((i) => i.status === "kabul")
          .reduce((a, b) => a + b.amount, 0);
        patch(
          () => ({ settled: true }),
          chainEvent(
            "settle_undisputed",
            fmtTry(sum) + " ev sahibine, kalan kiracıya · SEP-24 withdraw",
          ),
        );
      },

      startDispute: () => {
        const frozen = lease.items
          .filter((i) => i.status === "itiraz")
          .reduce((a, b) => a + b.amount, 0);
        patch(
          () => ({ dispute: { round: 1, offers: [], ruling: null } }),
          chainEvent("initiate_dispute", fmtTry(frozen) + " donduruldu"),
        );
        dispatch({ type: "setTab", tab: "itiraz" });
      },

      submitOffer: (amount, reason) => {
        if (!lease.dispute) return;
        patch(
          (l) => {
            if (!l.dispute) return {};
            const offers = [
              ...l.dispute.offers,
              { party: role, amount, reason: reason || "gerekçe yazılmadı", round: l.dispute.round },
            ];
            // A round closes once both sides have answered.
            const round = offers.length % 2 === 0 ? l.dispute.round + 1 : l.dispute.round;
            return { dispute: { ...l.dispute, offers, round } };
          },
          chainEvent(
            "submit_offer",
            (role === "tenant" ? "Kiracı" : "Ev sahibi") + " · " + fmtTry(amount),
          ),
        );
      },

      acceptLastOffer: () => {
        const d = lease.dispute;
        if (!d || d.offers.length === 0) return;
        const last = d.offers[d.offers.length - 1];
        patch(
          (l) =>
            l.dispute
              ? { dispute: { ...l.dispute, ruling: { by: "anlasma" as const, amount: last.amount } } }
              : {},
          chainEvent("dispute_settled", "Anlaşma · " + fmtTry(last.amount) + " ev sahibine"),
        );
      },

      goToArbitration: () => {
        patch(
          (l) => (l.dispute ? { dispute: { ...l.dispute, round: 4 } } : {}),
          chainEvent("submit_final_offer", "Son teklifler kilitlendi · hakem atandı"),
        );
      },

      arbitratorDecide: (party) => {
        const amount = lastOfferBy(lease, party);
        patch(
          (l) => (l.dispute ? { dispute: { ...l.dispute, ruling: { by: party, amount } } } : {}),
          chainEvent(
            "arbitrator_decide",
            (party === "tenant" ? "Kiracı" : "Ev sahibi") + " rakamı seçildi · " + fmtTry(amount),
          ),
        );
      },

      downloadEvidence: () => {
        const payload = {
          lease: lease.id,
          address: lease.address,
          amount: lease.amount,
          items: lease.items,
          dispute: lease.dispute,
          events: lease.events,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "evidence-" + lease.id + ".json";
        a.click();
        URL.revokeObjectURL(url);
      },
    }),
    [lease, patch, role],
  );

  const value = useMemo<Store>(
    () => ({
      state,
      lease,
      role,
      isTenant: role === "tenant",
      isLandlord: role === "landlord",
      actions,
    }),
    [state, lease, role, actions],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <AppStoreProvider>");
  return ctx;
}

/**
 * The side's standing number going into arbitration: its last offer, or —
 * if it never made one — the landlord's full claim / zero for the tenant.
 */
export function lastOfferBy(lease: Lease, party: Role): number {
  if (!lease.dispute) return 0;
  const own = lease.dispute.offers.filter((o) => o.party === party);
  if (own.length) return own[own.length - 1].amount;
  return party === "landlord"
    ? lease.items.filter((i) => i.status === "itiraz").reduce((a, b) => a + b.amount, 0)
    : 0;
}
