"use client";

import { statusText } from "@/lib/derive";
import { useStore } from "@/lib/store";
import type { Tab } from "@/lib/types";
import { SummaryTab } from "./tabs/summary-tab";
import { DepositTab } from "./tabs/deposit-tab";
import { PhotosTab } from "./tabs/photos-tab";
import { ExitTab } from "./tabs/exit-tab";
import { DisputeTab } from "./tabs/dispute-tab";
import { EvidenceTab } from "./tabs/evidence-tab";

const TABS: { id: Tab; label: string }[] = [
  { id: "ozet", label: "Özet" },
  { id: "depozito", label: "Depozito" },
  { id: "foto", label: "Fotoğraf kanıtı" },
  { id: "cikis", label: "Çıkış hesabı" },
  { id: "itiraz", label: "Anlaşmazlık" },
  { id: "delil", label: "Delil paketi" },
];

export function LeaseDetail() {
  const { state, lease, actions } = useStore();

  return (
    <section className="grid gap-8">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="tag tag-outline">#{lease.id}</span>
          <span className="tag tag-accent">{statusText(lease, true)}</span>
          <span className="text-[12.5px] text-neutral-400">{lease.term}</span>
        </div>
        <h1 className="m-0 font-heading text-[28px] font-medium tracking-[-0.02em]">
          {lease.address}
        </h1>
        <div className="text-[13px] text-neutral-300">
          Ev sahibi {lease.landlord} · kiracı {lease.tenant}
        </div>
      </header>

      <nav className="flex flex-wrap gap-6 border-b border-divider">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={state.tab === t.id ? "page" : undefined}
            onClick={() => actions.setTab(t.id)}
            className="relative pt-3 pb-4 text-[13.5px] text-neutral-300 hover:text-text"
          >
            {/* the active mark sits on the nav's own bottom border */}
            {state.tab === t.id && (
              <span className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
            )}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </nav>

      {state.tab === "ozet" && <SummaryTab />}
      {state.tab === "depozito" && <DepositTab />}
      {state.tab === "foto" && <PhotosTab />}
      {state.tab === "cikis" && <ExitTab />}
      {state.tab === "itiraz" && <DisputeTab />}
      {state.tab === "delil" && <EvidenceTab />}
    </section>
  );
}
