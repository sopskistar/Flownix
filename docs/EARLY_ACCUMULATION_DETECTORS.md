# Early accumulation detector status

The current implementation remains deliberately conservative. Existing experimental modules provide continuous transfer-ledger reconciliation, verified Pancake V3 swap interpretation on one BSC factory, lower-bound purchase retention, cautious exchange-label flow, possible short-round-trip flags, and an experimental long-term thesis evaluator. They are not a broad Alpha-wide accumulation service.

| Detector | Current implemented evidence | Status / limits |
|---|---|---|
| Persistent supply absorption | Verified actor-attributed Pancake V3 buys plus observed outgoing transfers and sampled balances | Experimental; few receipts, no multiweek history, unknown entity independence. Ordinary transfers never count as purchases. |
| Exchange outflow and retention | Time-valid manually sourced labels and canonical transfers | No independently verified Binance/Bitget address registry. Label coverage partial. Do not call this total exchange flow. |
| Fresh-wallet cluster | Wallet first activity and observed transfer graph are available as primitives | Detector not yet implemented; shared funding/timing cannot prove control. |
| Top-holder concentration | No complete historic top-holder snapshots | Unavailable. Transfers discover observed wallets only; aggregate Alpha `holders` is not a leaderboard. |
| Cross-token wallet reappearance | Exact chain + address joins can be computed from existing ledgers | Coverage limited to scanned tokens/windows; not yet a validated cluster or entity feature. |
| Shakeout survival | Price candles and sampled balances can support a later point-in-time study | Not operational; balance sampling is sparse and not a complete position ledger. |
| Re-accumulation | Existing thesis state history supports research annotations | No verified full-cycle signal. A higher balance alone is not an acquisition. |
| Distribution / invalidation | Existing thesis can retain manual invalidation and transfer risk evidence | Automatic broad distribution detector not operational. No exchange ownership census. |

New automatic transfer-activity alerts additionally require owner-reviewed `verified_non_meme` project classification with a cited URL and rationale. This classification is not a wallet label and does not certify token quality.

## Experimental signal conditions

The existing `long-term-thesis/1` rules use observed purchase ledgers, coverage/freshness checks, multiple observation periods, retention lower bounds, quiet-price context and contradictory flow. The thresholds are experiment defaults, not calibrated probabilities. Missing wallet evidence suppresses the numerical conclusion. Outgoing transfers conservatively reduce the retention lower bound; mint, bridge, LP, treasury and custody interpretations need explicit evidence. No claim of 7–180-day live coverage can be made from the current sparse windows.
