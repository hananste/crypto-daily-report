# Daily Crypto & BTC Report

Frosted-glass dashboard. Public market data only, no keys or secrets.

- **Live in browser (every 60s):** BTC price, candles and 24h stats (Coinbase); funding, OI and liquidation sample (OKX); Fear & Greed (alternative.me); market cap, dominance and top 10 (CoinGecko).
- **GitHub Action, every 15 min (`data/latest.json`):** sectors, stablecoin supply (DefiLlama), support/resistance, and fallbacks for everything above. Derivatives try Binance, then Bybit, then OKX.
- **GitHub Action, daily at 11:00 UTC (7 AM EDT / 6 AM EST):** `data/report_YYYY-MM-DD.json` with "what changed" compared to the previous daily report.
- Spot BTC ETF flows: unavailable (no free, key-less, reliable source).
- Macro calendar: hand-maintained in `macro_calendar.json`.

Run locally: `./run.sh` → http://127.0.0.1:8790/
