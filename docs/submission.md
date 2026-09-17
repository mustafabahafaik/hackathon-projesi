# Submission — escrow kontratı, testnet deploy

Bu dosya `contracts/escrow`'un testnet deploy geçmişini ve doğrulama kanıtını tutar.
Hackathon submission formuna girilecek kontrat ID buradaki **güncel deploy**'dur.

## Güncel deploy

| | |
| --- | --- |
| Ağ | Stellar Testnet |
| Contract ID | `CBA4FFYLQAMOC5JAHATW3YK67OZQN3KQC2KACXZCB66T6Q5LHQ5VERXQ` |
| Wasm hash | `237a6709c26f3ffe423af6fed4911ad04d9d30d66c422868c09872471b7e2d02` |
| Deploy tx | https://stellar.expert/explorer/testnet/tx/db342b9dd186ce4d5a87dafaf8604625b820c5573243a841d598d0a3f3cc99cf |
| Deploy eden hesap | `GCSMWDEADCNWD6MZPDSRU5NPUSD7RPU2BQIFVQDOAU4QQQTSKEHKDY4M` (alias `deployer`) |
| Deploy tarihi | 2026-09-18 |
| Kontrat sürümü | `initialize`, `create_lease`, `deposit`, `record_photo_hash`, `settle_undisputed`, `get_lease` — dispute döngüsü henüz yok |

Kontratı yeniden deploy etmek için: `scripts/deploy-testnet.sh [alias]`. Script tekrar
çalıştırılabilir — `deployer` kimliği ve testnet fonlaması zaten varsa yeniden kullanılır.

## Smoke test kanıtı

`scripts/smoke-test-testnet.sh <CONTRACT_ID>` yukarıdaki kontrata karşı gerçek zincir
çağrılarıyla çalıştırıldı (`initialize` → `create_lease` → `get_lease` → `deposit` →
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

### Bilinen basitleştirme: `usdc_token` yerine native XLM SAC

Smoke test'te `usdc_token` olarak gerçek testnet USDC yerine native XLM'nin Stellar
Asset Contract'ı (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`) kullanıldı
— gerçek testnet USDC edinmek ya da kendi test varlığımızı issuer + trustline ile kurmak
bu adımın kapsamını aşıyordu. Kod yolu (SEP-41 `token.transfer`) birebir aynı; production'da
`initialize()`'a gerçek USDC SAC adresi verilecek. Bu, README'de ve `.env.example`'da da
belirtilmeli.

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

## Kalan boşluklar

- Dispute döngüsü (`initiate_dispute`, `submit_offer`, `submit_final_offer`,
  `arbitrator_decide`, `official_ruling`) henüz yok — CLAUDE.md'nin "zaman kalırsa"
  listesinde.
- `MockVault` hâlâ mock (Faz 2, gerçek DeFindex entegrasyonu bekliyor) — `deposit`/
  `settle_undisputed` bunu açıkça yorumla işaretliyor.
- `initialize()`'daki `defindex_vault`/`soroswap_router` adresleri bu smoke test'te
  rastgele üretilmiş test adresleri; gerçek DeFindex/Soroswap kontrat adresleri
  belirlenince kontrat yeniden `initialize` edilmemeli (tek seferlik) — bunun yerine
  doğru adreslerle **yeni bir deploy** yapılıp bu dosya güncellenmeli.
