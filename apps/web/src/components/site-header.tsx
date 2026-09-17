"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import type { Role } from "@/lib/types";

/**
 * The header bar. Guests see the sign-in action; inside the application it
 * gains the role switch, the signed-in address and the sign-out action.
 */
export function SiteHeader() {
  const { state, role, actions } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const inApp = Boolean(state.session) && pathname.startsWith("/uygulama");

  function handleLogout() {
    actions.logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-[5] flex items-center justify-between gap-8 border-b border-divider bg-bg px-gutter py-4">
      <Link href="/" className="flex items-center gap-3 text-text hover:text-text">
        <span className="h-[9px] w-[9px] rounded-[2px] bg-accent" />
        <span className="font-heading text-[15.5px] font-medium tracking-[-0.01em]">Depozito</span>
      </Link>

      <div className="flex items-center gap-6">
        <span className="tag tag-outline">Stellar Testnet</span>

        {inApp ? (
          <div className="flex items-center gap-4">
            {/* Demo affordance only — in production the role comes from the session. */}
            <div className="flex gap-1 rounded-md border border-neutral-800 p-1">
              <RoleOption label="Kiracı" value="tenant" active={role === "tenant"} onSelect={actions.setRole} />
              <RoleOption label="Ev sahibi" value="landlord" active={role === "landlord"} onSelect={actions.setRole} />
            </div>
            <span className="text-[12.5px] text-neutral-300">{state.session?.email}</span>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              Çıkış
            </button>
          </div>
        ) : (
          <Link href="/giris" className="btn btn-primary">
            Giriş yap
          </Link>
        )}
      </div>
    </header>
  );
}

function RoleOption({
  label,
  value,
  active,
  onSelect,
}: {
  label: string;
  value: Role;
  active: boolean;
  onSelect: (role: Role) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(value)}
      className="relative rounded-sm px-6 py-2 text-[12.5px] text-text hover:bg-neutral-900"
    >
      {active && (
        <span className="pointer-events-none absolute inset-0 rounded-sm bg-accent/16 shadow-[inset_0_0_0_1px_var(--color-accent)]" />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}
