"use client";

import { useState } from "react";
import { accruedYield, exitTotals, itemStatusText } from "@/lib/derive";
import { RATE, fmtTry } from "@/lib/format";
import { useStore } from "@/lib/store";

/**
 * Move-out settlement. The undisputed portion is paid straight away; anything
 * the tenant objects to is frozen and handed to the dispute process.
 */
export function ExitTab() {
  const { lease, isTenant, actions } = useStore();
  const totals = exitTotals(lease);
  const earned = accruedYield(lease, RATE);

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [evidence, setEvidence] = useState("");

  const hasDisputed = lease.items.some((i) => i.status === "itiraz") && !lease.dispute;
  const settleDisabled = lease.settled || totals.undisputed === 0;

  function addItem() {
    const parsed = parseInt(String(amount).replace(/\D/g, ""), 10);
    if (!label || !parsed) return;
    actions.addItem({ label, amount: parsed, evidence: evidence || "Kanıt eklenmedi" });
    setLabel("");
    setAmount("");
    setEvidence("");
  }

  return (
    <div className="grid gap-8">
      <div className="card grid gap-6 p-card-lg">
        {/* Zero-basis segments: the amounts live in the legend below, so no
            label width can distort the proportion. */}
        <div className="flex h-[22px] overflow-hidden rounded-md shadow-sm">
          <div style={{ flex: `${totals.flexUndisputed} 1 0` }} className="bg-accent-700" />
          <div style={{ flex: `${totals.flexDisputed} 1 0` }} className="bg-neutral-800" />
          <div style={{ flex: `${totals.flexTenant} 1 0` }} className="bg-neutral-900" />
        </div>
        <div className="flex flex-wrap gap-8 text-[12px]">
          <span className="flex items-center gap-3">
            <span className="h-[9px] w-[9px] rounded-[2px] bg-accent-700" />
            İtirazsız · {fmtTry(totals.undisputed)}
          </span>
          <span className="flex items-center gap-3 text-neutral-200">
            <span className="h-[9px] w-[9px] rounded-[2px] bg-neutral-800" />
            Donuk · {fmtTry(totals.disputed)}
          </span>
          <span className="flex items-center gap-3 text-neutral-300">
            <span className="h-[9px] w-[9px] rounded-[2px] bg-neutral-900 shadow-sm" />
            Kiracıya · {fmtTry(totals.tenantBack)}
          </span>
        </div>
        <div className="text-[12.5px] text-neutral-300">
          Toplam {fmtTry(lease.amount)} +{" "}
          {earned.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} USDC getiri (kiracıya).
          Kalemlere kiracı tek tek karar verir.
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b border-divider px-6 py-4 text-[12px] text-neutral-300">
          Kesinti talepleri
        </div>
        <div className="grid gap-6 overflow-auto p-6">
          <table className="table">
            <thead>
              <tr>
                <th>Kalem</th>
                <th>Tutar</th>
                <th>Kanıt</th>
                <th>Kiracı kararı</th>
              </tr>
            </thead>
            <tbody>
              {lease.items.map((it, i) => (
                <tr key={it.label + i}>
                  <td>{it.label}</td>
                  <td className="whitespace-nowrap">{fmtTry(it.amount)}</td>
                  <td className="text-neutral-300">{it.evidence}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="tag tag-neutral">{itemStatusText[it.status]}</span>
                      {isTenant && !lease.settled && it.status === "bekliyor" && (
                        <span className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => actions.decideItem(i, "kabul")}
                          >
                            Kabul
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => actions.decideItem(i, "itiraz")}
                          >
                            İtiraz
                          </button>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!isTenant && !lease.settled && (
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,1fr)_auto] items-end gap-4 border-t border-divider pt-6">
              <div className="field">
                <label htmlFor="it-ad">Yeni kesinti kalemi</label>
                <input
                  className="input"
                  id="it-ad"
                  placeholder="Örn. parke hasarı"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="it-tut">Tutar (TL)</label>
                <input
                  className="input"
                  id="it-tut"
                  inputMode="numeric"
                  placeholder="4200"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="it-kan">Kanıt</label>
                <input
                  className="input"
                  id="it-kan"
                  placeholder="Foto 9 · fatura"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </div>
              <button type="button" className="btn btn-secondary" onClick={addItem}>
                Kalem ekle
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 border-t border-divider pt-6">
            <button
              type="button"
              className="btn btn-primary"
              onClick={actions.settleUndisputed}
              disabled={settleDisabled}
            >
              İtirazsız {fmtTry(totals.undisputed)} tutarı öde
            </button>
            {hasDisputed && (
              <button type="button" className="btn btn-secondary" onClick={actions.startDispute}>
                Tartışmalı kısım için süreci başlat
              </button>
            )}
            <span className="text-[12px] text-neutral-400">
              {lease.settled
                ? "Ödeme SEP-24 withdraw ile IBAN'a gönderildi."
                : "İtirazsız kısım beklemeden ödenir; donuk kısım süreç sonuna kadar kasada kalır."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
