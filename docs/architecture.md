# Mimari notlar

Tam mimari doküman (sistem diyagramı, sözleşme fonksiyonları, storage tipleri, entegrasyon
detayları): https://claude.ai/artifact/CcvGabPfhBN7FkJR8kNDjv — bu dosya sadece dokümandan
sapılan noktaların kısa gerekçesini tutar (`CLAUDE.md` kural 10). Diğer sapmalar için
`CLAUDE.md` → "Bilinen Tasarım Sapmaları"na bakın.

## Anchor entegrasyonu — stub yolu seçildi

`apps/api/src/services/anchor-integration` gerçek bir testnet TRY anchor'ı yerine
`apps/anchor-stub`'a (SEP-1/6/10/12/24/38'i eksiksiz uygulayan, sadece banka transferini
simüle eden ayrı bir servis) bağlanıyor — Workshop #3'te kullanılabilir bir anchor netleşmedi;
`ANCHOR_HOME_DOMAIN` değiştirilerek kod değişikliği gerekmeden gerçek bir anchor'a geçilebilir
(bkz. `.env.example`).
