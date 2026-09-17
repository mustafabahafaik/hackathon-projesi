"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

const DEFAULT_TERM = "12 ay · 01.10.2026 – 30.09.2027";

/** Landlord-only. Submitting is the `create_lease` call plus the tenant invite. */
export function NewLeaseForm() {
  const { actions } = useStore();
  const [address, setAddress] = useState("");
  const [tenant, setTenant] = useState("");
  const [amount, setAmount] = useState("24000");
  const [term, setTerm] = useState(DEFAULT_TERM);
  const [error, setError] = useState("");

  function submit() {
    const parsed = parseInt(String(amount).replace(/\D/g, ""), 10);
    if (!address || !tenant.includes("@") || !parsed) {
      setError("Adres, geçerli kiracı e-postası ve tutar gerekli.");
      return;
    }
    setError("");
    actions.createLease({ address, tenant, amount: parsed, term });
  }

  return (
    <section className="card elev-md grid gap-8 p-card-xl">
      <div className="grid gap-3">
        <h1 className="m-0 font-heading text-[24px] font-medium tracking-[-0.02em]">
          Yeni kira kaydı
        </h1>
        <p className="m-0 text-[13.5px] leading-[1.65] text-neutral-300">
          Kaydı oluşturduğunuzda kiracıya davet linki gider ve depozito adımı açılır.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-8">
        <div className="field">
          <label htmlFor="nf-adres">Konut adresi</label>
          <input
            className="input"
            id="nf-adres"
            placeholder="Beşiktaş, İstanbul · daire 7"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="nf-kiraci">Kiracı e-postası</label>
          <input
            className="input"
            id="nf-kiraci"
            placeholder="kiraci@ogrenci.edu.tr"
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="nf-dep">Depozito (TL)</label>
          <input
            className="input"
            id="nf-dep"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="nf-sure">Kira süresi</label>
          <input
            className="input"
            id="nf-sure"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="btn btn-primary" onClick={submit}>
          Kaydı oluştur ve davet gönder
        </button>
        <button type="button" className="btn btn-ghost" onClick={actions.cancelNewLease}>
          Vazgeç
        </button>
        <span className="text-[12px] text-neutral-400">{error}</span>
      </div>
    </section>
  );
}
