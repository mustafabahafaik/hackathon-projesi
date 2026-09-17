const STEPS = [
  {
    n: "01",
    title: "Ev sahibi kira kaydı açar",
    body: "Adres, depozito tutarı, süre ve anlaşmazlık halinde hakem baştan belirlenir. Kiracıya davet gider.",
  },
  {
    n: "02",
    title: "Kiracı TL yatırır",
    body: "Banka havalesi anchor üzerinden zincire gelir, USDC'ye çevrilir ve emanetten kasaya yatırılır.",
  },
  {
    n: "03",
    title: "İki taraf kanıt yükler",
    body: "Giriş ve çıkış fotoğrafları odalara göre yüklenir; dosya depoda kalır, özeti zincire yazılır.",
  },
  {
    n: "04",
    title: "Çıkışta hesap kapanır",
    body: "İtirazsız kısım anında ödenir. Tartışmalı kısım için teklif turları, sonunda son teklif tahkimi.",
  },
];

/** Left-to-right cubic; the mirrored variant runs the other way. */
const TRAIL_LTR = "M100 0 C100 46 300 30 300 78";
const TRAIL_RTL = "M300 0 C300 46 100 30 100 78";

export function HowItWorks() {
  return (
    <section className="grid max-w-[1000px] gap-card-xl px-gutter pt-section-y pb-section-b">
      <h2 className="m-0 font-heading text-[26px] font-medium tracking-[-0.02em]">Nasıl işliyor</h2>

      {/* The trail stroke fades to nothing at both ends — Nocturne's rule, drawn as a path. */}
      <svg width="0" height="0" aria-hidden className="absolute">
        <defs>
          <linearGradient id="trailA" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0" />
            <stop offset="0.28" stopColor="var(--color-accent)" stopOpacity="0.75" />
            <stop offset="0.72" stopColor="var(--color-accent)" stopOpacity="0.75" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="grid gap-0">
        {STEPS.map((step, i) => {
          const onLeft = i % 2 === 0;
          const isLast = i === STEPS.length - 1;
          return (
            <div key={step.n} className="contents">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
                <div
                  className={`card grid content-start gap-4 rounded-lg p-card-lg ${
                    onLeft ? "col-start-1" : "col-start-2"
                  }`}
                >
                  <div
                    className={`grid h-10 w-10 place-items-center rounded-md border font-mono text-[13px] text-accent-300 ${
                      isLast ? "border-accent" : "border-accent/55"
                    }`}
                  >
                    {step.n}
                  </div>
                  <div className="font-heading text-[17px] font-medium">{step.title}</div>
                  <div className="text-[13.5px] leading-[1.65] text-neutral-300">{step.body}</div>
                </div>
              </div>

              {!isLast && (
                <svg
                  viewBox="0 0 400 78"
                  preserveAspectRatio="none"
                  aria-hidden
                  className="block h-[78px] w-full"
                >
                  <path
                    d={onLeft ? TRAIL_LTR : TRAIL_RTL}
                    fill="none"
                    stroke="url(#trailA)"
                    strokeWidth="1.4"
                    strokeDasharray="5 7"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
