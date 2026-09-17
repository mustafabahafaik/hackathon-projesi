"use client";

import { DEPOSIT_CTA, depositSteps } from "@/lib/derive";
import { RATE, fmtRate, fmtTry, fmtUsdc } from "@/lib/format";
import { useStore } from "@/lib/store";

/**
 * The anchor path: SEP-12 KYC → SEP-24 interactive deposit → Soroswap
 * TRYX→USDC → escrow.deposit() → vault.deposit(). Each advance logs a ledger
 * entry; in production each is the response of a real testnet call.
 */
export function DepositTab() {
  const { lease, actions } = useStore();
  const steps = depositSteps(lease);
  const done = lease.depStep >= 4;

  return (
    <div className="card elev-md grid gap-8 p-card-xl">
      <div className="grid max-w-[60ch] gap-3">
        <h2 className="m-0 font-heading text-[20px] font-medium">Depozitoyu TL olarak yatır</h2>
        <p className="m-0 text-[13.5px] leading-[1.65] text-neutral-300">
          Siz yalnızca banka havalesi yaparsınız. Kur teklifi, çevrim ve kasaya yatırma arkada
          yürür; her adımın işlem kaydı özet sekmesine düşer.
        </p>
      </div>

      <div className="grid max-w-[420px] gap-4">
        <div className="field">
          <label htmlFor="dp-tutar">Tutar</label>
          <input className="input" id="dp-tutar" value={fmtTry(lease.amount)} readOnly />
        </div>
        <div className="text-[12.5px] leading-[1.6] text-neutral-300">
          Kur teklifi: <span className="text-accent-300">1 USDC = {fmtRate(RATE)}</span> ·{" "}
          {fmtUsdc(lease.amount)} · teklif 60 sn geçerli.
        </div>
      </div>

      <div className="grid gap-0">
        {steps.map((s) => (
          <div
            key={s.title}
            className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-6 border-t border-divider py-4"
          >
            <span className="text-[14px] text-accent-400">{s.mark}</span>
            <div className="min-w-0">
              <div className="text-[14px]">{s.title}</div>
              <div className="text-[12px] text-neutral-400">{s.sub}</div>
            </div>
            <span className="tag tag-neutral">{s.state}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-divider pt-6">
        <button
          type="button"
          className="btn btn-primary"
          onClick={actions.advanceDeposit}
          disabled={done}
        >
          {DEPOSIT_CTA[lease.depStep]}
        </button>
        <span className="text-[12px] text-neutral-400">
          {done
            ? "Depozito kasada; getiri kiracıya işliyor."
            : "Her adım gerçek testnet çağrısı yapar; banka onayı hackathon için simüle edilir."}
        </span>
      </div>
    </div>
  );
}
