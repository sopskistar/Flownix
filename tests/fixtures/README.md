# Fixtures and provenance

No successful live Binance registry or chain-log recording was obtained on 2026-11-15. Do not describe the fixtures below as recorded live data.

`alpha-doc-example.json` is a small schema fixture adapted from Binance's official Token List and exchange-info documentation, checked 2026-11-15. Its token row is an official documentation example; it does not prove current membership. Extra chain/collision rows in tests are synthetic. Source: https://developers.binance.com/en/docs/catalog/advanced-trading-alpha-trading/api/rest-api/market-data

All other test event logs, candles, wallets, purchase histories and 450-row universes are explicitly synthetic. They live only in the test process or an isolated test database, never in the production dashboard. Tests exercise positive and negative detections; no fixture is trading evidence.

For a real future recording: `pnpm providers:smoke` writes ignored artifacts/smoke with exact payloads, observation time and provider error report. Review provider terms before redistributing snapshots; no blanket public-data redistribution license is assumed. Commit only a minimal redacted recording with a manifest of checked date, source URL, SHA-256 and observed schema.
