"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LeaseDetail } from "@/components/app/lease-detail";
import { LeaseSidebar } from "@/components/app/lease-sidebar";
import { NewLeaseForm } from "@/components/app/new-lease-form";
import { useStore } from "@/lib/store";

export default function AppPage() {
  const { state } = useStore();
  const router = useRouter();

  // The session lives in the client store; without one there is nothing to show.
  useEffect(() => {
    if (!state.session) router.replace("/giris");
  }, [state.session, router]);

  if (!state.session) return null;

  return (
    <div className="grid min-h-0 grid-cols-[290px_minmax(0,1fr)]">
      <LeaseSidebar />
      <main className="grid max-w-[1120px] min-w-0 content-start gap-8 px-gutter py-8">
        {state.showNew ? <NewLeaseForm /> : <LeaseDetail />}
      </main>
    </div>
  );
}
