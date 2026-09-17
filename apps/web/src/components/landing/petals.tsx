import { createRng } from "@/lib/format";

/**
 * The hero's sakura field: 16 petals, each an outer span that falls and an
 * inner span that sways, with negative delays so the field is already
 * populated on first paint. Motion is dropped under prefers-reduced-motion
 * (see globals.css).
 *
 * Positions come from a seeded generator so the server and client markup
 * match; a Math.random() field would trip hydration.
 */
const rng = createRng(0x9184d9);

const TINTS = [
  "color-mix(in srgb, var(--color-accent-300) 62%, transparent)",
  "color-mix(in srgb, var(--color-accent-400) 58%, transparent)",
  "color-mix(in srgb, var(--color-accent-200) 46%, transparent)",
];

const PETALS = Array.from({ length: 16 }, (_, i) => {
  const size = 7 + rng() * 8;
  return {
    key: "p" + i,
    left: (rng() * 100).toFixed(2) + "%",
    size,
    fall: (11 + rng() * 10).toFixed(2),
    sway: (3.4 + rng() * 2.8).toFixed(2),
    delay: (-rng() * 16).toFixed(2),
    tint: TINTS[i % TINTS.length],
    opacity: 0.32 + rng() * 0.4,
  };
});

export function Petals() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden">
      {PETALS.map((p) => (
        <span
          key={p.key}
          className="absolute top-0 will-change-transform"
          style={{
            left: p.left,
            animation: `sakura-fall ${p.fall}s linear ${p.delay}s infinite`,
          }}
        >
          <span
            data-petal
            className="block"
            style={{
              width: `${p.size}px`,
              height: `${p.size * 0.82}px`,
              background: p.tint,
              opacity: p.opacity,
              borderRadius: "100% 8% 100% 8%",
              animation: `sakura-sway ${p.sway}s ease-in-out ${p.delay}s infinite`,
            }}
          />
        </span>
      ))}
    </span>
  );
}
