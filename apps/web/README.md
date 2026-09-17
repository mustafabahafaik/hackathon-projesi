# apps/web — Depozito arayüzü

Next.js (App Router) + TypeScript + TailwindCSS. Nocturne tasarım sistemine bağlı, koyu zeminli,
masaüstü öncelikli. Kullanıcıya dönük her metin Türkçe; tanımlayıcılar ve yorumlar İngilizce.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

## Yerleşim

```
src/app/
  globals.css          Nocturne token'ları + Tailwind teması + bileşen katmanı (.btn, .card, .tag, .table …)
  layout.tsx           Kök düzen: Inter, sticky başlık, uygulama store'u
  page.tsx             Landing
  giris/page.tsx       E-posta + doğrulama kodu adımları
  uygulama/page.tsx    Uygulama kabuğu (kenar çubuğu + kira detayı)

src/components/
  site-header.tsx      Başlık; oturum açıkken rol anahtarı ve çıkış
  site-footer.tsx
  landing/             hero (dekorasyon katmanları), petals, stat-band, how-it-works
  app/                 lease-sidebar, new-lease-form, lease-detail, chain-events-table
  app/tabs/            summary, deposit, photos, exit, dispute, evidence

src/lib/
  types.ts             Alan modeli + kontrat storage eşlemesi (instance / persistent / temporary)
  format.ts            TL/USDC biçimleme, zaman damgası, deterministik yer tutucu üreteci
  derive.ts            Kiradan türeyen değerler (depozito adımları, çıkış toplamları, sonraki adım)
  demo-data.ts         ⚠ Tasarım verisi — zincir okuması değil. Değişecek tek nokta: getLeases()
  store.tsx            Oturum + kira durumu; her eylem bir kontrat/anchor çağrısının yerini tutar
```

## Tasarım token'ları

Renk, boşluk, yarıçap, gölge ve tipografi yalnızca `globals.css` içindeki `@theme` bloğunda tanımlıdır.
`--spacing: 2.8px` sayesinde Tailwind'in boşluk skalası Nocturne'ün `--space-*` değerlerine birebir
oturur. Bileşenlerde ham hex kullanmayın; yeni bir renk gerekiyorsa rampadan bir adım seçin.

## Bilinen sınır

Zincir, anchor ve kasa entegrasyonları henüz bağlı değil. Ayrıntı için kök `README.md` →
"Entegrasyon sınırı".
