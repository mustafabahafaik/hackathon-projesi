# CLAUDE.md — Depozito Escrow (Stellar Pro Hackathon 2026)

Bu dosya, bu repo üzerinde çalışan her Claude Code oturumunun uyması gereken kuralları ve bağlamı tanımlar. Kod yazmaya başlamadan önce bu dosyanın tamamını oku.

## Proje Özeti

Türkiye'deki kiracılar (özellikle öğrenciler) için depozito emanet sistemi. Ev sahibi uygulamada bir kira kaydı açıp kiracıya link gönderir. Kiracı e-postasıyla giriş yapar ve depozitoyu TL olarak yatırır. Para bir anchor üzerinden zincire gelir, Soroswap ile USDC'ye çevrilir ve Soroban emanet sözleşmesi aracılığıyla DeFindex kasasına yatırılır — depozito kira boyunca ne ev sahibinde ne kiracıda durur, getiri üretir. Giriş ve çıkışta iki taraf evin fotoğraflarını yükler; fotoğrafların hash'i zincire yazılarak değiştirilemez bir kanıt oluşur. Anlaşmazlık olursa kademeli bir süreç işler: itirazsız kısım anında ödenir, tartışmalı kısım dondurulur, taraflar süre/tur sınırlı teklif-karşı teklif yapar, anlaşma çıkmazsa "son teklif tahkimi" (baseball arbitration) ile önceden seçilmiş bir hakem iki taraftan birinin rakamını seçmek zorundadır; taraflardan biri kararı reddederse fon donuk kalır ve sistem mahkeme/arabulucu için zaman damgalı bir delil paketi üretir.

Tam mimari doküman (sistem diyagramı, sözleşme fonksiyonları, storage tipleri, entegrasyon detayları, jüri kriterleri eşlemesi, sprint planı): https://claude.ai/artifact/CcvGabPfhBN7FkJR8kNDjv — herhangi bir tasarım kararında emin değilsen önce oraya bak.

**Hackathon:** Rise In x Stellar Pro Hackathon 2026, 19-20 Eylül, Grand Pera / Beyoğlu, İstanbul. **Genesis Track**'e başvuruyoruz (açık başvuru, sıfırdan ürün, testnet'te çalışan prototip). Submission deadline: 20 Eylül 12:00. Demo Day: 20 Eylül 13:00-14:30 (sadece Genesis jürisi).

## Jüri Neye Bakıyor — Asla Unutma

- **Mock/hardcoded veri kabul edilmiyor.** Her entegrasyon (anchor, Soroswap, DeFindex) testnet üzerinde gerçek bir çağrı yapmalı; sahte bir "başarılı" yanıt döndürmek diskalifiye sebebi.
- **Anchor / Local Payments** en ağır tartılan Ecosystem Fit maddesi: kullanıcı gerçek TL yatırıp gerçek TL çekebilmeli (ya da protokolü tam uygulayan, sadece banka tarafı simüle edilmiş bir anchor — bkz. "Anchor Riski" altında).
- **Soroban storage tiplerinin (instance / persistent / temporary) doğru ve bilinçli kullanımı** açıkça soruluyor — kodda hangi verinin neden hangi storage'da tutulduğu yorumla belirtilmeli.
- Sistem mimarisi açık şekilde dokümante edilmiş olmalı (README + bu dosya + mimari diyagram).
- Public GitHub repo, well-structured README, deploy edilmiş kontrat ID'leri, çalışan front-end URL'i, canlı demo zorunlu.
- Passkey/smart wallet bonus, zorunlu değil — Privy ile embedded wallet yeterli.

## Tech Stack

- **Smart contracts:** Soroban (Rust), Stellar Testnet
- **Frontend:** Next.js (App Router) + TypeScript + TailwindCSS
- **Auth/Wallet:** Privy (e-posta girişi + gömülü/embedded cüzdan, cüzdansız onboarding)
- **Backend:** Node.js/TypeScript (Express veya NestJS), Postgres, Prisma (ya da Drizzle)
- **Entegrasyonlar:** Stellar Anchor (SEP-6/24/12/38), Soroswap (swap routing), DeFindex (yield vault)
- **Dosya depolama:** S3 uyumlu obje depolama (fotoğraflar) — sadece hash zincire yazılır, dosyanın kendisi değil
- **Deploy:** Vercel (frontend), Railway/Fly.io (backend), Soroban CLI (kontrat deploy)

## Repo Yapısı (hedef — yoksa bu şekilde oluştur)

```
/contracts
  /escrow             Soroban emanet sözleşmesi (Rust)
/apps
  /web                Next.js frontend
  /api                Backend servisleri (auth, lease, escrow-orchestrator, anchor-integration, indexer, notification)
/packages
  /sdk                Kontrat client/binding'leri, paylaşılan tipler
/docs
  architecture.md     Mimari dokümanın markdown kopyası / Mermaid diyagramları
  submission.md       Hackathon submission checklist'i
.env.example
README.md
```

## Kurallar

1. **Hiçbir zaman "çalışıyor gibi görünen" mock veri kullanma.** Anchor akışı gerçek bir SEP-24 interactive flow izlemeli; Soroswap ve DeFindex çağrıları gerçek testnet kontrat adreslerine gitmeli.
2. **Storage tipini bilinçli seç ve yorumla:** global config (admin adresi, DeFindex/Soroswap/arbiter adresleri) → `instance`; kira kaydı, fotoğraf hash'leri, teklif geçmişi (aylarca yaşamalı) → `persistent`; aktif teklif/karşı teklif turu oturum verisi (tur kapanınca gerek kalmıyor) → `temporary`.
3. **Sır yönetimi:** her private key/API secret `.env`'de tutulur, asla koda gömülmez, asla commit edilmez. `.env.example` commit edilir, `.env` edilmez (`.gitignore`'da olduğundan emin ol).
4. **Sadece Testnet.** Mainnet adresi, anahtarı veya deploy komutu bu repoda asla olmamalı.
5. **Her Soroban fonksiyonu için en az bir test yaz:** bir happy-path testi + yetkisiz çağrının reddedildiğini gösteren en az bir test.
6. **Commit mesajları kısa ve İngilizce**, ne/neden formatında (örn. `Add deposit() with DeFindex vault call`).
7. Kod içi tanımlayıcılar (fonksiyon/değişken adları, yorumlar) İngilizce; kullanıcıya dönük metinler (UI, hata mesajları, bildirimler) Türkçe.
8. **Zaman kısıtlı çalışıyoruz (~30 saat).** Önce "Zorunlu MVP Kapsamı" listesindeki adımları bitir, ancak ondan sonra "Zaman Kalırsa" listesine geç. Bir adımı atlıyorsan bunu README'de ve bu dosyada açıkça not et.
9. Her önemli adımdan sonra (kontrat deploy, entegrasyon çalışır hale geldiğinde, bir akış uçtan uca test edildiğinde) `git commit` yap — büyük, tek seferlik commit'ler yerine küçük ve izlenebilir commit'ler tercih edilir.
10. Bir tasarım kararında (state machine, fonksiyon imzası, veri modeli) mimari dokümandan sapman gerekiyorsa, nedenini bu dosyaya veya `docs/architecture.md`'ye kısaca not düş.

## Bilinen Tasarım Sapmaları (rule 10)

- **`contracts/escrow/src/dispute.rs`, anlaşmazlık döngüsü:** Mimari dokümanın state diyagramındaki `pay_undisputed()` ve `escalate_arbitration()` adımları ayrı fonksiyon olarak eklenmedi — sırasıyla `initiate_dispute()` ve `submit_final_offer()`'a katlandı (her ikisi de kendi başına bir taraf kararı gerektirmeyen, mekanik geçişler). Sonuç olarak `LeaseStatus::Disputed` zincirde asla kalıcı bir `status` değeri olarak gözlemlenmez — `initiate_dispute()` kirayı doğrudan `Active`'den `PartialPaid`'e taşır. `decision_rejected()` de ayrı bir imzalı işlem olarak yok: herkese açık bir zincirde bir tarafı "reddet" işlemine imza atmaya zorlamanın yolu olmadığından, mimari dokümanın kabul/red adımı bir **zaman aşımı**na dönüştürüldü — `arbitrator_decide()`, hakem tahkim süresini kaçırdıktan sonra çağrılırsa (yetkisiz/permissionless) kirayı `Frozen`'a taşır; `official_ruling()` de sadece `Frozen` durumundan çalışır. Ayrıntı ve gerekçe için `dispute.rs`'in modül yorumuna bak.
- **`packages/sdk/src/index.ts`'in `LeaseStatus` yorumu, `contracts/escrow`'daki durumla tutarsız:** TS tarafındaki yorum "`PartialPaid` -> `settle_undisputed` itirazsız kısmı öder, sonra `Disputed` -> `initiate_dispute` tartışmalı kısmı dondurur" sırasını ima ediyor; ama hem mimari dokümanın state diyagramı hem de kontratın kendisi tam tersini uyguluyor (`Settling -> Disputed (initiate_dispute) -> PartialPaid (pay_undisputed, artık initiate_dispute'a katlı)`). `packages/sdk` bu görevin kapsamı dışında bırakıldı — TS SDK'ya dokunan bir sonraki oturum bu yorumu kontrata göre düzeltmeli.

## Zorunlu MVP Kapsamı (bu sırayla ilerle)

1. Soroban escrow contract: `create_lease`, `deposit`, `record_photo_hash`, `settle_undisputed` — testnet'e deploy et, contract ID'yi `docs/submission.md`'ye kaydet.
2. Anchor entegrasyonu (SEP-24 interactive deposit/withdraw) — gerçek bir testnet TRY anchor'ı yoksa, protokolü tam uygulayan ama banka onayını simüle eden minimal bir anchor stub'ı kur (bkz. "Anchor Riski").
3. Soroswap swap çağrısı (en az bir yönde: anchor varlığı → USDC).
4. DeFindex vault deposit/withdraw entegrasyonu.
5. Privy ile e-posta girişi + gömülü cüzdan.
6. Temel web akışı: kira oluştur → depozito yatır → durum gör → giriş/çıkış fotoğrafı yükle → çek.
7. README + kontrat ID'leri + demo URL'i + mimari diyagram (Mermaid).

**Zaman kalırsa (nice-to-have, bu sırayla):**

8. Tam anlaşmazlık döngüsü: `initiate_dispute`, `submit_offer`, `submit_final_offer`, `arbitrator_decide`, `official_ruling`.
9. Otomatik delil paketi export'u (PDF/JSON).
10. Hakem paneli UI'ı.

## Anchor Riski

Test ağında hazır bir TRY anchor bulunamazsa: SEP-6/24/12/38 protokolünü eksiksiz uygulayan (gerçek interactive flow, gerçek KYC formu, gerçek quote akışı) ama banka transferini simüle eden minimal bir anchor stub'ı kur. Bunu README'de ve demo sırasında açıkça belirt — protokol gerçek, sadece banka tarafı hackathon için simüle edilmiş.

## Ortam Değişkenleri (.env.example şablonu)

```
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=
ESCROW_CONTRACT_ID=
DEFINDEX_VAULT_ADDRESS=
SOROSWAP_ROUTER_ADDRESS=
ANCHOR_HOME_DOMAIN=
PRIVY_APP_ID=
PRIVY_APP_SECRET=
DATABASE_URL=
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

## Komutlar

- Kontrat build: `cd contracts/escrow && cargo build --target wasm32-unknown-unknown --release`
- Kontrat test: `cd contracts/escrow && cargo test`
- Kontrat deploy (testnet): `stellar contract deploy --wasm target/wasm32-unknown-unknown/release/escrow.wasm --network testnet --source <hesap>`
- Frontend dev: `cd apps/web && npm run dev`
- Backend dev: `cd apps/api && npm run dev`
- Backend test: `cd apps/api && npm test`

## Faydalı Kaynaklar

- Anchor SEP akışları: skills.stellar.org → Anchors
- Soroswap SDK/Docs, DeFindex SDK/Docs (bkz. mimari doküman → Protokol Entegrasyonları bölümü)
- Stellar testnet faucet: https://lab.stellar.org/account/fund
- Stellar RPC / event indexleme: developers.stellar.org/docs/data/apis/rpc
