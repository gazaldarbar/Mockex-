# Roadmap
1. **Cloud sync + accounts** — wire `backend/schema.sql` (Supabase email/password + optional Google), secure token storage in Android Keystore, conflict-free account sync, real leaderboard.
2. **Push notifications** — server-side alert evaluation (Edge Function) with FCM so alerts fire when the app is closed.
3. **AI trade analysis** — post-trade review from journal + trade data: pattern detection (revenge trades, oversizing), weekly coach report, explain-this-chart.
4. **Social trading** — follow public (opt-in) traders, reactions on shared trade cards, weekly competitions and seasons.
5. **Copy trading (simulated)** — mirror a followed trader's paper trades into your own account with your sizing rules.
6. **Options data** — read-only options chains and implied volatility, then paper options with greeks.
7. **Multi-exchange support** — pluggable feed adapters (Bybit, OKX, Coinbase) behind the existing `Feed` interface, with best-price routing in the simulator.
8. **Real exchange Testnet** — optional Binance Spot Testnet / Futures Testnet execution (never mainnet) through a server proxy so keys never touch the app.
9. **Native glass** — Android native module with GPU blur and an AGSL refraction shader for Android 13+.
10. **Richer simulation** — order-book-aware fills, partial fills, funding rates, cross-margin, portfolio margin.
