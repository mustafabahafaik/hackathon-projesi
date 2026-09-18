# Submission — escrow kontratı, testnet deploy

Bu dosya `contracts/escrow`'un testnet deploy geçmişini ve doğrulama kanıtını tutar.
Hackathon submission formuna girilecek kontrat ID buradaki **güncel deploy**'dur.

## Güncel deploy

| | |
| --- | --- |
| Ağ | Stellar Testnet |
| Contract ID | `CDVW63VKWFJ76YTMW2QVQRAE22WRBR6SSBWB7JVZUZZU7V766HERFJBO` |
| Wasm hash | `2dc8bccda2d89d13dbc71529d17853e9b14b4af5dec7aaca5caf7ac34c51f1b9` |
| Deploy tx | https://stellar.expert/explorer/testnet/tx/562f469a14ac3a98e9c757b75f9bd65945bfc3892be0df0661fa77a0681be403 |
| Deploy eden hesap | `GCSMWDEADCNWD6MZPDSRU5NPUSD7RPU2BQIFVQDOAU4QQQTSKEHKDY4M` (alias `deployer`) |
| Deploy tarihi | 2026-09-18 |
| Kontrat sürümü | `initialize`, `create_lease`, `deposit`, `record_photo_hash`, `settle_undisputed`, `initiate_dispute`, `submit_offer`, `submit_final_offer`, `arbitrator_decide`, `official_ruling`, `get_lease`, `get_dispute` — **gerçek DeFindex vault entegrasyonu ile** (bkz. aşağıdaki "DeFindex Entegrasyon Kanıtı") |
| `initialize()`'a verilen `defindex_vault` | `CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN` — DeFindex'in gerçek testnet USDC kasası (Paltalabs), mock değil |
| `initialize()`'a verilen `usdc_token` | `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU` — o kasanın gerçek testnet USDC'si (issuer: Blend Capital'ın testnet faucet hesabı) |

Kontratı yeniden deploy etmek için: `scripts/deploy-testnet.sh [alias]`. Script tekrar
çalıştırılabilir — `deployer` kimliği ve testnet fonlaması zaten varsa yeniden kullanılır.
Bu güncel deploy'u uçtan uca (gerçek DeFindex deposit + withdraw dahil) yeniden üretmek
için: `scripts/defindex-integration-test.sh` — bkz. aşağıdaki bölüm.

## DeFindex Entegrasyon Kanıtı (Faz 2.1)

`scripts/defindex-integration-test.sh`, yukarıdaki güncel kontratı sıfırdan deploy edip
**gerçek DeFindex testnet kasasına** karşı tam bir `deposit()` → `settle_undisputed()`
turu çalıştırdı. Hiçbir adım mock değil: `deposit()` ve `settle_undisputed()`,
`contracts/escrow/src/vault.rs`'daki `DefindexVaultClient` üzerinden DeFindex'in kendi
kasa kontratına gerçek bir cross-contract call yapıyor; aşağıdaki `vault_shares` ve
ödeme miktarları bu script'in kendi hesapladığı sayılar değil, DeFindex'in zincirden geri
okunan kendi muhasebesi.

**Kullanılan gerçek testnet kaynakları** (hepsi bağımsız doğrulanabilir):
- DeFindex kasası: `CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN` (Paltalabs
  USDC kasası — `stellar contract info interface --id ... --network testnet` ile
  arayüzü, `get_assets()` ile tuttuğu varlık doğrulandı; ayrıca kaynağı
  [paltalabs/defindex](https://github.com/paltalabs/defindex)'ten okunup `deposit`'in
  gerçekten `asset_client.transfer(&from, &vault, &amount)` yaptığı, dolayısıyla
  `authorize_as_current_contract`'a neden ihtiyaç duyulduğu (`vault.rs`'de belgelendi)
  doğrulandı).
- Testnet USDC: `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU`
  (`USDC:GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56` — Blend Capital'ın
  testnet faucet hesabı bu varlığın issuer'ı; `tenant` hesabı gerçek bir faucet
  işlemiyle fonlandı, bkz. `scripts/defindex-integration-test.sh`'in `ensure_tenant_usdc`
  fonksiyonu).

**Adım adım (lease_id=1, 100000000 stroop = 10 USDC):**

| Adım | Tx | Sonuç |
| --- | --- | --- |
| `initialize` | [74f098f…4fcae3](https://stellar.expert/explorer/testnet/tx/74f098fb64abef58c260fd9f99d0225d2735a1a3d802412413465210244fcae3) | gerçek `defindex_vault`/`usdc_token` ile |
| `create_lease` | [1cc4db2…6949e](https://stellar.expert/explorer/testnet/tx/1cc4db2ffd6d43f9eda63ef410c04e8bec0ac25c993235c3e8b7fa61a0c6949e) | `lease_id=1`, `status=0` (Created) |
| `deposit` | [b5914f1…979a4e](https://stellar.expert/explorer/testnet/tx/b5914f1bb141432c76a38115a079d625d833745f8c5f1d1bf3240ce1aa979a4e) | DeFindex `deposit` event: `df_tokens_minted=100000000`, `total_supply_before=9421856304` (paylaşılan, önceden dolu bir testnet kasası — bu sayıyı biz üretmedik) |
| `get_lease` (deposit sonrası) | — | `status=1` (Funded), `vault_shares="100000000"` — DeFindex'in kendi döndürdüğü değer |
| `record_photo_hash` x2 | [dcf8034…f0b9b](https://stellar.expert/explorer/testnet/tx/dcf8034da83995b6a404b27b81a89a37e87cbba3a7123c9819128105e74f0b9b), [274a766…3fb073](https://stellar.expert/explorer/testnet/tx/274a7660f609a181951dac940679efb9cd9e2abe3d2a126362734dac373fb073) | `Funded` → `Active` |
| `settle_undisputed` | [d63c893…642b20](https://stellar.expert/explorer/testnet/tx/d63c893ad61cff273c8a20c60cf32ff7ac2ce74d27ba2164c3bb7d23cb642b20) | DeFindex `withdraw` event: `df_tokens_burned=100000000`, `amounts_withdrawn=[100000000]` |
| `get_lease` (settle sonrası) | — | `status=9` (Resolved), `vault_shares="0"` |
| tenant USDC bakiyesi | — | `settle_undisputed` çağrısıyla tam `100000000` stroop arttı — DeFindex'in gerçek geri ödemesi |

Depozito ve çekim ~20 saniye arayla olduğu için gerçekçi bir getiri birikmedi (yatan ve
çekilen miktar birebir eşit) — bu beklenen ve dürüst bir sonuç, uydurma bir getiri sayısı
değil. Aylar süren gerçek bir kirada `settle_undisputed()` aynı kod yoluyla DeFindex'in o
zamana kadar biriktirdiği gerçek getiriyi de geri getirecek.

### `authorize_as_current_contract` — neden gerekli

DeFindex'in `deposit()`'i, escrow'un doğrudan çağrısını (`from.require_auth()`, tek atlama)
otomatik yetkilendirir, ama sonra kendi içinde `asset_client.transfer(&from, ...)` çağırarak
USDC'yi ikinci bir atlamayla (escrow → kasa → token) çeker — Soroban bunu otomatik
yetkilendirmez. `contracts/escrow/src/vault.rs`'deki `DefindexVault::deposit`, bu spesifik
alt-çağrıyı `env.authorize_as_current_contract(...)` ile önceden bildirir; bu olmadan hem
yerel testler hem de yukarıdaki gerçek testnet çağrısı `HostError: Error(Auth,
InvalidAction)` ile patlıyordu (bu oturumda önce böyle patladığını, sonra düzeltmenin işe
yaradığını gördük). `withdraw()`'da buna gerek yok — DeFindex oradaki transferi kendi
adresinden yapıyor, kendi kendini yetkilendiriyor. Ayrıntı için `vault.rs`'in kendi modül
yorumuna bak.

## Smoke test kanıtı (Faz 1 — eski deploy `CBA4FFYLQAMOC5JAHATW3YK67OZQN3KQC2KACXZCB66T6Q5LHQ5VERXQ`)

Bu bölüm artık "güncel deploy" değil, Faz 1'in tarihsel kanıtı — DeFindex entegrasyonu
öncesi, `usdc_token` yerine native XLM SAC kullanılarak koşulmuştu (bkz. altındaki "Bilinen
basitleştirme"). Güncel deploy ve gerçek DeFindex kanıtı için yukarıdaki bölümlere bak.

`scripts/smoke-test-testnet.sh <CONTRACT_ID>` o zamanki kontrata (`CBA4FFYL…`) karşı gerçek
zincir çağrılarıyla çalıştırıldı (`initialize` → `create_lease` → `get_lease` → `deposit` →
`get_lease`). Hiçbir adım simüle edilmedi; hepsi testnet'e gönderilmiş, imzalanmış
işlemler.

- `initialize` tx: https://stellar.expert/explorer/testnet/tx/f776d20d9c56ead688eadfa59d05081ac9940a0b467721c2650c639bb2828e30
- `create_lease` tx (lease_id=1): https://stellar.expert/explorer/testnet/tx/c15d6971c5aa0c5001bf915c9fa0a37d3e2a5753fd3ee4fde53ad48814949ce8
- `get_lease` (deposit öncesi) — zincirden okunan gerçek yanıt:
  ```json
  {"amount":"10000000","arbitrator":"GDE27IRC3RESP2BKKGWTOQNGUL2KBNNA6GJWG7O22YUSZU5UM3EAKJ7F","owner":"GDUBT6KMSJW2TIQ3RYUTPOZCX3FNE25TYLJSSVQE35X5Z6WUI4KHY25H","status":0,"tenant":"GBM7RO4E3WFN3G3N6PTRJXG5CTBRESVG6CP2GCG4AVF6EAFXSQIUFJZN","term":1821221720,"vault_shares":"0"}
  ```
  `status: 0` = `LeaseStatus::Created`.
- `deposit` tx: https://stellar.expert/explorer/testnet/tx/1dc713a840f6a2ee2a462d5276027a2bc290c1a29e97559ac59efb06fd9116ab
  — gerçek bir `transfer` event'i yayınladı: tenant (`GBM7RO4E...`) → kontrat
  (`CBA4FFYL...`), `10000000` stroop, varlık `native`.
- `get_lease` (deposit sonrası) — zincirden okunan gerçek yanıt:
  ```json
  {"amount":"10000000","arbitrator":"GDE27IRC3RESP2BKKGWTOQNGUL2KBNNA6GJWG7O22YUSZU5UM3EAKJ7F","owner":"GDUBT6KMSJW2TIQ3RYUTPOZCX3FNE25TYLJSSVQE35X5Z6WUI4KHY25H","status":1,"tenant":"GBM7RO4E3WFN3G3N6PTRJXG5CTBRESVG6CP2GCG4AVF6EAFXSQIUFJZN","term":1821221720,"vault_shares":"10000000"}
  ```
  `status: 1` = `LeaseStatus::Funded`, `vault_shares` artık `amount`'a eşit — depozito
  gerçekten zincirde tenanttan kontrata taşındı ve lease durumu ilerledi.

Bu, CLAUDE.md'nin "mock/hardcoded veri kabul edilmiyor" kriterine karşılık gelen kanıt:
yukarıdaki her tx gerçek bir testnet işlemidir, stellar.expert'te bağımsız doğrulanabilir.

### Bilinen basitleştirme (Faz 1'e özgü, artık çözüldü): `usdc_token` yerine native XLM SAC

Bu smoke test'te `usdc_token` olarak gerçek testnet USDC yerine native XLM'nin Stellar
Asset Contract'ı (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`) kullanıldı
— gerçek testnet USDC edinmek ya da kendi test varlığımızı issuer + trustline ile kurmak
o zaman bu adımın kapsamını aşıyordu. **Faz 2.1'de çözüldü:** yukarıdaki "DeFindex
Entegrasyon Kanıtı" bölümü gerçek testnet USDC (`CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU`)
ile çalıştı — bu artık güncel deploy'un `usdc_token`'ı.

## Toolchain notları (bu ortamda karşılaşılan, tekrar edebilecek sorunlar)

- **`wasm32-unknown-unknown` değil, `wasm32v1-none`.** `soroban-sdk` 27.x, rustc 1.82+
  ile `wasm32-unknown-unknown`'ı reddediyor (reference-types/multi-value proposal'ları
  Soroban'ın desteklemediği şekilde etkin geliyor) ve `wasm32v1-none` istiyor. Plan
  dokümanında `wasm32-unknown-unknown` yazıyordu; güncel toolchain'in kendi önerisine
  göre sapıldı (CLAUDE.md kural 10).
- **`soroban-sdk` sürümü 22.0.0 değil, 27.0.6.** Faz 1.1'de emin olamadan yazdığım
  `22.0.0` pini, `testutils` özelliğinin transitive bağımlılıkları (ed25519-dalek /
  rand_core) güncel Rust ekosistemiyle derlenemeyecek şekilde kırılmıştı. Gerçek
  toolchain kurulunca bu ortaya çıktı; crates.io'daki güncel stabil sürüme (27.0.6)
  geçildi, tüm testler (23/23) bu sürümle geçiyor.
- **Windows + GNU host toolchain + yol içinde Türkçe karakter (örn. "Masaüstü") ==
  linker "No such file or directory" hatası.** Bu makinede MSVC linker için gereken
  Windows SDK kurulu değildi, bu yüzden GNU (MinGW-w64) host toolchain'e geçildi;
  ancak GNU `ld.exe` UTF-8 olmayan/ASCII-dışı karakter içeren yolları çözemiyor.
  `scripts/deploy-testnet.sh` bunu, repo yolu ASCII değilse kaynağı geçici bir ASCII
  dizine kopyalayıp oradan derleyerek otomatik olarak aşıyor.
- **`stellar contract optimize`, "Reading: ... (N bytes)" satırını stderr değil
  stdout'a yazıyor.** `deploy-testnet.sh`'in kendi sözleşmesi ("stdout = sadece contract
  ID, `CONTRACT_ID=$(...)` için güvenli") bu yüzden bozuluyordu —
  `scripts/defindex-integration-test.sh`'in ilk denemesinde `CONTRACT_ID` değişkeni bu
  satırı da yutup geçersiz bir kontrat ID'sine dönüştü. Düzeltme: o komutun çıktısı artık
  `>&2` ile stderr'e yönlendiriliyor.

## Kalan boşluklar

- ~~Dispute döngüsü yok~~ — Faz 1.5'te eklendi (`initiate_dispute`, `submit_offer`,
  `submit_final_offer`, `arbitrator_decide`, `official_ruling`); güncel deploy'da var.
- ~~`MockVault` hâlâ mock~~ — Faz 2.1'de gerçek DeFindex entegrasyonuna geçildi (bkz.
  yukarıdaki "DeFindex Entegrasyon Kanıtı"); `deposit`/`settle_undisputed`/
  `initiate_dispute` artık DeFindex'in testnet kasasına gerçek cross-contract call
  yapıyor.
- `soroswap_router` hâlâ rastgele üretilmiş bir test adresi — Soroswap entegrasyonu
  (CLAUDE.md'nin zorunlu MVP listesindeki madde 3) henüz yapılmadı, kontrat bu adresi
  şu an hiç kullanmıyor. Gerçek Soroswap router adresi belirlenince kontrat yeniden
  `initialize` edilmemeli (tek seferlik) — doğru adresle **yeni bir deploy** yapılıp bu
  dosya güncellenmeli.
- Anchor entegrasyonu (SEP-6/24 gerçek ya da protokolü tam uygulayan simüle anchor)
  henüz yok.
- Otomatik delil paketi export'u ve hakem paneli UI'ı hâlâ yok — CLAUDE.md'nin "zaman
  kalırsa" listesinde, en düşük öncelikli maddeler.
