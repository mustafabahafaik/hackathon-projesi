# Depozito — kira depozitosu emanet sistemi

Stellar Pro Hackathon 2026 · Genesis Track · Stellar Testnet

Kiracı depozitoyu TL olarak yatırır; para bir anchor üzerinden zincire gelir, USDC'ye çevrilir ve
Soroban emanet sözleşmesi aracılığıyla DeFindex kasasına yatırılır. Depozito ne ev sahibinde ne
kiracıda durur, kira boyunca getiri üretir. Giriş ve çıkışta iki taraf evin fotoğraflarını yükler,
fotoğrafların SHA-256 özeti zincire yazılır. Çıkışta itiraz edilmeyen tutar beklemeden ödenir,
tartışmalı kısım dondurulur ve süre/tur sınırlı bir teklif–karşı teklif sürecine girer; anlaşma
çıkmazsa son teklif tahkimi (baseball arbitration) devreye girer.

Ürünün tamamının bağlamı ve kuralları için `CLAUDE.md`'ye bakın.

## Şu an ne var

`apps/web` — Next.js (App Router) + TypeScript + TailwindCSS ile kurulmuş web arayüzü. Tasarım
handoff'undaki (`Website tasarımı planlaması.zip` → `Depozito.dc.html`) bütün ekranlar
yeniden üretildi:

| Rota | Ekran |
| --- | --- |
| `/` | Landing: hero (imleç takipli parıltı, maskeli ızgara, paralaks kareler, sakura yaprakları), istatistik bandı, "Nasıl işliyor" izi, footer |
| `/giris` | E-posta → doğrulama kodu adımları (üretimde Privy e-posta girişi + gömülü cüzdan) |
| `/uygulama` | Kira kayıtları listesi + kira detayı: Özet, Depozito, Fotoğraf kanıtı, Çıkış hesabı, Anlaşmazlık, Delil paketi sekmeleri; ev sahibi için yeni kira kaydı formu |

Landing'den "Demo hesabı gör" doğrudan uygulamaya girer. Başlıktaki Kiracı / Ev sahibi anahtarı
yalnızca demo içindir — üretimde rol oturumdan gelir.

### Tasarım sistemi

Arayüz **Nocturne** tasarım sistemine bağlı. Token'lar (renk rampaları, 0.70× yoğunluktaki boşluk
skalası, yarıçaplar, gölgeler, tipografi) `apps/web/src/app/globals.css` içinde bir kez tanımlanır ve
Tailwind temasına eşlenir:

- `--spacing: 2.8px` — Tailwind'in dinamik boşluk skalası doğrudan Nocturne'ün `--space-*` değerlerine
  oturur (`p-3` = 8.4px, `p-8` = 22.4px). Büyük yüzeylerdeki katlar için `p-gutter`, `p-card-lg`,
  `pt-hero-top` gibi adlandırılmış adımlar var.
- Renk rampaları `--color-neutral-*` / `--color-accent-*` olarak tanımlı; Tailwind'in hazır paleti
  temizlendi, böylece `text-neutral-400` yalnızca bir Nocturne adımına çözülebilir.
- `.btn`, `.card`, `.tag`, `.input`, `.field`, `.table`, `.elev-*` bileşen sınıfları Nocturne'den
  birebir taşındı — markup, tasarımın üzerine kurulduğu sınıf adlarını kullanıyor.

Hiçbir yerde ham hex yok; kodda px yazılan tek yer, token'ların taşımadığı tekil font boyutları.

## Entegrasyon sınırı — önemli

Bu aşamada repoda **yalnızca arayüz** var. Zincir ve anchor entegrasyonları henüz bağlanmadı:

- `apps/web/src/lib/demo-data.ts` — ekranların doldurulabilmesi için tasarım verisi. Zincir okuması
  **değildir** ve öyle sunulmamalıdır. Değiştirilecek tek nokta `getLeases()`.
- `apps/web/src/lib/store.tsx` — her eylem, karşılık geldiği kontrat/anchor çağrısının adıyla
  belgelenmiş durumda (`create_lease`, `deposit`, `record_photo_hash`, `settle_undisputed`,
  `initiate_dispute`, `submit_offer`, `submit_final_offer`, `arbitrator_decide`). Gerçek çağrılar
  bu eylemlerin içine girecek.

Jüri kriteri gereği (`CLAUDE.md` → "Jüri Neye Bakıyor") teslimden önce bu iki dosyanın arkasına
gerçek testnet çağrıları bağlanmalı: anchor için SEP-12/24/38, swap için Soroswap, kasa için
DeFindex, kayıtlar için deploy edilmiş escrow kontratı. Ekranlar bugün sahte bir "başarılı" yanıt
üretmiyor — yalnızca yerel durumu ilerletiyor ve her adımı defterine yazıyor.

Yapılacaklar sırası için `CLAUDE.md` → "Zorunlu MVP Kapsamı".

## Çalıştırma

```bash
cd apps/web
npm install
npm run dev          # http://localhost:3000
npm run build        # üretim derlemesi
```

Ortam değişkenleri için `.env.example` dosyasını `.env` olarak kopyalayın. `.env` asla commit
edilmez.

## Repo yapısı

```
/apps/web           Next.js arayüz (hazır)
/apps/api           Backend servisleri (henüz yok)
/contracts/escrow   Soroban emanet sözleşmesi (henüz yok)
/packages/sdk       Kontrat client'ları ve paylaşılan tipler (henüz yok)
/docs               Mimari ve submission notları
```
