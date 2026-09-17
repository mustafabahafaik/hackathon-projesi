"use client";

import { useState } from "react";
import { disputePhaseNote, exitTotals, roundText } from "@/lib/derive";
import { fmtTry } from "@/lib/format";
import { lastOfferBy, useStore } from "@/lib/store";

/**
 * The graduated dispute: offer / counter-offer for three rounds, then baseball
 * arbitration — the arbiter must pick one of the two standing numbers and
 * cannot write one of their own.
 */
export function DisputeTab() {
  const { lease, role, actions } = useStore();
  const totals = exitTotals(lease);
  const dispute = lease.dispute;

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const inNegotiation = Boolean(dispute) && !dispute?.ruling && (dispute?.round ?? 0) <= 3;
  const inArbitration = Boolean(dispute) && !dispute?.ruling && (dispute?.round ?? 0) > 3;
  const resolved = Boolean(dispute?.ruling);

  const offers = dispute?.offers ?? [];
  const lastOffer = offers.length ? offers[offers.length - 1] : null;
  const canAcceptLast = Boolean(lastOffer) && lastOffer!.party !== role;

  function submitOffer() {
    const parsed = parseInt(String(amount).replace(/\D/g, ""), 10);
    if (!parsed) return;
    actions.submitOffer(parsed, reason);
    setAmount("");
    setReason("");
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-4">
        <span className="tag tag-accent">Donuk tutar {fmtTry(totals.disputed)}</span>
        <span className="tag tag-outline">{roundText(lease)}</span>
        <span className="text-[12.5px] text-neutral-300">{disputePhaseNote(lease)}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-card-xl">
        <div className="card grid content-start gap-6 p-card-lg">
          <div className="text-[11px] tracking-[0.08em] text-neutral-400 uppercase">
            Teklif geçmişi
          </div>
          <div className="grid gap-6">
            {offers.map((o, i) => (
              <div key={i} className="grid gap-1 border-l-2 border-accent-700 pl-6">
                <div className="text-[13.5px]">
                  {o.party === "tenant" ? "Kiracı" : "Ev sahibi"} · {fmtTry(o.amount)}
                </div>
                <div className="text-[12px] text-neutral-400">
                  Tur {o.round} · {o.reason}
                </div>
              </div>
            ))}
            {offers.length === 0 && (
              <div className="text-[13px] text-neutral-400">
                Henüz teklif yok. İlk teklifi siz verebilirsiniz.
              </div>
            )}
          </div>
        </div>

        <div className="card grid content-start gap-6 p-card-lg">
          {inNegotiation && (
            <div className="grid gap-6">
              <div className="field">
                <label htmlFor="of-tut">Teklifiniz (TL)</label>
                <input
                  className="input"
                  id="of-tut"
                  inputMode="numeric"
                  placeholder="1800"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="of-ger">Gerekçe</label>
                <input
                  className="input"
                  id="of-ger"
                  placeholder="Kısaca yazın · kanıt fotoğrafı"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={submitOffer}>
                Teklifi gönder
              </button>
              {canAcceptLast && (
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={actions.acceptLastOffer}
                >
                  {fmtTry(lastOffer!.amount)} teklifini kabul et
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={actions.goToArbitration}
              >
                Son teklif tahkimine geç
              </button>
              <div className="text-[12px] leading-[1.6] text-neutral-400">
                Tur 3 sonunda anlaşma olmazsa dosya otomatik tahkime düşer. Hakem ara rakam yazamaz.
              </div>
            </div>
          )}

          {inArbitration && (
            <div className="grid gap-6">
              <div className="text-[11px] tracking-[0.08em] text-neutral-400 uppercase">
                Son teklif tahkimi · hakem görünümü
              </div>
              <FinalOffer
                caption="Ev sahibi son teklifi"
                amount={fmtTry(lastOfferBy(lease, "landlord"))}
                onPick={() => actions.arbitratorDecide("landlord")}
              />
              <FinalOffer
                caption="Kiracı son teklifi"
                amount={fmtTry(lastOfferBy(lease, "tenant"))}
                onPick={() => actions.arbitratorDecide("tenant")}
              />
              <div className="text-[12px] leading-[1.6] text-neutral-400">
                Hakem iki rakamdan birini seçmek zorundadır; ara rakam yazamaz. Karar zincire
                yazılır.
              </div>
            </div>
          )}

          {resolved && dispute?.ruling && (
            <div className="grid gap-6">
              <div className="text-[11px] tracking-[0.08em] text-neutral-400 uppercase">Sonuç</div>
              <div className="font-heading text-[24px] leading-[1.3] font-medium">
                {fmtTry(dispute.ruling.amount)} ev sahibine ödenecek
              </div>
              <div className="text-[13px] leading-[1.65] text-neutral-300">
                {dispute.ruling.by === "anlasma"
                  ? "Taraflar anlaştı; hakem devreye girmedi."
                  : `Hakem ${
                      dispute.ruling.by === "tenant" ? "kiracının" : "ev sahibinin"
                    } son teklifini seçti. Taraflardan biri reddederse fon donuk kalır ve delil paketi üretilir.`}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => actions.setTab("delil")}
              >
                Delil paketini gör
              </button>
            </div>
          )}

          {!dispute && (
            <div className="text-[13px] leading-[1.65] text-neutral-400">
              Süreç henüz başlamadı. Çıkış hesabı sekmesinde bir kaleme itiraz edip
              &quot;Tartışmalı kısım için süreci başlat&quot; düğmesiyle turları açabilirsiniz.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FinalOffer({
  caption,
  amount,
  onPick,
}: {
  caption: string;
  amount: string;
  onPick: () => void;
}) {
  return (
    <div className="card elev-sm grid gap-4 p-8">
      <div className="text-[12px] text-neutral-300">{caption}</div>
      <div className="font-heading text-[26px] font-medium">{amount}</div>
      <button type="button" className="btn btn-primary" onClick={onPick}>
        Bu rakamı seç
      </button>
    </div>
  );
}
