"use client";

import { ChainEventsTable } from "../chain-events-table";
import { accruedYield, nextStep, proofText } from "@/lib/derive";
import { APY, RATE, fmtApy, fmtTry, fmtUsdc } from "@/lib/format";
import { useStore } from "@/lib/store";

export function SummaryTab() {
  const { lease } = useStore();
  const next = nextStep(lease);
  const earned = accruedYield(lease, RATE);

  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-6">
        <StatCard label="Emanetteki depozito" value={fmtUsdc(lease.amount)} sub={fmtTry(lease.amount)} />
        <StatCard
          label="Biriken getiri"
          value={"+" + earned.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " USDC"}
          sub={`Kasa · yıllık ${fmtApy(APY)} · kiracıya ait`}
          accent
        />
        <StatCard
          label="Kanıt"
          value={proofText(lease)}
          sub="Giriş / çıkış fotoğrafı hash'lendi"
        />
        <StatCard label="Sıradaki adım" value={next.step} sub={next.who} small />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b border-divider px-6 py-4 text-[12px] text-neutral-300">
          Zincir hareketleri
        </div>
        <div className="overflow-auto p-6">
          <ChainEventsTable events={lease.events} />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent = false,
  small = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className="card grid gap-2 p-8">
      <div className="text-[11px] tracking-[0.08em] text-neutral-400 uppercase">{label}</div>
      <div
        className={`font-heading font-medium ${small ? "text-[18px] leading-[1.35]" : "text-[27px]"} ${
          accent ? "text-accent-300" : ""
        }`}
      >
        {value}
      </div>
      <div className="text-[12.5px] text-neutral-300">{sub}</div>
    </div>
  );
}
