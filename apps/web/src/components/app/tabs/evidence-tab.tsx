"use client";

import { ChainEventsTable } from "../chain-events-table";
import { useStore } from "@/lib/store";

/**
 * The evidence package a court or mediator can verify independently: every
 * chain record for this lease, timestamped. The PDF export and the
 * `official_ruling` reference come with the full dispute cycle.
 */
export function EvidenceTab() {
  const { lease, actions } = useStore();

  return (
    <div className="grid gap-8">
      <p className="m-0 max-w-[64ch] text-[13.5px] leading-[1.65] text-neutral-300">
        Paket, bu kiraya ait tüm zincir kayıtlarını zaman damgasıyla toplar: kira koşulları,
        fotoğraf hash&apos;leri, teklif geçmişi ve karar. Mahkeme ya da arabulucu hash&apos;leri
        bağımsız doğrulayabilir.
      </p>

      <div className="card overflow-hidden p-0">
        <div className="border-b border-divider px-6 py-4 text-[12px] text-neutral-300">
          evidence-{lease.id}.json
        </div>
        <div className="grid gap-6 overflow-auto p-6">
          <ChainEventsTable
            events={lease.events}
            headers={["Zaman", "Kalem", "İçerik", "Tx"]}
          />
          <div className="flex flex-wrap items-center gap-4 border-t border-divider pt-6">
            <button type="button" className="btn btn-primary" onClick={actions.downloadEvidence}>
              Paketi indir · JSON
            </button>
            <span className="text-[12px] text-neutral-400">
              {lease.dispute?.ruling
                ? `Karar dahil ${lease.events.length} kayıt pakette.`
                : `${lease.events.length} kayıt pakette. Hash'ler Stellar Expert üzerinden doğrulanabilir.`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
