const STATS = [
  { value: "%4,1", caption: "Kasa yıllık getirisi · kiracıya ait" },
  { value: "0 gün", caption: "İtirazsız tutar için bekleme" },
  { value: "SHA-256", caption: "Fotoğraf kanıtı zincirde" },
  { value: "3 tur", caption: "Sonra son teklif tahkimi" },
];

/** The page's one saturated field — saturation carried as presence, at page scale. */
export function StatBand() {
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-8 bg-section p-gutter">
      {STATS.map((s) => (
        <div key={s.value} className="grid gap-2">
          <div className="font-heading text-[30px] font-medium">{s.value}</div>
          <div className="text-[13px] text-accent-200">{s.caption}</div>
        </div>
      ))}
    </section>
  );
}
