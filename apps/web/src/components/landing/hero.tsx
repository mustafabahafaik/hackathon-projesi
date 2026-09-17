"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Petals } from "./petals";
import { useStore } from "@/lib/store";

/**
 * The hero and its decoration stack, all of it pointer-events:none behind the
 * content: a cursor-follow accent glow, a static deep-indigo glow, a grid of
 * hairlines revealed only near the cursor, two fading rules, two parallax
 * squares, the petal field and a gradient fade into the page ground.
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const router = useRouter();
  const { actions } = useStore();

  // One passive listener drives every layer: --mx/--my in hero-relative px,
  // --px/--py normalised to -1…1 for the parallax offsets.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const hero = ref.current;
      if (!hero) return;
      const r = hero.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      hero.style.setProperty("--mx", x + "px");
      hero.style.setProperty("--my", y + "px");
      hero.style.setProperty("--px", ((x / r.width) * 2 - 1).toFixed(3));
      hero.style.setProperty("--py", ((y / r.height) * 2 - 1).toFixed(3));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  function goDemo() {
    actions.loginAsDemo();
    router.push("/uygulama");
  }

  return (
    <section
      ref={ref}
      data-hero
      className="relative isolate grid gap-8 overflow-hidden px-gutter pt-hero-top pb-hero-bottom"
    >
      {/* 1 — cursor-follow accent glow */}
      <span
        className="pointer-events-none absolute inset-0 -z-[3] transition-[background] duration-[120ms] ease-linear"
        style={{
          background:
            "radial-gradient(560px circle at var(--mx, 62%) var(--my, 34%), color-mix(in srgb, var(--color-accent) 22%, transparent) 0%, transparent 66%)",
        }}
      />
      {/* 2 — static deep-indigo glow, offset by the parallax vars */}
      <span
        className="pointer-events-none absolute inset-0 -z-[3]"
        style={{
          background:
            "radial-gradient(760px circle at calc(88% - var(--px, 0) * 26px) calc(6% - var(--py, 0) * 18px), color-mix(in srgb, var(--color-section-glow) 42%, transparent) 0%, transparent 62%)",
        }}
      />
      {/* 3 — 46px hairline grid, revealed only near the cursor */}
      <span
        className="pointer-events-none absolute inset-0 -z-[2]"
        style={{
          background:
            "repeating-linear-gradient(to right, var(--color-neutral-800) 0 1px, transparent 1px 46px), repeating-linear-gradient(to bottom, var(--color-neutral-800) 0 1px, transparent 1px 46px)",
          WebkitMaskImage:
            "radial-gradient(300px circle at var(--mx, 62%) var(--my, 34%), #000 0%, transparent 72%)",
          maskImage:
            "radial-gradient(300px circle at var(--mx, 62%) var(--my, 34%), #000 0%, transparent 72%)",
        }}
      />
      {/* 4 — two rules that fade to transparent at both ends */}
      <span
        className="pointer-events-none absolute inset-x-0 top-[22%] -z-[2] h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--color-divider) 12%, var(--color-divider) 88%, transparent)",
        }}
      />
      <span
        className="pointer-events-none absolute inset-x-0 bottom-[16%] -z-[2] h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--color-divider) 22%, var(--color-divider) 74%, transparent)",
        }}
      />
      {/* 5 — two 45°-rotated squares, translating against the pointer */}
      <span
        className="pointer-events-none absolute -z-[2] aspect-square rounded-lg border border-accent/42 transition-transform duration-[260ms] ease-out"
        style={{
          right: "calc(var(--space-8) * 2)",
          top: "34%",
          width: "clamp(180px, 22vw, 320px)",
          transform: "rotate(45deg) translate(calc(var(--px, 0) * 14px), calc(var(--py, 0) * 14px))",
        }}
      />
      <span
        className="pointer-events-none absolute -z-[2] aspect-square rounded-md border border-neutral-800 transition-transform duration-[260ms] ease-out"
        style={{
          right: "calc(var(--space-8) * 5)",
          top: "46%",
          width: "clamp(90px, 10vw, 150px)",
          transform:
            "rotate(45deg) translate(calc(var(--px, 0) * -22px), calc(var(--py, 0) * -22px))",
        }}
      />
      {/* 6 — the petal field */}
      <Petals />
      {/* 7 — bottom fade into the page ground */}
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-[1] h-[140px]"
        style={{ background: "linear-gradient(to bottom, transparent, var(--color-bg))" }}
      />

      <span className="tag tag-accent justify-self-start">Kiracı depozitosu emanette</span>
      <h1 className="m-0 max-w-[20ch] font-heading text-[clamp(34px,4.4vw,58px)] leading-[1.08] font-medium tracking-[-0.03em] text-pretty">
        Depozitonuz ne ev sahibinde ne bizde durur.
      </h1>
      <p className="m-0 max-w-[62ch] text-[16.5px] leading-[1.7] text-neutral-300">
        Kiracı depozitoyu TL olarak yatırır; para emanet sözleşmesinde tutulur ve kira boyunca getiri
        üretir. Giriş ve çıkışta iki taraf da evin fotoğraflarını yükler, fotoğrafların özeti zincire
        yazılır. Çıkışta itiraz edilmeyen tutar beklemeden ödenir.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/giris" className="btn btn-primary">
          E-posta ile başla
        </Link>
        <button type="button" className="btn btn-secondary" onClick={goDemo}>
          Demo hesabı gör
        </button>
      </div>
    </section>
  );
}
