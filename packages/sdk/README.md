# @depozito/sdk

Paylaşılan TypeScript tipleri: `Lease`, `LeaseStatus`, `PhotoHashRecord`, `Offer`. `apps/web` ve
`apps/api` bunlara npm workspace bağımlılığı (`"@depozito/sdk": "*"`) üzerinden erişir; kök
`package.json`'daki `workspaces` alanı, npm'in bu paketi kök `node_modules/@depozito/sdk`
altında bir sembolik bağlantı olarak kurmasını sağlar.

Kontratın kendi client/binding'leri (Soroban CLI'nin üreteceği TypeScript bindings) de
escrow kontratı testnet'e deploy edildikten sonra buraya eklenecek.

## Geliştirme

```bash
npm install                 # kökten, workspace'i kurar
npm run build:sdk           # kökten — tsc -p packages/sdk/tsconfig.json
# veya
npm run build -w @depozito/sdk
npm run dev -w @depozito/sdk    # tsc --watch
```

Bu paket derlenmiş halde (`dist/`) tüketiliyor — `LeaseStatus` bir TypeScript `enum`, yani
gerçek çalışma zamanı kodu üretiyor; sadece tip olarak kalmıyor. Tipleri değiştirdikten sonra
`apps/web` veya `apps/api`'nin güncel değerleri görmesi için `npm run build:sdk` çalıştırmanız
gerekir.

## Notlar

- Zincirle hareket eden tutarlar (`Lease.depositAmount`, `Offer.amount`) `bigint`. Soroban i128
  kullanıyor; bir JS `number` bu aralığı hassasiyet kaybetmeden tutamaz. `bigint`,
  `JSON.stringify` ile kendiliğinden serileşmez — HTTP üzerinden taşırken açıkça dönüştürün.
- `PhotoHashRecord` ve `Offer`, `Lease` içine gömülü diziler değil, kendi başlarına ayrı
  kayıtlar — bu, zincirde her birinin kendi anahtarıyla (leaseId + oda / leaseId + tur) ayrı
  `persistent` girdiler olarak tutulmasıyla örtüşüyor (bkz. CLAUDE.md kural 2).
