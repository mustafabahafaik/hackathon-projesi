"use client";

import { fmtTry } from "@/lib/format";
import { statusText } from "@/lib/derive";
import { useStore } from "@/lib/store";

export function LeaseSidebar() {
  const { state, isLandlord, role, actions } = useStore();

  return (
    <aside className="flex flex-col gap-6 border-r border-divider px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] tracking-[0.08em] text-neutral-400 uppercase">
          Kira kayıtları
        </span>
        {isLandlord && (
          <button type="button" className="btn btn-ghost" onClick={actions.openNewLease}>
            + Yeni
          </button>
        )}
      </div>

      <div className="grid gap-3">
        {state.leases.map((l) => {
          const active = l.id === state.activeId && !state.showNew;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => actions.selectLease(l.id)}
              className="relative grid gap-2 rounded-md border border-neutral-800 px-6 py-4 text-left hover:bg-neutral-900"
            >
              {active && (
                <span className="pointer-events-none absolute inset-0 rounded-md border-l-2 border-accent bg-accent/10" />
              )}
              <span className="relative text-[13.5px]">{l.address}</span>
              <span className="relative flex items-center gap-3 text-[11.5px] text-neutral-300">
                <span>#{l.id}</span>
                <span>·</span>
                <span>{fmtTry(l.amount)}</span>
              </span>
              <span className="relative text-[11px] text-accent-300">{statusText(l)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto grid gap-3">
        <div
          className="h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-divider) 48px, var(--color-divider) calc(100% - 48px), transparent)",
          }}
        />
        <div className="text-[11.5px] leading-[1.6] text-neutral-400">
          Görünüm: {role === "tenant" ? "Kiracı" : "Ev sahibi"}. Rolü üstteki anahtardan değiştirip
          karşı tarafın ekranını görebilirsiniz.
        </div>
      </div>
    </aside>
  );
}
